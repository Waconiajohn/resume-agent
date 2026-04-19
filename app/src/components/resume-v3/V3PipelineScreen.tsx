/**
 * V3PipelineScreen — top-level v3 resume UI.
 *
 * Composes intake → pipeline progress → (strategy, resume, verify panels).
 * State lives in useV3Pipeline. The screen is stateless beyond UI concerns.
 *
 * Layout:
 *   ┌─ Header + reset button
 *   ├─ Stage progress strip (5 dots)
 *   ├─ Intake form (when no pipeline is running)  OR
 *   └─ Results layout:
 *      ┌─ 3-col grid on desktop
 *      │  ├─ Strategy panel (left)
 *      │  ├─ Resume view (center, widest)
 *      │  └─ Verify panel (right)
 */

import { useState } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useV3Pipeline, type StartV3PipelineInput } from '@/hooks/useV3Pipeline';
import { V3StageProgress } from './V3StageProgress';
import { V3IntakeForm } from './V3IntakeForm';
import { V3StrategyPanel } from './V3StrategyPanel';
import { V3ResumeView } from './V3ResumeView';
import { V3VerifyPanel } from './V3VerifyPanel';

interface V3PipelineScreenProps {
  accessToken: string | null;
  initialResumeText?: string;
}

export function V3PipelineScreen({ accessToken, initialResumeText }: V3PipelineScreenProps) {
  const pipeline = useV3Pipeline(accessToken);
  const [editedWritten, setEditedWritten] = useState<typeof pipeline.written | null>(null);

  const showIntake = !pipeline.isRunning && !pipeline.isComplete && !pipeline.error;
  const showResults = pipeline.isRunning || pipeline.isComplete || Boolean(pipeline.error);
  const effectiveWritten = editedWritten ?? pipeline.written;

  const handleStart = (input: StartV3PipelineInput) => {
    setEditedWritten(null);
    void pipeline.start(input);
  };

  const handleReset = () => {
    pipeline.reset();
    setEditedWritten(null);
  };

  return (
    <div className="min-h-screen bg-[var(--bg-0)]">
      <div className="mx-auto max-w-7xl px-4 py-8 space-y-6">
        {/* Header strip */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[var(--bullet-confirm)]">
              Resume v3
            </h1>
            <p className="text-sm text-[var(--text-muted)] mt-0.5">
              Attribution-first resume tailoring
            </p>
          </div>
          {showResults && (
            <GlassButton
              variant="ghost"
              size="sm"
              onClick={handleReset}
              disabled={pipeline.isRunning}
            >
              <RefreshCw className="h-4 w-4 mr-1.5" />
              Start over
            </GlassButton>
          )}
        </div>

        {/* Stage progress (visible whenever a run has started) */}
        {showResults && (
          <GlassCard className="p-6">
            <V3StageProgress
              stageStatus={pipeline.stageStatus}
              currentStage={pipeline.currentStage}
            />
            {pipeline.costs && (
              <div className="mt-4 flex items-center justify-end gap-4 text-[11px] text-[var(--text-soft)]">
                {pipeline.timings?.totalMs !== undefined && (
                  <span>
                    {(pipeline.timings.totalMs / 1000).toFixed(1)}s
                  </span>
                )}
                <span>
                  ${pipeline.costs.total.toFixed(3)}
                </span>
              </div>
            )}
          </GlassCard>
        )}

        {/* Error banner */}
        {pipeline.error && (
          <GlassCard className="p-4 border-[var(--badge-red-text)]/40">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-[var(--badge-red-text)] flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="text-sm font-semibold text-[var(--text-strong)]">
                  Pipeline failed {pipeline.errorStage ? `at ${pipeline.errorStage}` : ''}
                </div>
                <p className="text-sm text-[var(--text-muted)] mt-1 font-mono text-[12px]">
                  {pipeline.error}
                </p>
              </div>
            </div>
          </GlassCard>
        )}

        {/* Intake form */}
        {showIntake && (
          <V3IntakeForm
            onSubmit={handleStart}
            initialResumeText={initialResumeText}
            disabled={pipeline.isRunning}
          />
        )}

        {/* Results layout */}
        {showResults && (
          <div className="grid lg:grid-cols-[320px_1fr_300px] gap-6">
            {/* Left: strategy */}
            <div className="space-y-4">
              <V3StrategyPanel strategy={pipeline.strategy} />
            </div>

            {/* Center: resume */}
            <div>
              <V3ResumeView
                structured={pipeline.structured}
                written={effectiveWritten}
                verify={pipeline.verify}
                editable={pipeline.isComplete}
                onEdit={(updated) => setEditedWritten(updated)}
              />
            </div>

            {/* Right: verify */}
            <div className="space-y-4">
              <V3VerifyPanel verify={pipeline.verify} isRunning={pipeline.isRunning} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
