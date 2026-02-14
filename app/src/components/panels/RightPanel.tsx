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

interface RightPanelProps {
  panelType: PanelType | null;
  panelData: Record<string, unknown> | null;
  resume: FinalResume | null;
}

export function RightPanel({ panelType, panelData, resume }: RightPanelProps) {
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
