import { useState } from 'react';
import { Compass, Lightbulb, Target, MessageCircle, Sparkles, Clipboard, Check } from 'lucide-react';
import type { NarrativeStrategy } from '@/types/resume-v2';

export function NarrativeStrategyCard({ data }: { data: NarrativeStrategy }) {
  const experienceFramingEntries = data.section_guidance.experience_framing
    ? Object.entries(data.section_guidance.experience_framing)
    : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Compass className="h-4 w-4 text-[#afc4ff]" />
        <h3 className="text-sm font-semibold text-white/90">Your Positioning</h3>
      </div>

      {/* Branded title */}
      <div className="rounded-lg border border-[#afc4ff]/15 bg-[#afc4ff]/[0.04] px-4 py-3 text-center">
        <div className="text-lg font-semibold text-white/90">{data.branded_title}</div>
        <div className="mt-1 text-sm text-[#afc4ff]/70">{data.primary_narrative}</div>
      </div>

      {/* Supporting themes */}
      <div className="flex flex-wrap gap-1.5">
        {data.supporting_themes.map((theme, i) => (
          <span key={i} className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-white/60">{theme}</span>
        ))}
      </div>

      {/* Why Me story — pull-quote treatment */}
      <div>
        <h4 className="mb-2 text-xs font-medium text-white/60 uppercase tracking-wider">Why You</h4>
        <p className="text-lg leading-relaxed text-white/90 italic border-l-[3px] border-[#afc4ff]/40 pl-4">
          {data.why_me_concise}
        </p>
        {data.why_me_story && (
          <details className="mt-2">
            <summary className="text-xs text-white/40 cursor-pointer hover:text-white/60">Full positioning story</summary>
            <p className="mt-1 text-xs text-white/50 leading-relaxed">{data.why_me_story}</p>
          </details>
        )}
      </div>

      {/* Best line — premium quote box */}
      <div className="bg-[#b5dec2]/[0.04] border border-[#b5dec2]/15 rounded-lg p-4 relative overflow-hidden">
        <div className="absolute top-2 left-3 text-4xl leading-none text-[#b5dec2]/10 font-serif select-none" aria-hidden="true">
          &ldquo;
        </div>
        <div className="text-xs font-medium text-[#b5dec2]/70 mb-2 relative z-10">Your Best Line</div>
        <p className="text-sm text-white/80 italic relative z-10 pl-2">{data.why_me_best_line}</p>
      </div>

      {/* Narrative Rationale */}
      {data.narrative_angle_rationale && (
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-3 flex gap-3">
          <Lightbulb className="h-3.5 w-3.5 mt-0.5 shrink-0 text-[#f0d99f]/60" />
          <p className="text-xs text-white/60 leading-relaxed">{data.narrative_angle_rationale}</p>
        </div>
      )}

      {/* Unique Differentiators — Sparkles chips */}
      {data.unique_differentiators && data.unique_differentiators.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-medium text-white/60 uppercase tracking-wider">What Sets You Apart</h4>
          <div className="flex flex-wrap gap-1.5">
            {data.unique_differentiators.map((diff, i) => (
              <span
                key={i}
                className="flex items-center gap-1.5 bg-[#afc4ff]/10 border border-[#afc4ff]/20 px-3 py-1 rounded-full text-xs text-[#afc4ff]/80"
              >
                <Sparkles className="h-3 w-3 shrink-0" />
                {diff}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Section Guidance */}
      <details>
        <summary className="text-xs font-medium text-white/50 cursor-pointer hover:text-white/70 uppercase tracking-wider select-none">
          How Your Resume Will Be Framed
        </summary>
        <div className="mt-3 space-y-4 pl-1">

          {/* Summary Angle */}
          {data.section_guidance.summary_angle && (
            <div>
              <h5 className="mb-1.5 text-xs font-medium text-white/60 uppercase tracking-wider">Summary Angle</h5>
              <p className="text-xs text-white/60 leading-relaxed">{data.section_guidance.summary_angle}</p>
            </div>
          )}

          {/* Competency Themes */}
          {data.section_guidance.competency_themes && data.section_guidance.competency_themes.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Target className="h-3 w-3 text-white/40" />
                <h5 className="text-xs font-medium text-white/60 uppercase tracking-wider">Competency Themes</h5>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {data.section_guidance.competency_themes.map((theme, i) => (
                  <span
                    key={i}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-white/55"
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
              <h5 className="mb-2 text-xs font-medium text-white/60 uppercase tracking-wider">Accomplishment Priorities</h5>
              <ol className="space-y-1.5 list-none">
                {data.section_guidance.accomplishment_priorities.map((priority, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="shrink-0 text-xs text-white/30 font-mono w-4 text-right">{i + 1}.</span>
                    <span className="text-xs text-white/60 leading-relaxed">{priority}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Experience Framing */}
          {experienceFramingEntries.length > 0 && (
            <div>
              <h5 className="mb-2 text-xs font-medium text-white/60 uppercase tracking-wider">Experience Framing</h5>
              <div className="space-y-2.5">
                {experienceFramingEntries.map(([company, framing], i) => (
                  <div key={i} className="rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                    <div className="text-xs font-medium text-white/70 mb-1">{company}</div>
                    <div className="text-xs text-white/50 leading-relaxed">{framing}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </details>

      {/* Interview Talking Points — numbered with clipboard copy */}
      {data.interview_talking_points && data.interview_talking_points.length > 0 && (
        <details>
          <summary className="flex items-center gap-1.5 text-xs font-medium text-white/50 cursor-pointer hover:text-white/70 uppercase tracking-wider select-none">
            <MessageCircle className="h-3 w-3" />
            Prepare for These Conversations
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
      <span className="shrink-0 mt-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white/[0.06] text-[10px] font-mono text-white/40">
        {index + 1}
      </span>
      <p className="flex-1 text-xs text-white/60 leading-relaxed">{point}</p>
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copy talking point"
        className="shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity text-white/30 hover:text-white/60"
      >
        {copied
          ? <Check className="h-3 w-3 text-[#b5dec2]" />
          : <Clipboard className="h-3 w-3" />
        }
      </button>
    </div>
  );
}
