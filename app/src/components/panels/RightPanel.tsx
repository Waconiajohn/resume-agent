import { Component, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { ResumePanel } from '../ResumePanel';
import { OnboardingSummaryPanel } from './OnboardingSummaryPanel';
import { ResearchDashboardPanel } from './ResearchDashboardPanel';
import { GapAnalysisPanel } from './GapAnalysisPanel';
import { DesignOptionsPanel } from './DesignOptionsPanel';
import { LiveResumePanel } from './LiveResumePanel';
import { QualityDashboardPanel } from './QualityDashboardPanel';
import { CoverLetterPanel } from './CoverLetterPanel';
import { InterviewPrepPanel } from './InterviewPrepPanel';
import type { PanelType } from '@/types/panels';
import type {
  OnboardingSummaryData,
  ResearchDashboardData,
  GapAnalysisData,
  DesignOptionsData,
  LiveResumeData,
  QualityDashboardData,
  CoverLetterData,
  InterviewPrepData,
} from '@/types/panels';
import type { FinalResume } from '@/types/resume';

// Error boundary to prevent panel crashes from black-screening the app
class PanelErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('[RightPanel] Panel render error:', error);
  }

  componentDidUpdate(prevProps: { children: ReactNode }) {
    // Reset error state when children change (new panel data)
    if (prevProps.children !== this.props.children && this.state.hasError) {
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
        <AlertTriangle className="h-8 w-8 text-amber-400/40" />
        <p className="text-sm text-white/40">
          Panel data couldn't be displayed. It will update on the next event.
        </p>
      </div>
    </div>
  );
}

interface RightPanelProps {
  panelType: PanelType | null;
  panelData: Record<string, unknown> | null;
  resume: FinalResume | null;
}

function PanelContent({ panelType, panelData, resume }: RightPanelProps) {
  // If we have panel data for a specific type, render that panel
  if (panelType && panelData) {
    switch (panelType) {
      case 'onboarding_summary':
        return <OnboardingSummaryPanel data={panelData as unknown as OnboardingSummaryData} />;
      case 'research_dashboard':
        return <ResearchDashboardPanel data={panelData as unknown as ResearchDashboardData} />;
      case 'gap_analysis':
        return <GapAnalysisPanel data={panelData as unknown as GapAnalysisData} />;
      case 'design_options':
        return <DesignOptionsPanel data={panelData as unknown as DesignOptionsData} />;
      case 'live_resume':
        return <LiveResumePanel data={panelData as unknown as LiveResumeData} />;
      case 'quality_dashboard':
        return <QualityDashboardPanel data={panelData as unknown as QualityDashboardData} />;
      case 'cover_letter':
        return <CoverLetterPanel data={panelData as unknown as CoverLetterData} />;
      case 'interview_prep':
        return <InterviewPrepPanel data={panelData as unknown as InterviewPrepData} />;
    }
  }

  // Fallback to resume panel
  return <ResumePanel resume={resume} />;
}

export function RightPanel(props: RightPanelProps) {
  return (
    <PanelErrorBoundary
      key={props.panelType ?? 'resume'}
      fallback={<PanelError />}
    >
      <PanelContent {...props} />
    </PanelErrorBoundary>
  );
}
