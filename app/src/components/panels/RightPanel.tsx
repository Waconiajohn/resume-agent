import type { PanelType, PanelData } from '@/types/panels';
import type { FinalResume } from '@/types/resume';
import { SafePanelContent, type PanelRendererProps } from './panel-renderer';

export interface RightPanelProps extends PanelRendererProps {
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

export function RightPanel(props: RightPanelProps) {
  return (
    <SafePanelContent {...props} variant="pane" />
  );
}
