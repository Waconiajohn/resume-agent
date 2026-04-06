import { type ReactNode } from 'react';

interface ResumeEditorLayoutProps {
  leftPanel: ReactNode;
  rightPanel: ReactNode;
}

export function ResumeEditorLayout({ leftPanel, rightPanel }: ResumeEditorLayoutProps) {
  return (
    <div className="flex h-full w-full">
      {/* Left panel: editing & coaching */}
      <div className="flex flex-col w-[45%] min-w-[380px] border-r border-[var(--line-soft)] overflow-y-auto">
        {leftPanel}
      </div>

      {/* Right panel: resume preview */}
      <div className="flex-1 overflow-y-auto bg-[var(--bg-1)]">
        {rightPanel}
      </div>
    </div>
  );
}
