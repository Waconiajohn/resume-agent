import { Component, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { ResumePanel } from '../ResumePanel';
import { OnboardingSummaryPanel } from './OnboardingSummaryPanel';
import { ResearchDashboardPanel } from './ResearchDashboardPanel';
import { GapAnalysisPanel } from './GapAnalysisPanel';
import { DesignOptionsPanel } from './DesignOptionsPanel';
import { LiveResumePanel } from './LiveResumePanel';
import { QualityDashboardPanel } from './QualityDashboardPanel';
import { CompletionPanel } from './CompletionPanel';
import { PositioningInterviewPanel } from './PositioningInterviewPanel';
import { BlueprintReviewPanel } from './BlueprintReviewPanel';
import { SectionReviewPanel } from './SectionReviewPanel';
import type { PanelType, PanelData } from '@/types/panels';
import type { FinalResume } from '@/types/resume';

// Error boundary to prevent panel crashes from black-screening the app
class PanelErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode; resetKey: string },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; fallback: ReactNode; resetKey: string }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('[RightPanel] Panel render error:', error);
  }

  componentDidUpdate(prevProps: { children: ReactNode; resetKey: string }) {
    // 3N: Reset error state when resetKey changes (new data)
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

function PanelError() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <AlertTriangle className="h-8 w-8 text-white/28" />
        <p className="text-sm text-white/50">
          Panel data couldn't be displayed. It will update on the next event.
        </p>
      </div>
    </div>
  );
}

export interface RightPanelProps {
  panelType: PanelType | null;
  panelData: PanelData | null;
  resume: FinalResume | null;
  isProcessing?: boolean;
  onSendMessage?: (content: string) => void;
  onPipelineRespond?: (gate: string, response: unknown) => void;
  onSaveCurrentResumeAsBase?: (
    mode: 'default' | 'alternate',
  ) => Promise<{ success: boolean; message: string }>;
}

export function PanelContent(props: RightPanelProps) {
  const { panelData, resume, isProcessing, onSendMessage, onPipelineRespond, onSaveCurrentResumeAsBase } = props;
  // If we have typed panel data, use the discriminated union switch
  if (panelData) {
    switch (panelData.type) {
      case 'onboarding_summary':
        return <OnboardingSummaryPanel data={panelData} />;
      case 'research_dashboard':
        return <ResearchDashboardPanel data={panelData} />;
      case 'gap_analysis':
        return <GapAnalysisPanel data={panelData} />;
      case 'design_options':
        return <DesignOptionsPanel data={panelData} />;
      case 'live_resume':
        return <LiveResumePanel data={panelData} isProcessing={isProcessing} onSendMessage={onSendMessage} />;
      case 'quality_dashboard':
        return <QualityDashboardPanel data={panelData} />;
      case 'completion':
        return (
          <CompletionPanel
            data={panelData}
            resume={resume}
            onSaveCurrentResumeAsBase={onSaveCurrentResumeAsBase}
          />
        );
      case 'positioning_interview':
        return (
          <PositioningInterviewPanel
            data={panelData}
            onRespond={(questionId, answer, selectedSuggestion) => {
              onPipelineRespond?.(`positioning_q_${questionId}`, {
                answer,
                selected_suggestion: selectedSuggestion,
              });
            }}
          />
        );
      case 'blueprint_review':
        return (
          <BlueprintReviewPanel
            data={panelData}
            onApprove={() => {
              onPipelineRespond?.('architect_review', undefined);
            }}
          />
        );
      case 'section_review':
        return (
          <SectionReviewPanel
            section={panelData.section}
            content={panelData.content}
            onApprove={() => {
              onPipelineRespond?.(`section_review_${panelData.section}`, true);
            }}
            onRequestChanges={(feedback) => {
              onPipelineRespond?.(`section_review_${panelData.section}`, false);
              // Send feedback as a chat message so the agent can act on it
              onSendMessage?.(feedback);
            }}
          />
        );
      default: {
        // 3G: Exhaustive check — compile-time safety for unhandled panel types
        const _exhaustive: never = panelData;
        console.warn('Unhandled panel type:', (_exhaustive as PanelData).type);
        return (
          <div className="flex h-full items-center justify-center p-8">
            <p className="text-sm text-white/50">Unknown panel type</p>
          </div>
        );
      }
    }
  }

  // Fallback to resume panel
  return <ResumePanel resume={resume} />;
}

// 3N: Simple hash for error boundary reset key
function simpleHash(data: unknown): string {
  try {
    return String(JSON.stringify(data).length);
  } catch {
    return '0';
  }
}

export function RightPanel(props: RightPanelProps) {
  // 3N: Include data hash in key so error boundary resets on new data
  const resetKey = `${props.panelType ?? 'resume'}-${simpleHash(props.panelData)}`;

  return (
    <div className="right-panel-shell h-full bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01))]">
      <PanelErrorBoundary
        key={props.panelType ?? 'resume'}
        resetKey={resetKey}
        fallback={<PanelError />}
      >
        <PanelContent {...props} />
      </PanelErrorBoundary>
    </div>
  );
}
