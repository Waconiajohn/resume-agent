import { useState, useCallback, useRef, useEffect } from 'react';
import { parseSSEStream } from '@/lib/sse-parser';
import { API_BASE } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { safeNumber, safeString, safeStringArray } from '@/lib/safe-cast';

import type { ActivityMessage } from '@/types/activity';

export type { ActivityMessage };
export type LinkedInOptimizerStatus = 'idle' | 'connecting' | 'running' | 'complete' | 'error';

export interface LinkedInAuditReport {
  positioning_summary: {
    core_identity: string;
    value_proposition: string;
    differentiators: string[];
    target_market_fit: string;
  };
  audit_scores: {
    five_second_test: number;
    headline_strength: number;
    about_hook_strength: number;
    proof_strength: number;
    differentiation_strength: number;
    executive_presence: number;
    keyword_effectiveness: number;
    overall_score: number;
  };
  diagnostic_findings: {
    what_is_working: string[];
    what_is_weak: string[];
    what_is_missing: string[];
    where_profile_undersells_candidate: string[];
  };
  headline_recommendations: {
    options: Array<{ label: string; headline: string; why_it_works: string }>;
    recommended_headline: string;
    recommended_headline_rationale: string;
  };
  about_section_rewrite: {
    five_second_hook_analysis: string;
    recommended_opening: string;
    full_rewritten_about: string;
  };
  experience_alignment: {
    resume_strengths_to_surface_more: string[];
    claims_that_need_stronger_proof: string[];
    recommended_experience_reframing: string[];
  };
  skills_and_featured_recommendations: {
    top_skills_to_pin: string[];
    skills_to_add_or_emphasize: string[];
    featured_section_recommendations: string[];
  };
  final_benchmark_assessment: {
    benchmark_candidate_summary: string;
    confidence: number;
    key_caveats: string[];
  };
}

export interface ExperienceEntry {
  role_id: string;
  company: string;
  title: string;
  duration: string;
  original: string;
  optimized: string;
  quality_scores: {
    impact: number;
    metrics: number;
    context: number;
    keywords: number;
  };
}

interface LinkedInOptimizerState {
  status: LinkedInOptimizerStatus;
  report: string | null;
  qualityScore: number | null;
  auditReport: LinkedInAuditReport | null;
  experienceEntries: ExperienceEntry[];
  activityMessages: ActivityMessage[];
  error: string | null;
  currentStage: string | null;
}

export interface LinkedInOptimizerInput {
  resumeText: string;
  linkedinHeadline?: string;
  linkedinAbout?: string;
  linkedinExperience?: string;
  targetRole?: string;
  targetIndustry?: string;
  jobApplicationId?: string;
}

const MAX_RECONNECT_ATTEMPTS = 3;
const MAX_ACTIVITY_MESSAGES = 30;

function sanitizeAuditReport(value: unknown): LinkedInAuditReport | null {
  if (!value || typeof value !== 'object') return null;
  const r = value as Record<string, unknown>;

  const ps = (r.positioning_summary as Record<string, unknown> | null | undefined) ?? {};
  const as_ = (r.audit_scores as Record<string, unknown> | null | undefined) ?? {};
  const df = (r.diagnostic_findings as Record<string, unknown> | null | undefined) ?? {};
  const hr = (r.headline_recommendations as Record<string, unknown> | null | undefined) ?? {};
  const ab = (r.about_section_rewrite as Record<string, unknown> | null | undefined) ?? {};
  const ea = (r.experience_alignment as Record<string, unknown> | null | undefined) ?? {};
  const sk = (r.skills_and_featured_recommendations as Record<string, unknown> | null | undefined) ?? {};
  const fb = (r.final_benchmark_assessment as Record<string, unknown> | null | undefined) ?? {};

  const rawOptions = Array.isArray(hr.options) ? hr.options : [];
  const options = rawOptions.map((o: unknown) => {
    const opt = (o as Record<string, unknown> | null) ?? {};
    return {
      label: safeString(opt.label),
      headline: safeString(opt.headline),
      why_it_works: safeString(opt.why_it_works),
    };
  });

  return {
    positioning_summary: {
      core_identity: safeString(ps.core_identity),
      value_proposition: safeString(ps.value_proposition),
      differentiators: safeStringArray(ps.differentiators),
      target_market_fit: safeString(ps.target_market_fit),
    },
    audit_scores: {
      five_second_test: safeNumber(as_.five_second_test),
      headline_strength: safeNumber(as_.headline_strength),
      about_hook_strength: safeNumber(as_.about_hook_strength),
      proof_strength: safeNumber(as_.proof_strength),
      differentiation_strength: safeNumber(as_.differentiation_strength),
      executive_presence: safeNumber(as_.executive_presence),
      keyword_effectiveness: safeNumber(as_.keyword_effectiveness),
      overall_score: safeNumber(as_.overall_score),
    },
    diagnostic_findings: {
      what_is_working: safeStringArray(df.what_is_working),
      what_is_weak: safeStringArray(df.what_is_weak),
      what_is_missing: safeStringArray(df.what_is_missing),
      where_profile_undersells_candidate: safeStringArray(df.where_profile_undersells_candidate),
    },
    headline_recommendations: {
      options,
      recommended_headline: safeString(hr.recommended_headline),
      recommended_headline_rationale: safeString(hr.recommended_headline_rationale),
    },
    about_section_rewrite: {
      five_second_hook_analysis: safeString(ab.five_second_hook_analysis),
      recommended_opening: safeString(ab.recommended_opening),
      full_rewritten_about: safeString(ab.full_rewritten_about),
    },
    experience_alignment: {
      resume_strengths_to_surface_more: safeStringArray(ea.resume_strengths_to_surface_more),
      claims_that_need_stronger_proof: safeStringArray(ea.claims_that_need_stronger_proof),
      recommended_experience_reframing: safeStringArray(ea.recommended_experience_reframing),
    },
    skills_and_featured_recommendations: {
      top_skills_to_pin: safeStringArray(sk.top_skills_to_pin),
      skills_to_add_or_emphasize: safeStringArray(sk.skills_to_add_or_emphasize),
      featured_section_recommendations: safeStringArray(sk.featured_section_recommendations),
    },
    final_benchmark_assessment: {
      benchmark_candidate_summary: safeString(fb.benchmark_candidate_summary),
      confidence: Math.max(0, Math.min(1, Number(fb.confidence ?? 0.7))),
      key_caveats: safeStringArray(fb.key_caveats),
    },
  };
}

function sanitizeExperienceEntry(value: unknown): ExperienceEntry | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;

  return {
    role_id: safeString(candidate.role_id),
    company: safeString(candidate.company),
    title: safeString(candidate.title),
    duration: safeString(candidate.duration),
    original: safeString(candidate.original),
    optimized: safeString(candidate.optimized),
    quality_scores: {
      impact: safeNumber((candidate.quality_scores as Record<string, unknown> | null | undefined)?.impact),
      metrics: safeNumber((candidate.quality_scores as Record<string, unknown> | null | undefined)?.metrics),
      context: safeNumber((candidate.quality_scores as Record<string, unknown> | null | undefined)?.context),
      keywords: safeNumber((candidate.quality_scores as Record<string, unknown> | null | undefined)?.keywords),
    },
  };
}

function sanitizeExperienceEntries(value: unknown): ExperienceEntry[] | null {
  if (!Array.isArray(value)) return null;

  return value
    .map((entry) => sanitizeExperienceEntry(entry))
    .filter((entry): entry is ExperienceEntry => entry !== null);
}

export function useLinkedInOptimizer() {
  const [state, setState] = useState<LinkedInOptimizerState>({
    status: 'idle',
    report: null,
    qualityScore: null,
    auditReport: null,
    experienceEntries: [],
    activityMessages: [],
    error: null,
    currentStage: null,
  });

  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const statusRef = useRef(state.status);
  statusRef.current = state.status;
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const accessTokenRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
    };
  }, []);

  const addActivity = useCallback((text: string, stage: string) => {
    if (!mountedRef.current) return;
    setState((prev) => ({
      ...prev,
      activityMessages: [
        ...prev.activityMessages.slice(-(MAX_ACTIVITY_MESSAGES - 1)),
        { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, message: text, stage, timestamp: Date.now() },
      ],
    }));
  }, []);

  const handleSSEEvent = useCallback(
    (eventType: string, rawData: string) => {
      if (!mountedRef.current) return;

      let data: Record<string, unknown>;
      try {
        data = JSON.parse(rawData) as Record<string, unknown>;
      } catch {
        return;
      }

      switch (eventType) {
        case 'stage_start':
          setState((prev) => ({ ...prev, currentStage: safeString(data.stage) }));
          addActivity(safeString(data.message), safeString(data.stage));
          break;

        case 'stage_complete':
          addActivity(safeString(data.message), safeString(data.stage));
          break;

        case 'transparency':
          addActivity(safeString(data.message), safeString(data.stage));
          break;

        case 'section_progress': {
          const section = safeString(data.section);
          const progressStatus = safeString(data.status);
          if (progressStatus === 'writing') {
            addActivity(`Writing: ${section}`, 'writing');
          } else if (progressStatus === 'reviewing') {
            addActivity(`Reviewing: ${section}`, 'writing');
          } else if (progressStatus === 'complete') {
            addActivity(`Complete: ${section}`, 'writing');
          }
          break;
        }

        case 'report_complete':
          setState((prev) => ({
            ...prev,
            status: 'complete',
            report: safeString(data.report) || prev.report,
            qualityScore:
              data.quality_score == null ? prev.qualityScore : safeNumber(data.quality_score, prev.qualityScore ?? 0),
            experienceEntries: sanitizeExperienceEntries(data.experience_entries) ?? prev.experienceEntries,
            auditReport: sanitizeAuditReport(data.audit_report) ?? prev.auditReport,
          }));
          abortRef.current?.abort();
          break;

        case 'pipeline_error':
          setState((prev) => ({
            ...prev,
            status: 'error',
            error: safeString(data.error, 'Pipeline error'),
          }));
          abortRef.current?.abort();
          break;

        case 'pipeline_complete':
          setState((prev) => ({
            ...prev,
            status: prev.report ? 'complete' : prev.status,
          }));
          abortRef.current?.abort();
          break;

        case 'heartbeat':
          break;

        default:
          break;
      }
    },
    [addActivity],
  );

  const connectSSE = useCallback(
    (sessionId: string) => {
      const token = accessTokenRef.current;
      if (!token) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState((prev) => ({ ...prev, status: 'connecting' }));

      fetch(`${API_BASE}/linkedin-optimizer/${sessionId}/stream`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok || !response.body) {
            if (mountedRef.current) {
              setState((prev) => ({
                ...prev,
                status: 'error',
                error: `Connection failed (${response.status})`,
              }));
            }
            return;
          }

          if (mountedRef.current) {
            setState((prev) => ({ ...prev, status: 'running' }));
            reconnectAttemptsRef.current = 0;
          }

          try {
            for await (const msg of parseSSEStream(response.body)) {
              if (controller.signal.aborted) break;
              handleSSEEvent(msg.event, msg.data);
            }
          } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') return;
            console.error('[useLinkedInOptimizer] SSE stream error:', err);
          }

          if (!controller.signal.aborted && mountedRef.current) {
            setState((prev) => {
              if (prev.status === 'complete' || prev.status === 'error') return prev;
              if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
                const delay = Math.pow(2, reconnectAttemptsRef.current) * 1000;
                reconnectAttemptsRef.current += 1;
                reconnectTimerRef.current = setTimeout(() => {
                  if (mountedRef.current && sessionIdRef.current) {
                    connectSSE(sessionIdRef.current);
                  }
                }, delay);
                return prev;
              }
              return { ...prev, status: 'error', error: 'Connection lost' };
            });
          }
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          console.error('[useLinkedInOptimizer] SSE fetch error:', err);
          if (mountedRef.current) {
            setState((prev) => ({
              ...prev,
              status: 'error',
              error: 'Failed to connect',
            }));
          }
        });
    },
    [handleSSEEvent],
  );

  const startPipeline = useCallback(
    async (input: LinkedInOptimizerInput): Promise<boolean> => {
      if (statusRef.current !== 'idle') return false;
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? null;
      if (!token) {
        setState((prev) => ({ ...prev, status: 'error', error: 'Not authenticated' }));
        return false;
      }
      accessTokenRef.current = token;

      const sessionId = crypto.randomUUID();
      sessionIdRef.current = sessionId;
      reconnectAttemptsRef.current = 0;

      setState({
        status: 'connecting',
        report: null,
        qualityScore: null,
        auditReport: null,
        experienceEntries: [],
        activityMessages: [],
        error: null,
        currentStage: null,
      });

      try {
        const res = await fetch(`${API_BASE}/linkedin-optimizer/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            session_id: sessionId,
            resume_text: input.resumeText,
            linkedin_headline: input.linkedinHeadline,
            linkedin_about: input.linkedinAbout,
            linkedin_experience: input.linkedinExperience,
            target_role: input.targetRole,
            target_industry: input.targetIndustry,
            job_application_id: input.jobApplicationId,
          }),
        });

        if (!res.ok) {
          const body = await res.text();
          setState((prev) => ({
            ...prev,
            status: 'error',
            error: `Failed to start (${res.status}): ${body}`,
          }));
          return false;
        }

        connectSSE(sessionId);
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setState((prev) => ({ ...prev, status: 'error', error: message }));
        return false;
      }
    },
    [connectSSE],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    sessionIdRef.current = null;
    accessTokenRef.current = null;
    reconnectAttemptsRef.current = 0;
    setState({
      status: 'idle',
      report: null,
      qualityScore: null,
      auditReport: null,
      experienceEntries: [],
      activityMessages: [],
      error: null,
      currentStage: null,
    });
  }, []);

  return {
    ...state,
    startPipeline,
    reset,
  };
}
