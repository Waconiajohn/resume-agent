import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';

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

const STORAGE_KEY = 'careeriq_why_me_story';
const DEBOUNCE_MS = 500;

const EMPTY_STORY: WhyMeStory = {
  colleaguesCameForWhat: '',
  knownForWhat: '',
  whyNotMe: '',
};

function assessSignal(text: string): SignalLevel {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 'red';
  if (trimmed.length < 50) return 'yellow';
  return 'green';
}

function loadFromStorage(): WhyMeStory {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_STORY;
    const parsed = JSON.parse(raw);
    return {
      colleaguesCameForWhat: parsed.colleaguesCameForWhat ?? '',
      knownForWhat: parsed.knownForWhat ?? '',
      whyNotMe: parsed.whyNotMe ?? '',
    };
  } catch {
    return EMPTY_STORY;
  }
}

function saveToStorage(story: WhyMeStory) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(story));
  } catch {
    // localStorage may be full or unavailable
  }
}

export function useWhyMeStory() {
  const [story, setStory] = useState<WhyMeStory>(loadFromStorage);
  const [supabaseLoading, setSupabaseLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const initialLoadDone = useRef(false);

  // Load from Supabase on mount — merge with localStorage
  useEffect(() => {
    let cancelled = false;

    async function loadFromSupabase() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) {
          setSupabaseLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from('why_me_stories')
          .select('colleagues_came_for_what, known_for_what, why_not_me')
          .eq('user_id', user.id)
          .maybeSingle();

        if (cancelled) return;

        if (error) {
          console.warn('Failed to load Why-Me story from Supabase, using localStorage:', error.message);
          setSupabaseLoading(false);
          return;
        }

        if (data) {
          // Supabase data exists — use it
          const supabaseStory: WhyMeStory = {
            colleaguesCameForWhat: data.colleagues_came_for_what ?? '',
            knownForWhat: data.known_for_what ?? '',
            whyNotMe: data.why_not_me ?? '',
          };
          setStory(supabaseStory);
          saveToStorage(supabaseStory);
        } else {
          // No Supabase row — migrate localStorage data if any
          const localStory = loadFromStorage();
          const hasLocalData = localStory.colleaguesCameForWhat.trim() || localStory.knownForWhat.trim() || localStory.whyNotMe.trim();
          if (hasLocalData) {
            await supabase.from('why_me_stories').upsert({
              user_id: user.id,
              colleagues_came_for_what: localStory.colleaguesCameForWhat,
              known_for_what: localStory.knownForWhat,
              why_not_me: localStory.whyNotMe,
            }, { onConflict: 'user_id' });
          }
        }

        initialLoadDone.current = true;
        setSupabaseLoading(false);
      } catch {
        if (!cancelled) setSupabaseLoading(false);
      }
    }

    void loadFromSupabase();
    return () => { cancelled = true; };
  }, []);

  // Debounced save to Supabase on changes
  useEffect(() => {
    // Always sync to localStorage immediately
    saveToStorage(story);

    // Don't save to Supabase until initial load is done
    if (!initialLoadDone.current) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        await supabase.from('why_me_stories').upsert({
          user_id: user.id,
          colleagues_came_for_what: story.colleaguesCameForWhat,
          known_for_what: story.knownForWhat,
          why_not_me: story.whyNotMe,
        }, { onConflict: 'user_id' });
      } catch {
        // Supabase unavailable — localStorage has the data
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [story]);

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
  };
}
