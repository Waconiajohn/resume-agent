import { useEffect } from 'react';
import { Link } from 'react-router-dom';

export function Contact() {
  useEffect(() => { document.title = 'Contact | CareerIQ'; }, []);

  return (
    <div
      className="min-h-screen py-16 px-4"
      style={{ background: 'var(--bg-0)', color: 'var(--text-strong)' }}
    >
      <div className="mx-auto max-w-2xl">
        <div className="mb-10">
          <Link
            to="/"
            className="text-sm transition-colors"
            style={{ color: 'var(--text-soft)' }}
          >
            &larr; Back to home
          </Link>
        </div>

        <h1 className="mb-3 text-3xl font-bold" style={{ color: 'var(--text-strong)' }}>
          Get in touch
        </h1>
        <p className="mb-10 text-base leading-relaxed" style={{ color: 'var(--text-soft)' }}>
          Have a question, found a bug, or need help with your account? We&apos;re here to help.
        </p>

        <div
          className="rounded-2xl p-8"
          style={{ background: 'var(--surface-elevated)', border: '1px solid var(--line-soft)' }}
        >
          <h2 className="mb-2 text-lg font-semibold" style={{ color: 'var(--text-strong)' }}>
            Support
          </h2>
          <p className="mb-4 text-sm" style={{ color: 'var(--text-soft)' }}>
            Email us and we&apos;ll respond within one business day.
          </p>
          <a
            href="mailto:support@careeriq.app"
            className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-80"
            style={{
              background: 'var(--accent-muted)',
              color: 'var(--text-strong)',
              border: '1px solid var(--line-soft)',
            }}
          >
            support@careeriq.app
          </a>
        </div>

        <div className="mt-8 space-y-4 text-sm" style={{ color: 'var(--text-soft)' }}>
          <div
            className="rounded-xl p-5"
            style={{ background: 'var(--surface-elevated)', border: '1px solid var(--line-soft)' }}
          >
            <p className="font-medium mb-1" style={{ color: 'var(--text-strong)' }}>Response times</p>
            <p>General support: within 1 business day</p>
            <p>Billing questions: within 1 business day</p>
            <p>Security reports: within 24 hours</p>
          </div>

          <div
            className="rounded-xl p-5"
            style={{ background: 'var(--surface-elevated)', border: '1px solid var(--line-soft)' }}
          >
            <p className="font-medium mb-2" style={{ color: 'var(--text-strong)' }}>Common topics</p>
            <ul className="space-y-1.5">
              <li>Billing and subscription changes</li>
              <li>Account deletion or data export requests</li>
              <li>Technical issues or bug reports</li>
              <li>Feature requests and feedback</li>
              <li>Enterprise and team pricing inquiries</li>
            </ul>
          </div>
        </div>

        <div className="mt-14 border-t pt-8 text-sm" style={{ borderColor: 'var(--line-soft)', color: 'var(--text-soft)' }}>
          <div className="flex flex-wrap gap-4">
            <Link to="/terms" className="underline hover:opacity-80" style={{ color: 'var(--text-soft)' }}>
              Terms of Service
            </Link>
            <Link to="/privacy" className="underline hover:opacity-80" style={{ color: 'var(--text-soft)' }}>
              Privacy Policy
            </Link>
            <Link to="/" className="underline hover:opacity-80" style={{ color: 'var(--text-soft)' }}>
              Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
