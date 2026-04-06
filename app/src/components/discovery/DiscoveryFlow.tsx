import { useReducer, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useDiscovery } from '@/hooks/useDiscovery';
import { GlassButton } from '@/components/GlassButton';
import { GlassCard } from '@/components/GlassCard';
import { DropZone } from './DropZone';
import { ProcessingReveal } from './ProcessingReveal';
import { ExcavationConversation } from './ExcavationConversation';
import { CareerIQProfileScreen } from './CareerIQProfileScreen';
import { API_BASE } from '@/lib/api';
import type {
  DiscoveryOutput,
  CareerIQProfile,
  LiveResumeState,
  ResumeUpdate,
} from '@/types/discovery';

// ─── Types ───────────────────────────────────────────────────────────────────

type DiscoveryScreen = 'drop_zone' | 'processing' | 'conversation' | 'building_profile' | 'profile';
type ProfileCheck = 'loading' | 'has_profile' | 'no_profile';

interface DiscoveryState {
  screen: DiscoveryScreen;
  profileCheck: ProfileCheck;
  resumeText: string | null;
  jobText: string | null;
  sessionId: string | null;
  discovery: DiscoveryOutput | null;
  excavationComplete: boolean;
  profileFetchFailed: boolean;
  profile: CareerIQProfile | null;
  liveResume: LiveResumeState | null;
  highlightedSections: string[];
  processingStage: { stage: string; message: string } | null;
  error: string | null;
}

type DiscoveryAction =
  | { type: 'START_ANALYSIS'; resumeText: string; jobText: string }
  | { type: 'ANALYSIS_COMPLETE'; sessionId: string; discovery: DiscoveryOutput; liveResume: LiveResumeState }
  | { type: 'ANALYSIS_ERROR'; error: string }
  | { type: 'APPLY_RESUME_UPDATES'; updates: ResumeUpdate[] }
  | { type: 'EXCAVATION_COMPLETE' }
  | { type: 'PROFILE_READY'; profile: CareerIQProfile }
  | { type: 'PROFILE_ERROR'; error: string }
  | { type: 'RETRY_PROFILE' }
  | { type: 'SET_PROCESSING_STAGE'; stage: string; message: string }
  | { type: 'SET_PROFILE_CHECK'; check: ProfileCheck }
  | { type: 'SET_ERROR'; error: string }
  | { type: 'CLEAR_ERROR' };

// ─── Profile synthesis helper (Gap 12) ───────────────────────────────────────

function applyProfileSynthesis(resume: LiveResumeState, profile: CareerIQProfile): LiveResumeState {
  let updated = { ...resume };

  // Replace summary with career thread
  if (profile.career_thread) {
    updated = { ...updated, summary: profile.career_thread };
  }

  // Highlight bullets that match evidence from exceptional_areas and role_fit_points
  const allEvidence = [
    ...profile.exceptional_areas.map(a => a.evidence),
    ...profile.role_fit_points.map(p => p.evidence),
  ].filter(Boolean);

  if (allEvidence.length > 0) {
    updated = {
      ...updated,
      experience: updated.experience.map(exp => ({
        ...exp,
        bullets: exp.bullets.map(b => {
          const bulletLower = b.text.toLowerCase();
          const matchesEvidence = allEvidence.some(evidence => {
            const evidenceLower = evidence.toLowerCase();
            // Try 3-word sliding window
            const words = evidenceLower.split(/\s+/).filter(w => w.length > 3);
            for (let i = 0; i <= words.length - 3; i++) {
              const phrase = words.slice(i, i + 3).join(' ');
              if (bulletLower.includes(phrase)) return true;
            }
            // Fallback: check for significant keywords (6+ chars, not common words)
            const COMMON = new Set(['through', 'across', 'within', 'between', 'during', 'before', 'leadership', 'management', 'experience', 'including', 'organization']);
            return words
              .filter(w => w.length >= 6 && !COMMON.has(w))
              .some(w => bulletLower.includes(w));
          });
          return matchesEvidence ? { ...b, highlighted: true } : b;
        }),
      })),
    };
  }

  return updated;
}

// ─── Resume builder ───────────────────────────────────────────────────────────

function buildInitialLiveResume(resumeText: string): LiveResumeState {
  const lines = resumeText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const name = lines[0] ?? 'Your Name';
  let email = '';
  let phone = '';

  // Extract contact info from early lines
  for (let i = 1; i < Math.min(8, lines.length); i++) {
    const line = lines[i];
    if (!email && line.includes('@')) email = line;
    else if (!phone && /[\d()+\-\s]{7,}/.test(line) && !line.includes('@')) phone = line;
  }

  // Very simple section detection from text blocks
  const experience: LiveResumeState['experience'] = [];
  const skills: string[] = [];
  const education: LiveResumeState['education'] = [];
  let summary = '';

  let currentSection = '';
  let currentExp: LiveResumeState['experience'][0] | null = null;
  let expCounter = 0;
  let bulletCounter = 0;

  for (const line of lines.slice(1)) {
    const upper = line.toUpperCase();

    if (/^(EXPERIENCE|WORK HISTORY|EMPLOYMENT|PROFESSIONAL EXPERIENCE)/i.test(line)) {
      if (currentExp) {
        experience.push(currentExp);
        currentExp = null;
      }
      currentSection = 'experience';
      continue;
    }
    if (/^(SKILLS?|CORE COMPETENCIES|TECHNICAL SKILLS)/i.test(line)) {
      if (currentExp) {
        experience.push(currentExp);
        currentExp = null;
      }
      currentSection = 'skills';
      continue;
    }
    if (/^(EDUCATION|ACADEMIC|DEGREE)/i.test(line)) {
      if (currentExp) {
        experience.push(currentExp);
        currentExp = null;
      }
      currentSection = 'education';
      continue;
    }
    if (/^(SUMMARY|OBJECTIVE|PROFILE|ABOUT)/i.test(line)) {
      currentSection = 'summary';
      continue;
    }

    if (currentSection === 'summary') {
      summary = summary ? `${summary} ${line}` : line;
      continue;
    }

    if (currentSection === 'skills') {
      const tokens = line.split(/[,|•·]/);
      tokens.forEach((t) => {
        const cleaned = t.trim();
        if (cleaned.length > 1 && cleaned.length < 50) skills.push(cleaned);
      });
      continue;
    }

    if (currentSection === 'education') {
      if (line.length > 5) {
        let degree = line;
        let institution = '';
        let year: string | undefined;

        // Extract year
        const yearMatch = line.match(/\b(19|20)\d{2}\b/);
        if (yearMatch) {
          year = yearMatch[0];
          degree = line.replace(yearMatch[0], '').trim();
        }

        // Split degree from institution
        const eduSeparators = [' from ', ' — ', ' - ', ' | ', ', '];
        for (const sep of eduSeparators) {
          const idx = degree.indexOf(sep);
          if (idx > 0) {
            institution = degree.slice(idx + sep.length).trim();
            degree = degree.slice(0, idx).trim();
            break;
          }
        }

        // Clean trailing punctuation
        degree = degree.replace(/[,;|]+$/, '').trim();
        institution = institution.replace(/[,;|]+$/, '').trim();

        education.push({ degree, institution, year });
      }
      continue;
    }

    if (currentSection === 'experience' || currentSection === '') {
      // Heuristic: lines with dates are likely job headers
      const hasDate = /\b(19|20)\d{2}\b/.test(line) || /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/.test(line);
      const isBullet = line.startsWith('•') || line.startsWith('-') || line.startsWith('*');

      if (hasDate && !isBullet && line.length < 100) {
        if (currentExp) experience.push(currentExp);
        expCounter++;

        let title = line;
        let company = '';
        let dates = '';

        // Extract dates
        const dateMatch = line.match(/\b(19|20)\d{2}.*$/);
        if (dateMatch) {
          dates = dateMatch[0];
          title = line.replace(dateMatch[0], '').trim();
        }

        // Try to split title from company by common separators
        const separators = [' at ', ' — ', ' - ', ' | ', ', '];
        for (const sep of separators) {
          const sepIdx = title.indexOf(sep);
          if (sepIdx > 0 && sepIdx < title.length - sep.length) {
            company = title.slice(sepIdx + sep.length).trim();
            title = title.slice(0, sepIdx).trim();
            break;
          }
        }

        currentExp = {
          id: `exp-${expCounter}`,
          company,
          title,
          dates,
          bullets: [],
        };
        currentSection = 'experience';
      } else if (currentExp && (isBullet || (currentSection === 'experience' && line.length > 20 && !upper.includes('UNIVERSITY') && !upper.includes('COLLEGE')))) {
        bulletCounter++;
        currentExp.bullets.push({
          id: `bullet-${bulletCounter}`,
          text: isBullet ? line.slice(1).trim() : line,
          highlighted: false,
          strengthened: false,
        });
      }
    }
  }

  if (currentExp) experience.push(currentExp);

  // Limit to reasonable display size
  const trimmedExp = experience.slice(0, 5).map((exp) => ({
    ...exp,
    bullets: exp.bullets.slice(0, 5),
  }));

  return {
    name,
    email,
    phone,
    summary,
    experience: trimmedExp,
    skills: skills.slice(0, 20),
    education: education.slice(0, 3),
  };
}

function applyResumeUpdates(resume: LiveResumeState, updates: ResumeUpdate[]): LiveResumeState {
  if (updates.length === 0) return resume;

  let updated = { ...resume };

  for (const update of updates) {
    if (update.action === 'strengthen' && update.text) {
      if (update.section === 'summary') {
        updated = { ...updated, summary: update.text };
      } else {
        let strengthApplied = false;
        updated = {
          ...updated,
          experience: updated.experience.map((exp) => {
            // For generic "experience" section, only apply to the first entry
            if (update.section === 'experience' && strengthApplied) return exp;
            const matches =
              exp.id === update.section ||
              exp.company.toLowerCase() === update.section.toLowerCase() ||
              update.section === 'experience';
            if (!matches) return exp;
            strengthApplied = true;
            return {
              ...exp,
              bullets: exp.bullets.map((b, idx) => {
                if (
                  update.bullet_id &&
                  b.id !== update.bullet_id &&
                  !b.text.toLowerCase().startsWith(update.bullet_id.toLowerCase())
                ) return b;
                if (!update.bullet_id && update.section === 'experience' && idx > 0) return b;
                return { ...b, text: update.text!, strengthened: true };
              }),
            };
          }),
        };
      }
    }

    if (update.action === 'highlight') {
      let highlightApplied = false;
      updated = {
        ...updated,
        experience: updated.experience.map((exp) => {
          if (update.section === 'experience' && highlightApplied) return exp;
          const matches =
            exp.id === update.section ||
            exp.company.toLowerCase() === update.section.toLowerCase() ||
            update.section === 'experience';
          if (!matches) return exp;
          highlightApplied = true;
          return {
            ...exp,
            bullets: exp.bullets.map((b, idx) => {
              if (
                update.bullet_id &&
                b.id !== update.bullet_id &&
                !b.text.toLowerCase().startsWith(update.bullet_id.toLowerCase())
              ) return b;
              if (!update.bullet_id && update.section === 'experience' && idx > 0) return b;
              return { ...b, highlighted: true };
            }),
          };
        }),
      };
    }

    if (update.action === 'reorder') {
      const idx = updated.experience.findIndex(
        (exp) => exp.id === update.section || exp.company.toLowerCase() === update.section.toLowerCase()
      );
      if (idx >= 0) {
        const reordered = [...updated.experience];
        const [entry] = reordered.splice(idx, 1);
        const targetPos = Math.min(update.position ?? 0, reordered.length);
        reordered.splice(targetPos, 0, entry);
        updated = { ...updated, experience: reordered };
      }
    }

    if (update.action === 'add' && update.text) {
      if (update.section === 'summary') {
        updated = { ...updated, summary: update.text };
      } else if (update.section === 'accomplishments' || update.section === 'experience') {
        // Add bullet to the first experience entry
        if (updated.experience.length > 0) {
          const [first, ...rest] = updated.experience;
          const newBulletId = `bullet-added-${Date.now()}`;
          updated = {
            ...updated,
            experience: [
              {
                ...first,
                bullets: [
                  ...first.bullets,
                  { id: newBulletId, text: update.text, highlighted: true, strengthened: false },
                ],
              },
              ...rest,
            ],
          };
        }
      }
    }
  }

  return updated;
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

function discoveryReducer(state: DiscoveryState, action: DiscoveryAction): DiscoveryState {
  switch (action.type) {
    case 'START_ANALYSIS':
      return {
        ...state,
        screen: 'processing',
        resumeText: action.resumeText,
        jobText: action.jobText,
        error: null,
      };

    case 'ANALYSIS_COMPLETE':
      return {
        ...state,
        screen: 'conversation',
        sessionId: action.sessionId,
        discovery: action.discovery,
        liveResume: action.liveResume,
        processingStage: null,
        error: null,
      };

    case 'SET_PROCESSING_STAGE':
      return {
        ...state,
        processingStage: { stage: action.stage, message: action.message },
      };

    case 'ANALYSIS_ERROR':
      return {
        ...state,
        screen: 'drop_zone',
        error: action.error,
      };

    case 'APPLY_RESUME_UPDATES': {
      if (!state.liveResume) return state;
      return {
        ...state,
        liveResume: applyResumeUpdates(state.liveResume, action.updates),
        highlightedSections: action.updates.map((u) => u.section),
      };
    }

    case 'EXCAVATION_COMPLETE':
      return {
        ...state,
        screen: 'building_profile',
        excavationComplete: true,
      };

    case 'PROFILE_READY':
      return {
        ...state,
        screen: 'profile',
        profile: action.profile,
        liveResume: state.liveResume ? applyProfileSynthesis(state.liveResume, action.profile) : state.liveResume,
      };

    case 'PROFILE_ERROR':
      return {
        ...state,
        screen: 'conversation',
        profileFetchFailed: true,
        error: action.error,
      };

    case 'RETRY_PROFILE':
      return {
        ...state,
        profileFetchFailed: false,
        error: null,
      };

    case 'SET_PROFILE_CHECK':
      return { ...state, profileCheck: action.check };

    case 'SET_ERROR':
      return { ...state, error: action.error };

    case 'CLEAR_ERROR':
      return { ...state, error: null };

    default:
      return state;
  }
}

const initialState: DiscoveryState = {
  screen: 'drop_zone',
  profileCheck: 'loading',
  resumeText: null,
  jobText: null,
  sessionId: null,
  discovery: null,
  excavationComplete: false,
  profileFetchFailed: false,
  profile: null,
  liveResume: null,
  highlightedSections: [],
  processingStage: null,
  error: null,
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function DiscoveryFlow() {
  const { session } = useAuth();
  const accessToken = session?.access_token ?? null;
  const { analyze, excavate, complete, fetchJobDescription, analyzing, excavating } = useDiscovery(accessToken);
  const navigate = useNavigate();

  const [state, dispatch] = useReducer(discoveryReducer, initialState);

  // On mount: check if the user already has a career_profile in platform context (Gap 14)
  useEffect(() => {
    if (!accessToken) {
      dispatch({ type: 'SET_PROFILE_CHECK', check: 'no_profile' });
      return;
    }
    const checkProfile = async () => {
      try {
        const res = await fetch(`${API_BASE}/platform-context/summary`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) {
          dispatch({ type: 'SET_PROFILE_CHECK', check: 'no_profile' });
          return;
        }
        const data = await res.json() as unknown;
        const items = Array.isArray((data as { items?: unknown[] }).items)
          ? (data as { items: unknown[] }).items
          : Array.isArray(data)
            ? (data as unknown[])
            : [];
        const hasProfile = items.some(
          (item) => (item as { context_type?: string }).context_type === 'career_profile',
        );
        dispatch({ type: 'SET_PROFILE_CHECK', check: hasProfile ? 'has_profile' : 'no_profile' });
      } catch {
        dispatch({ type: 'SET_PROFILE_CHECK', check: 'no_profile' });
      }
    };
    void checkProfile();
  }, [accessToken]);

  // After excavation complete, fetch the full profile
  useEffect(() => {
    if (!state.excavationComplete || !state.sessionId || state.profile || state.screen === 'profile' || state.profileFetchFailed) return;

    const fetchProfile = async () => {
      const result = await complete(state.sessionId!);
      if (result) {
        dispatch({ type: 'PROFILE_READY', profile: result.profile });
      } else {
        dispatch({ type: 'PROFILE_ERROR', error: 'Could not build your profile. Click below to try again.' });
      }
    };

    void fetchProfile();
  }, [state.excavationComplete, state.sessionId, state.profile, state.screen, state.profileFetchFailed, complete]);

  const handleAnalyze = useCallback(
    async (resumeText: string, jobText: string) => {
      dispatch({ type: 'START_ANALYSIS', resumeText, jobText });

      const [result] = await Promise.all([
        analyze(resumeText, jobText, (stage, message) => {
          dispatch({ type: 'SET_PROCESSING_STAGE', stage, message });
        }),
        new Promise<void>((resolve) => setTimeout(resolve, 3000)),
      ]);
      if (!result) {
        dispatch({ type: 'ANALYSIS_ERROR', error: 'Analysis failed. Please try again.' });
        return;
      }

      const liveResume = buildInitialLiveResume(resumeText);
      dispatch({
        type: 'ANALYSIS_COMPLETE',
        sessionId: result.session_id,
        discovery: result.discovery,
        liveResume,
      });
    },
    [analyze],
  );

  const handleResumeUpdate = useCallback((updates: ResumeUpdate[]) => {
    dispatch({ type: 'APPLY_RESUME_UPDATES', updates });
  }, []);

  const handleExcavationComplete = useCallback(() => {
    dispatch({ type: 'EXCAVATION_COMPLETE' });
  }, []);

  const { screen, resumeText, jobText, discovery, liveResume, profile, sessionId, processingStage } = state;

  return (
    <div className="fixed inset-0 overflow-hidden" style={{ background: 'var(--bg-0)' }}>
      {/* Error banner */}
      {state.error && (
        <div
          role="alert"
          className="absolute left-1/2 top-4 z-50 -translate-x-1/2 rounded-xl border border-[var(--badge-red-bg)] bg-[var(--badge-red-bg)] px-4 py-2 text-sm text-[var(--badge-red-text)]"
        >
          {state.error}
          <button
            type="button"
            className="ml-3 underline opacity-70 hover:opacity-100"
            onClick={() => dispatch({ type: 'CLEAR_ERROR' })}
            aria-label="Dismiss error"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Screens */}

      {/* Gap 14: While loading profile check, show nothing to avoid flashing the DropZone */}
      {screen === 'drop_zone' && state.profileCheck === 'loading' && null}

      {/* Gap 14: Welcome-back screen for users who already have a profile */}
      {screen === 'drop_zone' && state.profileCheck === 'has_profile' && (
        <div className="flex h-full flex-col items-center justify-center gap-8 px-8">
          <p
            className="text-3xl font-light text-[var(--text-strong)]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Welcome back. You already have a CareerIQ profile.
          </p>
          <div className="flex gap-4">
            <GlassCard
              hover
              className="cursor-pointer px-6 py-4"
              role="button"
              tabIndex={0}
              onClick={() => dispatch({ type: 'SET_PROFILE_CHECK', check: 'no_profile' })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dispatch({ type: 'SET_PROFILE_CHECK', check: 'no_profile' }); }
              }}
            >
              <p className="font-semibold text-[var(--text-strong)]">Start fresh with a new job</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">Run a new analysis for a different role</p>
            </GlassCard>
            <GlassCard
              hover
              className="cursor-pointer px-6 py-4"
              role="button"
              tabIndex={0}
              onClick={() => navigate('/workspace')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/workspace'); }
              }}
            >
              <p className="font-semibold text-[var(--text-strong)]">Go to your workspace</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">Continue with your existing profile</p>
            </GlassCard>
          </div>
        </div>
      )}

      {screen === 'drop_zone' && state.profileCheck === 'no_profile' && (
        <DropZone
          onAnalyze={handleAnalyze}
          loading={analyzing}
          onFetchJobDescription={fetchJobDescription}
        />
      )}

      {screen === 'processing' && resumeText && jobText && (
        <ProcessingReveal
          resumeText={resumeText}
          jobText={jobText}
          currentStage={processingStage}
        />
      )}

      {screen === 'conversation' && discovery && liveResume && sessionId && (
        <div className="relative h-full">
          <ExcavationConversation
            discovery={discovery}
            sessionId={sessionId}
            liveResume={liveResume}
            highlightedSections={state.highlightedSections}
            onExcavate={excavate}
            onResumeUpdate={handleResumeUpdate}
            onComplete={handleExcavationComplete}
            excavating={excavating}
          />
          {state.profileFetchFailed && (
            <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface-1)]/80 z-40">
              <div className="flex flex-col items-center gap-4 text-center">
                <p className="text-2xl font-light text-[var(--text-strong)]" style={{ fontFamily: 'var(--font-display)' }}>Could not build your profile.</p>
                <GlassButton onClick={() => dispatch({ type: 'RETRY_PROFILE' })} size="lg">Try again</GlassButton>
              </div>
            </div>
          )}
        </div>
      )}

      {screen === 'building_profile' && (
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <p className="text-2xl font-light text-[var(--text-strong)]" style={{ fontFamily: 'var(--font-display)' }}>
              Building your profile...
            </p>
            <div className="mt-4 flex justify-center gap-1.5">
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-2 w-2 rounded-full bg-[var(--link)] animate-[dot-bounce_1.4s_ease-in-out_infinite]" style={{ animationDelay: `${i * 0.16}s` }} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Gap 13: Pass jobText to CareerIQProfileScreen for downstream navigation context */}
      {screen === 'profile' && profile && liveResume && (
        <CareerIQProfileScreen profile={profile} resume={liveResume} jobText={jobText ?? undefined} />
      )}
    </div>
  );
}
