import { ShieldCheck, ScanSearch, Fingerprint, AlertTriangle, Flag } from 'lucide-react';
import { GlassCard } from '../GlassCard';
import { ScoreRing } from '@/components/shared/ScoreRing';
import { cleanText } from '@/lib/clean-text';
import type { QualityDashboardData } from '@/types/panels';

interface QualityDashboardPanelProps {
  data: QualityDashboardData;
}

export function QualityDashboardPanel({ data }: QualityDashboardPanelProps) {
  const {
    hiring_manager,
    ats_score,
    keyword_coverage,
    authenticity_score,
    risk_flags,
    age_bias_risks,
    overall_assessment,
  } = data;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/[0.12] px-4 py-3">
        <span className="text-sm font-medium text-white/85">Quality Dashboard</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Score rings */}
        <GlassCard className="p-4">
          <div className="flex items-center justify-around">
            {hiring_manager && (
                <ScoreRing
                  score={hiring_manager.checklist_total ?? 0}
                  max={hiring_manager.checklist_max ?? 50}
                  label="Hiring Mgr"
                  color={hiring_manager.pass ? 'text-[#b5dec2]' : 'text-[#e0abab]'}
                />
              )}
            {ats_score != null && (
                <ScoreRing
                  score={ats_score}
                  max={100}
                  label="ATS"
                  color={ats_score >= 70 ? 'text-[#b5dec2]' : ats_score >= 50 ? 'text-[#dfc797]' : 'text-[#e0abab]'}
                />
              )}
            {authenticity_score != null && (
                <ScoreRing
                  score={authenticity_score}
                  max={100}
                  label="Authenticity"
                  color={authenticity_score >= 70 ? 'text-[#b5dec2]' : 'text-[#dfc797]'}
                />
              )}
          </div>

          {keyword_coverage != null && (
            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="text-white/60">Keyword Coverage</span>
              <span className="text-white/85">{keyword_coverage}%</span>
            </div>
          )}
        </GlassCard>

        {/* Hiring Manager Checklist — grouped by strength */}
        {hiring_manager?.checklist_scores && Object.keys(hiring_manager.checklist_scores).length > 0 && (() => {
          const entries = Object.entries(hiring_manager.checklist_scores);
          const needsWork = entries.filter(([, s]) => s <= 3);
          const strong = entries.filter(([, s]) => s >= 4);
          return (
            <GlassCard className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck className="h-3.5 w-3.5 text-[#afc4ff]" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-white/60">
                  Checklist Breakdown
                </h3>
                <span className="ml-auto text-[10px] text-white/50">
                  {hiring_manager.checklist_total ?? 0} / {hiring_manager.checklist_max ?? 50}
                </span>
              </div>
              {needsWork.length > 0 && (
                <div className="mb-3">
                  <span className="block mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/58">
                    Needs Improvement
                  </span>
                  <div className="space-y-1.5">
                    {needsWork.map(([key, score]) => (
                      <div key={key} className="flex items-center justify-between rounded border border-white/[0.1] bg-white/[0.03] px-2 py-1">
                        <span className="text-xs text-white/70 capitalize">{key.replace(/_/g, ' ')}</span>
                        <span className="text-xs font-medium text-[#e0abab]">{score}/5</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {strong.length > 0 && (
                <div>
                  <span className="block mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/58">
                    Strong
                  </span>
                  <div className="space-y-1.5">
                    {strong.map(([key, score]) => (
                      <div key={key} className="flex items-center justify-between rounded border border-white/[0.1] bg-white/[0.03] px-2 py-1">
                        <span className="text-xs text-white/70 capitalize">{key.replace(/_/g, ' ')}</span>
                        <span className="text-xs font-medium text-[#b5dec2]">{score}/5</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </GlassCard>
          );
        })()}

        {/* Overall Assessment */}
        {overall_assessment && (
          <GlassCard className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <ScanSearch className="h-3.5 w-3.5 text-[#afc4ff]" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-white/60">
                Assessment
              </h3>
            </div>
            <p className="text-xs text-white/85 leading-relaxed">
              {typeof overall_assessment === 'string'
                ? cleanText(overall_assessment)
                : JSON.stringify(overall_assessment)}
            </p>
          </GlassCard>
        )}

        {/* Risk Flags */}
        {risk_flags && risk_flags.length > 0 && (
          <GlassCard className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Flag className="h-3.5 w-3.5 text-white/62" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-white/60">
                Risk Flags
              </h3>
            </div>
            <div className="space-y-2">
              {risk_flags.map((rf, i) => {
                const severityColor = {
                  low: 'border-white/[0.1] bg-white/[0.04]',
                  medium: 'border-white/[0.1] bg-white/[0.04]',
                  high: 'border-white/[0.1] bg-white/[0.04]',
                }[rf.severity];
                return (
                  <div key={i} className={`rounded-lg border p-2.5 ${severityColor}`}>
                    <p className="text-xs text-white/85">{cleanText(rf.flag)}</p>
                    <p className="mt-1 text-[10px] text-white/60">{cleanText(rf.recommendation)}</p>
                  </div>
                );
              })}
            </div>
          </GlassCard>
        )}

        {/* Age Bias Risks */}
        {age_bias_risks && age_bias_risks.length > 0 && (
          <GlassCard className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-3.5 w-3.5 text-white/62" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-white/60">
                Age-Bias Risks
              </h3>
            </div>
            <div className="space-y-1.5">
              {age_bias_risks.map((risk, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-white/38" />
                  <span className="text-xs text-white/70">{cleanText(risk)}</span>
                </div>
              ))}
            </div>
          </GlassCard>
        )}
      </div>
    </div>
  );
}
