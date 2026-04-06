import { useReducer, useCallback, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useDiscovery } from '@/hooks/useDiscovery';
import { DropZone } from './DropZone';
import { ProcessingReveal } from './ProcessingReveal';
import { RecognitionScreen } from './RecognitionScreen';
import { ExcavationConversation } from './ExcavationConversation';
import { CareerIQProfileScreen } from './CareerIQProfileScreen';
import type {
  DiscoveryOutput,
  CareerIQProfile,
  LiveResumeState,
  ResumeUpdate,
} from '@/types/discovery';

// ─── Types ───────────────────────────────────────────────────────────────────

type DiscoveryScreen = 'drop_zone' | 'processing' | 'recognition' | 'excavation' | 'profile';

interface ConversationMessage {
  role: 'ai' | 'user';
  content: string;
}

interface DiscoveryState {
  screen: DiscoveryScreen;
  resumeText: string | null;
  jobText: string | null;
  sessionId: string | null;
  discovery: DiscoveryOutput | null;
  conversation: ConversationMessage[];
  excavationComplete: boolean;
  profile: CareerIQProfile | null;
  liveResume: LiveResumeState | null;
  highlightedSections: string[];
  error: string | null;
}

type DiscoveryAction =
  | { type: 'START_ANALYSIS'; resumeText: string; jobText: string }
  | { type: 'ANALYSIS_COMPLETE'; sessionId: string; discovery: DiscoveryOutput; liveResume: LiveResumeState }
  | { type: 'ANALYSIS_ERROR'; error: string }
  | { type: 'RESPOND_TO_RECOGNITION'; response: 'confirmed' | 'corrected' }
  | { type: 'APPLY_RESUME_UPDATES'; updates: ResumeUpdate[] }
  | { type: 'EXCAVATION_COMPLETE' }
  | { type: 'PROFILE_READY'; profile: CareerIQProfile }
  | { type: 'PROFILE_ERROR'; error: string }
  | { type: 'SET_ERROR'; error: string }
  | { type: 'CLEAR_ERROR' };

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
        updated = {
          ...updated,
          experience: updated.experience.map((exp) => {
            const matches =
              exp.id === update.section ||
              exp.company.toLowerCase() === update.section.toLowerCase() ||
              update.section === 'experience';
            if (!matches) return exp;
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
      updated = {
        ...updated,
        experience: updated.experience.map((exp) => {
          const matches =
            exp.id === update.section ||
            exp.company.toLowerCase() === update.section.toLowerCase() ||
            update.section === 'experience';
          if (!matches) return exp;
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
        screen: 'recognition',
        sessionId: action.sessionId,
        discovery: action.discovery,
        liveResume: action.liveResume,
        error: null,
      };

    case 'ANALYSIS_ERROR':
      return {
        ...state,
        screen: 'drop_zone',
        error: action.error,
      };

    case 'RESPOND_TO_RECOGNITION':
      return {
        ...state,
        screen: 'excavation',
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
        excavationComplete: true,
      };

    case 'PROFILE_READY':
      return {
        ...state,
        screen: 'profile',
        profile: action.profile,
      };

    case 'PROFILE_ERROR':
      return {
        ...state,
        excavationComplete: false,
        error: action.error,
      };

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
  resumeText: null,
  jobText: null,
  sessionId: null,
  discovery: null,
  conversation: [],
  excavationComplete: false,
  profile: null,
  liveResume: null,
  highlightedSections: [],
  error: null,
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function DiscoveryFlow() {
  const { session } = useAuth();
  const accessToken = session?.access_token ?? null;
  const { analyze, excavate, complete, analyzing, excavating } = useDiscovery(accessToken);

  const [state, dispatch] = useReducer(discoveryReducer, initialState);

  // After excavation complete, fetch the full profile
  useEffect(() => {
    if (!state.excavationComplete || !state.sessionId || state.profile || state.screen === 'profile') return;

    const fetchProfile = async () => {
      const result = await complete(state.sessionId!);
      if (result) {
        dispatch({ type: 'PROFILE_READY', profile: result.profile });
      } else {
        dispatch({ type: 'PROFILE_ERROR', error: 'Could not build your profile. Click below to try again.' });
      }
    };

    void fetchProfile();
  }, [state.excavationComplete, state.sessionId, state.profile, state.screen, complete]);

  const handleAnalyze = useCallback(
    async (resumeText: string, jobText: string) => {
      dispatch({ type: 'START_ANALYSIS', resumeText, jobText });

      const [result] = await Promise.all([
        analyze(resumeText, jobText),
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

  const handleRespond = useCallback((response: 'confirmed' | 'corrected') => {
    dispatch({ type: 'RESPOND_TO_RECOGNITION', response });
  }, []);

  const handleResumeUpdate = useCallback((updates: ResumeUpdate[]) => {
    dispatch({ type: 'APPLY_RESUME_UPDATES', updates });
  }, []);

  const handleExcavationComplete = useCallback(() => {
    dispatch({ type: 'EXCAVATION_COMPLETE' });
  }, []);

  const { screen, resumeText, jobText, discovery, liveResume, profile, conversation, sessionId } = state;

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
      {screen === 'drop_zone' && (
        <DropZone onAnalyze={handleAnalyze} loading={analyzing} />
      )}

      {screen === 'processing' && resumeText && jobText && (
        <ProcessingReveal resumeText={resumeText} jobText={jobText} />
      )}

      {screen === 'recognition' && discovery && liveResume && (
        <RecognitionScreen
          discovery={discovery}
          resume={liveResume}
          onRespond={handleRespond}
        />
      )}

      {screen === 'excavation' && discovery && liveResume && sessionId && (
        <ExcavationConversation
          discovery={discovery}
          sessionId={sessionId}
          resume={liveResume}
          initialConversation={conversation}
          onExcavate={excavate}
          onResumeUpdate={handleResumeUpdate}
          onComplete={handleExcavationComplete}
          excavating={excavating}
        />
      )}

      {screen === 'profile' && profile && liveResume && (
        <CareerIQProfileScreen profile={profile} resume={liveResume} />
      )}
    </div>
  );
}
