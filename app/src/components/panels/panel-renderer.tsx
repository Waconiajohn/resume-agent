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
import { SectionWorkbench } from './SectionWorkbench';
import { QuestionnairePanel } from './QuestionnairePanel';
import type { PanelData, PanelType, SectionWorkbenchContext } from '@/types/panels';
import type { QuestionnaireSubmission } from '@/types/session';
import type { FinalResume } from '@/types/resume';

export interface PanelRendererProps {
  panelType: PanelType | null;
  panelData: PanelData | null;
  resume: FinalResume | null;
  isProcessing?: boolean;
  onSendMessage?: (content: string) => void;
  onPipelineRespond?: (gate: string, response: unknown) => void;
  onSaveCurrentResumeAsBase?: (
    mode: 'default' | 'alternate',
  ) => Promise<{ success: boolean; message: string }>;
  onDismissSuggestion?: (id: string) => void;
}

type RenderVariant = 'inline' | 'pane';

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
    console.error('[panel-renderer] Panel render error:', error);
  }

  componentDidUpdate(prevProps: { children: ReactNode; resetKey: string }) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

function PanelError({ message }: { message?: string }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <AlertTriangle className="h-8 w-8 text-white/28" />
        <p className="text-sm text-white/50">
          {message ?? "Panel data couldn't be displayed. It will update on the next event."}
        </p>
      </div>
    </div>
  );
}

export function validatePanelData(panelData: PanelData | null): string | null {
  if (!panelData) return null;

  switch (panelData.type) {
    case 'section_review':
      if (typeof panelData.section !== 'string' || typeof panelData.content !== 'string') {
        return 'Section review payload is missing section or content.';
      }
      return null;
    case 'blueprint_review':
      if (!panelData.section_plan?.order || !Array.isArray(panelData.section_plan.order)) {
        return 'Blueprint payload is missing section order.';
      }
      return null;
    case 'live_resume':
      if (typeof panelData.active_section !== 'string') {
        return 'Live resume payload is missing active section.';
      }
      if (!Array.isArray(panelData.changes)) {
        return 'Live resume payload is missing changes array.';
      }
      return null;
    case 'positioning_interview':
      if (
        typeof panelData.questions_total !== 'number'
        || typeof panelData.questions_answered !== 'number'
      ) {
        return 'Positioning interview payload is incomplete.';
      }
      return null;
    case 'questionnaire':
      if (!panelData.questionnaire_id || !Array.isArray(panelData.questions)) {
        return 'Questionnaire payload is missing required fields.';
      }
      return null;
    case 'quality_dashboard':
    case 'completion':
    case 'onboarding_summary':
    case 'research_dashboard':
    case 'gap_analysis':
    case 'design_options':
      return null;
    default:
      return 'Unknown panel type.';
  }
}

function renderPanelBody(props: PanelRendererProps) {
  const {
    panelData,
    resume,
    isProcessing,
    onSendMessage,
    onPipelineRespond,
    onSaveCurrentResumeAsBase,
    onDismissSuggestion,
  } = props;

  if (!panelData) {
    return <ResumePanel resume={resume} />;
  }

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
          onApprove={(edits) => {
            onPipelineRespond?.('architect_review', edits
              ? { approved: true, edits }
              : true,
            );
          }}
        />
      );
    case 'section_review': {
      const sectionData = panelData as PanelData & { context?: SectionWorkbenchContext | null };
      return (
        <SectionWorkbench
          section={panelData.section}
          content={panelData.content}
          reviewToken={panelData.review_token}
          context={sectionData.context ?? null}
          onApprove={() => {
            onPipelineRespond?.(`section_review_${panelData.section}`, {
              approved: true,
              review_token: panelData.review_token,
            });
          }}
          onApproveRemainingBundle={() => {
            onPipelineRespond?.(`section_review_${panelData.section}`, {
              approved: true,
              approve_remaining_review_bundle: true,
              review_token: panelData.review_token,
            });
          }}
          onApproveCurrentBundle={() => {
            onPipelineRespond?.(`section_review_${panelData.section}`, {
              approved: true,
              approve_remaining_current_bundle: true,
              review_token: panelData.review_token,
            });
          }}
          onRequestChanges={(feedback, reviewToken) => {
            onPipelineRespond?.(`section_review_${panelData.section}`, {
              approved: false,
              feedback,
              review_token: reviewToken ?? panelData.review_token,
            });
          }}
          onDirectEdit={(editedContent, reviewToken) => {
            onPipelineRespond?.(`section_review_${panelData.section}`, {
              approved: false,
              edited_content: editedContent,
              review_token: reviewToken ?? panelData.review_token,
            });
          }}
          onDismissSuggestion={onDismissSuggestion}
        />
      );
    }
    case 'questionnaire':
      return (
        <QuestionnairePanel
          key={panelData.questionnaire_id}
          data={panelData}
          onComplete={(submission: QuestionnaireSubmission) => {
            onPipelineRespond?.(`questionnaire_${panelData.questionnaire_id}`, submission);
          }}
        />
      );
    default: {
      const _exhaustive: never = panelData;
      console.warn('Unhandled panel type:', (_exhaustive as PanelData).type);
      return <PanelError message="Unknown panel type." />;
    }
  }
}

function djb2Hash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

function contentHash(data: unknown): string {
  try {
    return djb2Hash(JSON.stringify(data));
  } catch {
    return '0';
  }
}

export function SafePanelContent(
  props: PanelRendererProps & { variant?: RenderVariant },
) {
  const { variant = 'pane', panelType, panelData } = props;
  const validationError = validatePanelData(panelData);
  const resetKey = `${panelType ?? 'resume'}-${contentHash(panelData)}`;
  const frameClass = variant === 'inline' ? 'inline-panel-host' : 'right-panel-shell';

  return (
    <div className={frameClass}>
      <PanelErrorBoundary
        key={panelType ?? 'resume'}
        resetKey={resetKey}
        fallback={<PanelError />}
      >
        {validationError ? <PanelError message={validationError} /> : renderPanelBody(props)}
      </PanelErrorBoundary>
    </div>
  );
}
