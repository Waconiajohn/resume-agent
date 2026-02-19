/**
 * Agent 3: Research Agent
 *
 * Consolidates 4 former tools (analyze_jd, research_company, research_industry,
 * build_benchmark) into a single agent call. Runs automatically — no user interaction.
 *
 * Uses MODEL_LIGHT for JD analysis + Perplexity for company research + MODEL_MID for benchmark.
 */

import { llm, MODEL_LIGHT, MODEL_MID } from '../lib/llm.js';
import { queryWithFallback } from '../lib/perplexity.js';
import { repairJSON } from '../lib/json-repair.js';
import type {
  ResearchInput,
  ResearchOutput,
  JDAnalysis,
  CompanyResearch,
  BenchmarkCandidate,
  IntakeOutput,
} from './types.js';

const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const MAX_JD_CACHE_ENTRIES = parsePositiveInt(process.env.RESEARCH_JD_CACHE_MAX, 400);
const MAX_COMPANY_CACHE_ENTRIES = parsePositiveInt(process.env.RESEARCH_COMPANY_CACHE_MAX, 300);
const MAX_BENCHMARK_CACHE_ENTRIES = parsePositiveInt(process.env.RESEARCH_BENCHMARK_CACHE_MAX, 400);

type CacheValue<T> = { value: T; expiresAt: number };
const jdCache = new Map<string, { value: JDAnalysis; expiresAt: number }>();
const companyCache = new Map<string, { value: CompanyResearch; expiresAt: number }>();
const benchmarkCache = new Map<string, { value: BenchmarkCandidate; expiresAt: number }>();

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function pruneCache<T>(cache: Map<string, CacheValue<T>>, maxEntries: number): void {
  if (cache.size === 0) return;
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (now >= entry.expiresAt) {
      cache.delete(key);
    }
  }
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
}

function getCached<T>(cache: Map<string, CacheValue<T>>, key: string): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() >= hit.expiresAt) {
    cache.delete(key);
    return null;
  }
  // Refresh recency so old hot keys do not get evicted during backpressure trimming.
  cache.delete(key);
  cache.set(key, hit);
  return hit.value;
}

function setCached<T>(cache: Map<string, CacheValue<T>>, key: string, value: T, maxEntries: number): void {
  pruneCache(cache, maxEntries);
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

const cacheCleanupTimer = setInterval(() => {
  pruneCache(jdCache, MAX_JD_CACHE_ENTRIES);
  pruneCache(companyCache, MAX_COMPANY_CACHE_ENTRIES);
  pruneCache(benchmarkCache, MAX_BENCHMARK_CACHE_ENTRIES);
}, CACHE_CLEANUP_INTERVAL_MS);
cacheCleanupTimer.unref();

/**
 * Run the Research Agent: analyze JD, research company, build benchmark.
 * All three operations run in parallel where possible.
 */
export async function runResearchAgent(input: ResearchInput): Promise<ResearchOutput> {
  // Step 1: JD analysis and company research can run in parallel
  const [jd_analysis, company_research] = await Promise.all([
    analyzeJobDescription(input.job_description),
    researchCompany(input.company_name, input.job_description),
  ]);

  // Step 2: Benchmark needs both JD and company research as input
  const benchmark_candidate = await buildBenchmark(jd_analysis, company_research, input.parsed_resume);

  return {
    jd_analysis,
    company_research,
    benchmark_candidate,
  };
}

// ─── JD Analysis (MODEL_LIGHT) ───────────────────────────────────────

async function analyzeJobDescription(jobDescription: string): Promise<JDAnalysis> {
  const jd = jobDescription.slice(0, 30_000);
  const cacheKey = `${jd.slice(0, 200).trim().toLowerCase()}::${jd.length}`;
  const cached = getCached(jdCache, cacheKey);
  if (cached) return cached;

  const response = await llm.chat({
    model: MODEL_LIGHT,
    max_tokens: 4096,
    system: `Parse job descriptions into structured requirements. Be thorough — capture EVERYTHING a hiring manager would screen for, including implicit requirements. Return ONLY valid JSON with this exact shape:
{
  "role_title": "The exact job title",
  "company": "The company name",
  "seniority_level": "entry | mid | senior | executive",
  "must_haves": ["Explicit hard requirements — things that would disqualify if missing"],
  "nice_to_haves": ["Stated preferences, bonus qualifications"],
  "implicit_requirements": ["Unstated requirements inferred from language, context, or industry norms"],
  "language_keywords": ["Exact words and phrases from the JD that should appear on the resume"]
}`,
    messages: [{
      role: 'user',
      content: `JOB DESCRIPTION:\n${jd}`,
    }],
  });

  const parsed = repairJSON<Record<string, unknown>>(response.text);
  if (!parsed) {
    return {
      role_title: 'Unknown',
      company: '',
      seniority_level: 'mid',
      must_haves: [],
      nice_to_haves: [],
      implicit_requirements: [],
      language_keywords: [],
    };
  }

  // Map seniority_level to our enum
  const rawSeniority = String(parsed.seniority_level ?? 'mid').toLowerCase();
  const seniority_level = (['entry', 'mid', 'senior', 'executive'].includes(rawSeniority)
    ? rawSeniority
    : rawSeniority.includes('director') || rawSeniority.includes('vp') || rawSeniority.includes('c-level')
      ? 'executive'
      : rawSeniority.includes('senior') || rawSeniority.includes('staff')
        ? 'senior'
        : 'mid') as JDAnalysis['seniority_level'];

  const normalized = {
    role_title: String(parsed.role_title ?? 'Unknown'),
    company: String(parsed.company ?? ''),
    seniority_level,
    must_haves: (parsed.must_haves as string[]) ?? [],
    nice_to_haves: (parsed.nice_to_haves as string[]) ?? [],
    implicit_requirements: (parsed.implicit_requirements as string[]) ?? [],
    language_keywords: (parsed.language_keywords as string[]) ?? [],
  };
  setCached(jdCache, cacheKey, normalized, MAX_JD_CACHE_ENTRIES);
  return normalized;
}

// ─── Company Research (Perplexity + fallback) ────────────────────────

async function researchCompany(companyName: string, jobDescription: string): Promise<CompanyResearch> {
  if (!companyName.trim()) {
    return { company_name: '', industry: '', size: '', culture_signals: [] };
  }
  const jdSnippet = jobDescription.slice(0, 200).trim().toLowerCase();
  const cacheKey = `${companyName.trim().toLowerCase()}::${jdSnippet}::${jobDescription.length}`;
  const cached = getCached(companyCache, cacheKey);
  if (cached) return cached;

  const prompt = `Research ${companyName} as a potential employer. I need:
1. What industry are they in and approximately how large are they?
2. What is their company culture like?
3. What values do they emphasize?
4. How do they communicate externally (formal, casual, technical)?
5. Any recent major news or developments?

Be specific and factual. If you're not sure about something, say so.`;

  const systemMsg = 'You are a company research analyst. Return concise, factual information.';

  const text = await queryWithFallback(
    'research-agent',
    [
      { role: 'system', content: systemMsg },
      { role: 'user', content: prompt },
    ],
    {
      system: `${systemMsg} Note: answering from training data, not live search.`,
      prompt,
    },
  );

  // Extract structured signals from free-text research
  const culturePhrases = extractSignals(text, [
    'culture', 'values', 'mission', 'work environment', 'team',
    'collaboration', 'innovation', 'diversity', 'inclusion',
  ]);

  const normalized = {
    company_name: companyName,
    industry: extractFirstSentenceAbout(text, ['industry', 'sector', 'space']) ?? '',
    size: extractFirstSentenceAbout(text, ['employees', 'size', 'headcount', 'revenue']) ?? '',
    culture_signals: culturePhrases,
  };
  setCached(companyCache, cacheKey, normalized, MAX_COMPANY_CACHE_ENTRIES);
  return normalized;
}

// ─── Benchmark Candidate (MODEL_MID) ────────────────────────────────

async function buildBenchmark(
  jd: JDAnalysis,
  company: CompanyResearch,
  resume: IntakeOutput,
): Promise<BenchmarkCandidate> {
  const cacheKey = buildBenchmarkCacheKey(jd, company, resume);
  const cached = getCached(benchmarkCache, cacheKey);
  if (cached) return cached;

  const response = await llm.chat({
    model: MODEL_MID,
    max_tokens: 3072,
    system: `You are a talent benchmark analyst. Synthesize a Benchmark Candidate Profile for a job role. Return ONLY valid JSON with this exact shape:
{
  "ideal_profile": "2-3 sentence description of the perfect candidate",
  "language_keywords": ["Exact words/phrases the resume should echo from the JD and industry"],
  "section_expectations": {
    "summary": "What the summary should convey",
    "experience": "What experience bullets should emphasize",
    "skills": "How skills should be organized/prioritized"
  }
}`,
    messages: [{
      role: 'user',
      content: `ROLE: ${jd.role_title} at ${jd.company || company.company_name}
SENIORITY: ${jd.seniority_level}
MUST-HAVES: ${jd.must_haves.join(', ') || 'None specified'}
NICE-TO-HAVES: ${jd.nice_to_haves.join(', ') || 'None specified'}
IMPLICIT: ${jd.implicit_requirements.join(', ') || 'None identified'}
COMPANY CULTURE: ${company.culture_signals.join('; ') || 'Unknown'}
INDUSTRY: ${company.industry || 'Unknown'}`,
    }],
  });

  const parsed = repairJSON<Record<string, unknown>>(response.text);
  if (!parsed) {
    return {
      ideal_profile: '',
      language_keywords: jd.language_keywords,
      section_expectations: {},
    };
  }

  const normalized = {
    ideal_profile: String(parsed.ideal_profile ?? ''),
    language_keywords: [
      ...(parsed.language_keywords as string[] ?? []),
      ...jd.language_keywords,
    ].filter((v, i, a) => a.indexOf(v) === i), // dedupe
    section_expectations: (parsed.section_expectations as Record<string, string>) ?? {},
  };
  setCached(benchmarkCache, cacheKey, normalized, MAX_BENCHMARK_CACHE_ENTRIES);
  return normalized;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function hashString(input: string): string {
  // FNV-1a 32-bit hash for compact deterministic cache keys.
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

function buildBenchmarkCacheKey(jd: JDAnalysis, company: CompanyResearch, resume: IntakeOutput): string {
  const raw = JSON.stringify({
    jd: {
      role_title: jd.role_title,
      company: jd.company,
      seniority_level: jd.seniority_level,
      must_haves: jd.must_haves.slice(0, 25),
      implicit_requirements: jd.implicit_requirements.slice(0, 20),
      language_keywords: jd.language_keywords.slice(0, 30),
    },
    company: {
      company_name: company.company_name,
      industry: company.industry,
      size: company.size,
      culture_signals: company.culture_signals.slice(0, 8),
    },
    resume: {
      skills: resume.skills.slice(0, 40),
      titles: resume.experience.slice(0, 6).map((e) => `${e.title}:${e.company}`),
    },
  });
  return `${hashString(raw)}:${raw.length}`;
}

function extractSignals(text: string, keywords: string[]): string[] {
  const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
  return sentences
    .filter(s => keywords.some(kw => s.toLowerCase().includes(kw)))
    .slice(0, 8)
    .map(s => s.length > 150 ? s.slice(0, 147) + '...' : s);
}

function extractFirstSentenceAbout(text: string, keywords: string[]): string | null {
  const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
  const match = sentences.find(s => keywords.some(kw => s.toLowerCase().includes(kw)));
  return match ? (match.length > 200 ? match.slice(0, 197) + '...' : match) : null;
}
