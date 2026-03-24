import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error('[ErrorBoundary] Uncaught error:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-4 bg-surface px-6 text-center">
          <h1 className="text-xl font-semibold text-[var(--text-strong)]">Something went wrong</h1>
          <p className="max-w-md text-sm text-[var(--text-muted)]">
            An unexpected error occurred. Please reload to continue.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg border border-[var(--line-strong)] bg-[var(--surface-1)] px-4 py-2 text-sm font-medium text-[var(--text-strong)] transition-colors hover:bg-[var(--surface-2)]"
            >
              Reload page
            </button>
            <button
              onClick={() => { window.location.href = '/workspace'; }}
              className="rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-2 text-sm font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-1)]"
            >
              Return to Home
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
