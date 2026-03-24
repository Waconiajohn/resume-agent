import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class LiveResumeDocumentErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[LiveResumeDocument] Render error:', error, errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 bg-[var(--bg-1)] px-6 text-center">
          <p className="text-sm font-medium text-[var(--text-muted)]">
            Unable to render the resume document.
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            className="rounded-md bg-[var(--accent-muted)] px-4 py-2 text-xs font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-1)]"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
