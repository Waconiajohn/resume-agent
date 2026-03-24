import { useState } from 'react';
import { Compass, Lightbulb, Target, MessageCircle, Sparkles, Clipboard, Check } from 'lucide-react';
import type { NarrativeStrategy } from '@/types/resume-v2';

export function NarrativeStrategyCard({
  data,
  isLive = false,
}: {
  data: NarrativeStrategy;
  isLive?: boolean;
}) {
  const experienceFramingEntries = data.section_guidance.experience_framing
    ? Object.entries(data.section_guidance.experience_framing)
    : [];
  const visibleThemes = isLive ? data.supporting_themes.slice(0, 3) : data.supporting_themes;
  const hiddenThemes = isLive ? data.supporting_themes.slice(3) : [];
  const visibleDifferentiators = isLive ? (data.unique_differentiators ?? []).slice(0, 2) : (data.unique_differentiators ?? []);
  const hiddenDifferentiators = isLive ? (data.unique_differentiators ?? []).slice(2) : [];

  return (
    <div className="room-shell space-y-5">
      <div className="flex items-center gap-2">
        <div className="rounded-lg border border-[#afc4ff]/18 bg-[#afc4ff]/10 p-2.5">
          <Compass className="h-4 w-4 text-[#afc4ff]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="eyebrow-label">Resume positioning</p>
          <h3 className="mt-2 text-sm font-semibold text-[var(--text-strong)]">How the resume should position you</h3>
        </div>
      </div>

      <div className="support-callout px-4 py-3">
        <p className="text-sm leading-6 text-[var(--text-muted)]">
          This is the story the resume should tell once we finish matching the role requirements to your strongest proof.
        </p>
      </div>

      {/* Branded title */}
      <div className="support-callout border border-[#afc4ff]/15 bg-[#afc4ff]/[0.04] px-4 py-4 text-center">
        <div className="text-lg font-semibold text-[var(--text-strong)]">{data.branded_title}</div>
        <div className="mt-1 text-sm text-[#afc4ff]/70">{data.primary_narrative}</div>
      </div>

      {/* Supporting themes */}
      <div className="flex flex-wrap gap-1.5">
        {visibleThemes.map((theme, i) => (
          <span key={i} className="rounded-md border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-1.5 text-xs uppercase tracking-[0.12em] text-[var(--text-soft)]">{theme}</span>
        ))}
      </div>
      {hiddenThemes.length > 0 && (
        <p className="text-xs text-[var(--text-soft)]">More positioning themes will open once this stage finishes.</p>
      )}

      {/* Why Me story — pull-quote treatment */}
      <div>
        <h4 className="mb-2 text-xs font-medium text-[var(--text-soft)] uppercase tracking-[0.16em]">Core positioning</h4>
        <p className="text-lg leading-relaxed text-[var(--text-strong)] italic border-l-[3px] border-[#afc4ff]/40 pl-4">
          {data.why_me_concise}
        </p>
        {!isLive && data.why_me_story && (
          <details className="mt-2">
            <summary className="text-xs text-[var(--text-soft)] cursor-pointer hover:text-[var(--text-muted)]">See the longer version of this story</summary>
            <p className="mt-1 text-xs text-[var(--text-soft)] leading-relaxed">{data.why_me_story}</p>
          </details>
        )}
      </div>

      {/* Best line — premium quote box */}
      <div className="support-callout bg-[#b5dec2]/[0.04] border border-[#b5dec2]/15 p-4 relative overflow-hidden">
        <div className="absolute top-2 left-3 text-4xl leading-none text-[#b5dec2]/10 font-serif select-none" aria-hidden="true">
          &ldquo;
        </div>
        <div className="text-xs font-medium text-[#b5dec2]/70 mb-2 relative z-10">Best line to reuse</div>
        <p className="text-sm text-[var(--text-strong)] italic relative z-10 pl-2">{data.why_me_best_line}</p>
      </div>

      {/* Narrative Rationale */}
      {!isLive && data.narrative_angle_rationale && (
        <div className="support-callout px-4 py-3 flex gap-3">
          <Lightbulb className="h-3.5 w-3.5 mt-0.5 shrink-0 text-[#f0d99f]/60" />
          <p className="text-xs text-[var(--text-soft)] leading-relaxed">{data.narrative_angle_rationale}</p>
        </div>
      )}

      {/* Unique Differentiators — Sparkles chips */}
      {data.unique_differentiators && data.unique_differentiators.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-medium text-[var(--text-soft)] uppercase tracking-[0.16em]">Points to emphasize</h4>
          <div className="flex flex-wrap gap-1.5">
            {visibleDifferentiators.map((diff, i) => (
              <span
                key={i}
                className="flex items-center gap-1.5 bg-[#afc4ff]/10 border border-[#afc4ff]/20 px-3 py-1.5 rounded-md text-xs uppercase tracking-[0.08em] text-[#afc4ff]/80"
              >
                <Sparkles className="h-3 w-3 shrink-0" />
                {diff}
              </span>
            ))}
          </div>
          {isLive && hiddenDifferentiators.length > 0 && (
            <p className="mt-2 text-xs text-[var(--text-soft)]">More emphasis points will appear when the map is finished.</p>
          )}
        </div>
      )}

      {/* Section Guidance */}
      <details open={!isLive}>
        <summary className="text-xs font-medium text-[var(--text-soft)] cursor-pointer hover:text-[var(--text-muted)] uppercase tracking-wider select-none">
          {isLive ? 'More positioning detail' : 'How the resume should read'}
        </summary>
        <div className="mt-3 space-y-4 pl-1">

          {/* Summary Angle */}
          {data.section_guidance.summary_angle && (
            <div>
              <h5 className="mb-1.5 text-xs font-medium text-[var(--text-soft)] uppercase tracking-wider">Summary Angle</h5>
              <p className="text-xs text-[var(--text-soft)] leading-relaxed">{data.section_guidance.summary_angle}</p>
            </div>
          )}

          {/* Competency Themes */}
          {data.section_guidance.competency_themes && data.section_guidance.competency_themes.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Target className="h-3 w-3 text-[var(--text-soft)]" />
                <h5 className="text-xs font-medium text-[var(--text-soft)] uppercase tracking-[0.16em]">Competency Themes</h5>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {data.section_guidance.competency_themes.map((theme, i) => (
                  <span
                    key={i}
                    className="rounded-md border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-1.5 text-xs uppercase tracking-[0.12em] text-[var(--text-soft)]"
                  >
                    {theme}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Accomplishment Priorities */}
          {data.section_guidance.accomplishment_priorities && data.section_guidance.accomplishment_priorities.length > 0 && (
            <div>
              <h5 className="mb-2 text-xs font-medium text-[var(--text-soft)] uppercase tracking-wider">Accomplishment Priorities</h5>
              <ol className="space-y-1.5 list-none">
                {data.section_guidance.accomplishment_priorities.map((priority, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="shrink-0 text-xs text-[var(--text-soft)] font-mono w-4 text-right">{i + 1}.</span>
                    <span className="text-xs text-[var(--text-soft)] leading-relaxed">{priority}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Experience Framing */}
          {experienceFramingEntries.length > 0 && (
            <div>
              <h5 className="mb-2 text-xs font-medium text-[var(--text-soft)] uppercase tracking-wider">Experience Framing</h5>
              <div className="space-y-2.5">
                {experienceFramingEntries.map(([company, framing], i) => (
                  <div key={i} className="support-callout px-3 py-2.5">
                    <div className="text-xs font-medium text-[var(--text-muted)] mb-1">{company}</div>
                    <div className="text-xs text-[var(--text-soft)] leading-relaxed">{framing}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </details>

      {/* Interview Talking Points — numbered with clipboard copy */}
      {!isLive && data.interview_talking_points && data.interview_talking_points.length > 0 && (
        <details>
          <summary className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-soft)] cursor-pointer hover:text-[var(--text-muted)] uppercase tracking-wider select-none">
            <MessageCircle className="h-3 w-3" />
            Talking points to keep in mind
          </summary>
          <div className="mt-3 space-y-2 pl-1">
            {data.interview_talking_points.map((point, i) => (
              <TalkingPoint key={i} index={i} point={point} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function TalkingPoint({ index, point }: { index: number; point: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(point).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  return (
    <div className="group flex gap-2.5 items-start">
      <span className="shrink-0 mt-0.5 flex h-4 w-4 items-center justify-center rounded-md bg-[var(--surface-1)] text-[12px] font-mono text-[var(--text-soft)]">
        {index + 1}
      </span>
      <p className="flex-1 text-xs text-[var(--text-soft)] leading-relaxed">{point}</p>
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copy talking point"
        className="shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity text-[var(--text-soft)] hover:text-[var(--text-muted)]"
      >
        {copied
          ? <Check className="h-3 w-3 text-[#b5dec2]" />
          : <Clipboard className="h-3 w-3" />
        }
      </button>
    </div>
  );
}
