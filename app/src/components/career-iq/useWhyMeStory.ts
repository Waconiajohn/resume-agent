import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import {
  buildAuthScopedStorageKey,
  readJsonFromLocalStorage,
  removeLocalStorageKey,
  writeJsonToLocalStorage,
} from '@/lib/auth-scoped-storage';

export interface WhyMeStory {
  colleaguesCameForWhat: string;
  knownForWhat: string;
  whyNotMe: string;
}

export type SignalLevel = 'green' | 'yellow' | 'red';

export interface WhyMeSignals {
  clarity: SignalLevel;
  alignment: SignalLevel;
  differentiation: SignalLevel;
}

export type DashboardState = 'new-user' | 'refining' | 'strong';

const STORAGE_NAMESPACE = 'careeriq_why_me_story';
const LEGACY_STORAGE_KEY = STORAGE_NAMESPACE;
const DEBOUNCE_MS = 500;

const EMPTY_STORY: WhyMeStory = {
  colleaguesCameForWhat: '',
  knownForWhat: '',
  whyNotMe: '',
};

function assessSignal(text: string): SignalLevel {
  const trimmed = text.trim();
  if (!trimmed) return 'red';

  const words = trimmed.split(/\s+/).length;
  const sentences = trimmed.split(/[.!?]+/).filter((s) => s.trim().length > 0).length;

  // Green: either a substantive multi-sentence answer (20+ words, 2+ sentences)
  // or a shorter answer with concrete metrics (15+ words with a number)
  if ((words >= 20 && sentences >= 2) || (words >= 15 && /\d/.test(trimmed))) return 'green';
  return 'yellow';
}

function getStorageKey(userId: string | null) {
  return buildAuthScopedStorageKey(STORAGE_NAMESPACE, userId);
}

function normalizeStory(parsed: unknown): WhyMeStory {
  const source = (parsed ?? {}) as Partial<WhyMeStory>;
  return {
    colleaguesCameForWhat: source.colleaguesCameForWhat ?? '',
    knownForWhat: source.knownForWhat ?? '',
    whyNotMe: source.whyNotMe ?? '',
  };
}

function loadStoryFromStorageKey(key: string): WhyMeStory | null {
  const parsed = readJsonFromLocalStorage<WhyMeStory>(key);
  return parsed ? normalizeStory(parsed) : null;
}

function saveToStorageForUser(userId: string | null, story: WhyMeStory) {
  writeJsonToLocalStorage(getStorageKey(userId), story);
}

function loadFromStorage(userId: string | null): WhyMeStory {
  const scopedStory = loadStoryFromStorageKey(getStorageKey(userId));
  if (scopedStory) return scopedStory;

  if (!userId) {
    const legacyStory = loadStoryFromStorageKey(LEGACY_STORAGE_KEY);
    if (legacyStory) {
      saveToStorageForUser(null, legacyStory);
      removeLocalStorageKey(LEGACY_STORAGE_KEY);
      return legacyStory;
    }
  }

  return EMPTY_STORY;
}

function hasStoryContent(story: WhyMeStory) {
  return Boolean(
    story.colleaguesCameForWhat.trim()
    || story.knownForWhat.trim()
    || story.whyNotMe.trim(),
  );
}

export function useWhyMeStory() {
  const [story, setStory] = useState<WhyMeStory>(EMPTY_STORY);
  const [supabaseLoading, setSupabaseLoading] = useState(true);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [activeUserId, setActiveUserId] = useState<string | null | undefined>(undefined);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const initialLoadDone = useRef(false);
  const activeLoadId = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function loadForUser(userIdOverride?: string | null) {
      const loadId = ++activeLoadId.current;
      initialLoadDone.current = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setSupabaseLoading(true);

      try {
        const resolvedUserId = userIdOverride === undefined
          ? (await supabase.auth.getUser()).data.user?.id ?? null
          : userIdOverride;

        if (cancelled || loadId !== activeLoadId.current) return;

        setActiveUserId(resolvedUserId);
        const localStory = loadFromStorage(resolvedUserId);
        setStory(localStory);

        if (!resolvedUserId) {
          initialLoadDone.current = true;
          setSupabaseLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from('why_me_stories')
          .select('colleagues_came_for_what, known_for_what, why_not_me')
          .eq('user_id', resolvedUserId)
          .maybeSingle();

        if (cancelled || loadId !== activeLoadId.current) return;

        if (error) {
          console.warn('Failed to load Why-Me story from Supabase, using scoped local draft:', error.message);
        } else if (data) {
          const supabaseStory: WhyMeStory = {
            colleaguesCameForWhat: data.colleagues_came_for_what ?? '',
            knownForWhat: data.known_for_what ?? '',
            whyNotMe: data.why_not_me ?? '',
          };
          setStory(supabaseStory);
          saveToStorageForUser(resolvedUserId, supabaseStory);
        } else if (hasStoryContent(localStory)) {
          try {
            await supabase.from('why_me_stories').upsert({
              user_id: resolvedUserId,
              colleagues_came_for_what: localStory.colleaguesCameForWhat,
              known_for_what: localStory.knownForWhat,
              why_not_me: localStory.whyNotMe,
            }, { onConflict: 'user_id' });
          } catch {
            // Keep the user-scoped local draft until the server is available.
          }
        }
      } catch {
        if (!cancelled && loadId === activeLoadId.current) {
          initialLoadDone.current = true;
          setSupabaseLoading(false);
        }
        return;
      }

      if (!cancelled && loadId === activeLoadId.current) {
        initialLoadDone.current = true;
        setSupabaseLoading(false);
      }
    }

    void loadForUser(undefined);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      void loadForUser(session?.user?.id ?? null);
    });

    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      subscription.unsubscribe();
    };
  }, []);

  // Debounced save to Supabase on changes
  useEffect(() => {
    if (activeUserId === undefined) return;

    saveToStorageForUser(activeUserId, story);

    if (!initialLoadDone.current) return;
    if (!activeUserId) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      try {
        await supabase.from('why_me_stories').upsert({
          user_id: activeUserId,
          colleagues_came_for_what: story.colleaguesCameForWhat,
          known_for_what: story.knownForWhat,
          why_not_me: story.whyNotMe,
        }, { onConflict: 'user_id' });
        setLastSavedAt(new Date());
      } catch {
        // Supabase unavailable — the user-scoped local draft remains.
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [activeUserId, story]);

  const updateField = useCallback(
    (field: keyof WhyMeStory, value: string) => {
      setStory((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const signals: WhyMeSignals = useMemo(
    () => ({
      clarity: assessSignal(story.colleaguesCameForWhat),
      alignment: assessSignal(story.knownForWhat),
      differentiation: assessSignal(story.whyNotMe),
    }),
    [story],
  );

  const dashboardState: DashboardState = useMemo(() => {
    const allEmpty =
      !story.colleaguesCameForWhat.trim() &&
      !story.knownForWhat.trim() &&
      !story.whyNotMe.trim();
    if (allEmpty) return 'new-user';

    const allGreen =
      signals.clarity === 'green' &&
      signals.alignment === 'green' &&
      signals.differentiation === 'green';
    if (allGreen) return 'strong';

    return 'refining';
  }, [story, signals]);

  const isComplete = dashboardState === 'strong';
  const hasStarted = dashboardState !== 'new-user';

  return {
    story,
    updateField,
    signals,
    dashboardState,
    isComplete,
    hasStarted,
    loading: supabaseLoading,
    lastSavedAt,
  };
}
