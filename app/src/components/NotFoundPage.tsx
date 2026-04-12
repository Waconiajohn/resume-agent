import { useEffect } from 'react';
import { Link } from 'react-router-dom';

export function NotFoundPage() {
  useEffect(() => { document.title = 'Page Not Found | CareerIQ'; }, []);

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-4 text-center"
      style={{ background: 'var(--bg-0)' }}
    >
      <p className="mb-3 text-7xl font-bold" style={{ color: 'var(--line-soft)' }} aria-hidden="true">
        404
      </p>
      <h1 className="mb-3 text-2xl font-semibold" style={{ color: 'var(--text-strong)' }}>
        Page not found
      </h1>
      <p className="mb-8 max-w-sm text-sm" style={{ color: 'var(--text-soft)' }}>
        The page you are looking for does not exist or may have been moved.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          to="/"
          className="rounded-xl px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-80"
          style={{
            background: 'var(--accent-muted)',
            color: 'var(--text-strong)',
            border: '1px solid var(--line-soft)',
          }}
        >
          Go home
        </Link>
        <a
          href="mailto:support@careeriq.app"
          className="rounded-xl px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-80"
          style={{
            color: 'var(--text-soft)',
            border: '1px solid var(--line-soft)',
          }}
        >
          Contact support
        </a>
      </div>
    </div>
  );
}
