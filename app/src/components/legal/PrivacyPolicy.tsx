import { Link } from 'react-router-dom';

const LAST_UPDATED = 'April 10, 2026';

export function PrivacyPolicy() {
  return (
    <div
      className="min-h-screen py-16 px-4"
      style={{ background: 'var(--bg-0)', color: 'var(--text-strong)' }}
    >
      <div className="mx-auto max-w-3xl">
        <div className="mb-10">
          <Link
            to="/"
            className="text-sm transition-colors"
            style={{ color: 'var(--text-soft)' }}
          >
            &larr; Back to home
          </Link>
        </div>

        <h1 className="mb-2 text-3xl font-bold" style={{ color: 'var(--text-strong)' }}>
          Privacy Policy
        </h1>
        <p className="mb-10 text-sm" style={{ color: 'var(--text-soft)' }}>
          Last updated: {LAST_UPDATED}
        </p>

        <div className="space-y-10 text-[0.9375rem] leading-relaxed" style={{ color: 'var(--text-soft)' }}>

          <section>
            <h2 className="mb-3 text-lg font-semibold" style={{ color: 'var(--text-strong)' }}>
              1. Overview
            </h2>
            <p>
              CareerIQ (operated by Agentic.AI) is committed to protecting your privacy. This policy
              explains what information we collect, how we use it, who we share it with, and what
              rights you have over your data. If you have questions, contact us at{' '}
              <a
                href="mailto:support@careeriq.app"
                className="underline"
                style={{ color: 'var(--text-strong)' }}
              >
                support@careeriq.app
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold" style={{ color: 'var(--text-strong)' }}>
              2. Information We Collect
            </h2>

            <h3 className="mb-2 font-medium" style={{ color: 'var(--text-strong)' }}>
              2a. Information you provide directly
            </h3>
            <ul className="mb-4 list-disc space-y-1 pl-6">
              <li>
                <strong style={{ color: 'var(--text-strong)' }}>Account information:</strong> your name,
                email address, and password when you create an account.
              </li>
              <li>
                <strong style={{ color: 'var(--text-strong)' }}>Resume content:</strong> the text of
                your resume, work history, skills, education, and contact details that you upload or paste.
              </li>
              <li>
                <strong style={{ color: 'var(--text-strong)' }}>Job description text:</strong> job
                postings and company information you submit for analysis.
              </li>
              <li>
                <strong style={{ color: 'var(--text-strong)' }}>Interview responses:</strong> answers
                you provide during coaching sessions and positioning interviews.
              </li>
              <li>
                <strong style={{ color: 'var(--text-strong)' }}>Payment information:</strong> billing
                address and payment method details (processed by Stripe; we do not store card numbers).
              </li>
            </ul>

            <h3 className="mb-2 font-medium" style={{ color: 'var(--text-strong)' }}>
              2b. Information collected automatically
            </h3>
            <ul className="list-disc space-y-1 pl-6">
              <li>
                <strong style={{ color: 'var(--text-strong)' }}>Usage data:</strong> which features
                you use, pages you visit, and interactions within the platform.
              </li>
              <li>
                <strong style={{ color: 'var(--text-strong)' }}>Technical data:</strong> IP address,
                browser type, operating system, and device identifiers.
              </li>
              <li>
                <strong style={{ color: 'var(--text-strong)' }}>Session data:</strong> timestamps,
                session duration, and error logs.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold" style={{ color: 'var(--text-strong)' }}>
              3. How We Use Your Information
            </h2>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <strong style={{ color: 'var(--text-strong)' }}>Deliver the service:</strong> your
                resume text and job descriptions are sent to AI language models to generate coaching
                content and resume drafts.
              </li>
              <li>
                <strong style={{ color: 'var(--text-strong)' }}>Improve the platform:</strong> aggregated,
                de-identified usage data helps us understand how features are used and where to improve.
              </li>
              <li>
                <strong style={{ color: 'var(--text-strong)' }}>Communicate with you:</strong> account
                notifications, product updates, and support responses.
              </li>
              <li>
                <strong style={{ color: 'var(--text-strong)' }}>Process payments:</strong> billing
                and subscription management.
              </li>
              <li>
                <strong style={{ color: 'var(--text-strong)' }}>Security and compliance:</strong> fraud
                detection, abuse prevention, and legal obligations.
              </li>
            </ul>
            <p className="mt-4">
              We do not sell your personal data to third parties. We do not use your resume content
              to train our own AI models without explicit consent.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold" style={{ color: 'var(--text-strong)' }}>
              4. Third-Party Services
            </h2>
            <p className="mb-3">
              We share data with the following third-party services to operate the platform:
            </p>
            <div className="space-y-4">
              <div className="rounded-lg p-4" style={{ background: 'var(--surface-elevated)', border: '1px solid var(--line-soft)' }}>
                <p className="font-medium" style={{ color: 'var(--text-strong)' }}>Supabase (database and authentication)</p>
                <p className="mt-1 text-sm">
                  Stores your account data, resume content, and session history. Hosted on AWS. Data
                  is encrypted at rest and in transit.
                </p>
              </div>
              <div className="rounded-lg p-4" style={{ background: 'var(--surface-elevated)', border: '1px solid var(--line-soft)' }}>
                <p className="font-medium" style={{ color: 'var(--text-strong)' }}>Groq / AI Language Model Providers</p>
                <p className="mt-1 text-sm">
                  Your resume text and job descriptions are sent to AI providers for processing.
                  These providers process data to generate responses and do not retain inputs for
                  training by default. See their respective data processing agreements for details.
                </p>
              </div>
              <div className="rounded-lg p-4" style={{ background: 'var(--surface-elevated)', border: '1px solid var(--line-soft)' }}>
                <p className="font-medium" style={{ color: 'var(--text-strong)' }}>Stripe (payments)</p>
                <p className="mt-1 text-sm">
                  Processes all payment transactions. Stripe stores your payment method and billing
                  history. We receive only payment status and a customer identifier.
                </p>
              </div>
              <div className="rounded-lg p-4" style={{ background: 'var(--surface-elevated)', border: '1px solid var(--line-soft)' }}>
                <p className="font-medium" style={{ color: 'var(--text-strong)' }}>Sentry (error monitoring)</p>
                <p className="mt-1 text-sm">
                  Receives anonymized error reports to help us identify and fix bugs. Error reports
                  may include session context but are scrubbed of personally identifiable information.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold" style={{ color: 'var(--text-strong)' }}>
              5. Cookies and Tracking
            </h2>
            <p className="mb-3">
              We use cookies and similar technologies for:
            </p>
            <ul className="list-disc space-y-1 pl-6">
              <li>
                <strong style={{ color: 'var(--text-strong)' }}>Authentication:</strong> keeping you
                signed in across sessions.
              </li>
              <li>
                <strong style={{ color: 'var(--text-strong)' }}>Preferences:</strong> remembering your
                settings and workspace state.
              </li>
              <li>
                <strong style={{ color: 'var(--text-strong)' }}>Analytics:</strong> understanding how
                the platform is used (aggregated, not targeted advertising).
              </li>
            </ul>
            <p className="mt-3">
              We do not use cookies for cross-site advertising or sell cookie data to ad networks.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold" style={{ color: 'var(--text-strong)' }}>
              6. Data Retention
            </h2>
            <p className="mb-3">
              We retain your data for as long as your account is active. Specifically:
            </p>
            <ul className="list-disc space-y-1 pl-6">
              <li>Resume content and session data are kept while your account exists.</li>
              <li>After account deletion, personal data is permanently removed within 30 days.</li>
              <li>Anonymized usage analytics may be retained longer for product improvement.</li>
              <li>Payment records are retained as required by financial regulations (typically 7 years).</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold" style={{ color: 'var(--text-strong)' }}>
              7. Your Rights
            </h2>
            <p className="mb-3">
              Depending on your location, you may have the following rights regarding your personal data:
            </p>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <strong style={{ color: 'var(--text-strong)' }}>Access:</strong> request a copy of
                the personal data we hold about you.
              </li>
              <li>
                <strong style={{ color: 'var(--text-strong)' }}>Correction:</strong> request that we
                correct inaccurate or incomplete data.
              </li>
              <li>
                <strong style={{ color: 'var(--text-strong)' }}>Deletion:</strong> request deletion
                of your account and associated personal data.
              </li>
              <li>
                <strong style={{ color: 'var(--text-strong)' }}>Export:</strong> request an export of
                your resume data and session history in a portable format.
              </li>
              <li>
                <strong style={{ color: 'var(--text-strong)' }}>Opt out:</strong> opt out of
                non-essential communications at any time.
              </li>
            </ul>
            <p className="mt-3">
              To exercise any of these rights, email{' '}
              <a
                href="mailto:support@careeriq.app"
                className="underline"
                style={{ color: 'var(--text-strong)' }}
              >
                support@careeriq.app
              </a>
              . We will respond within 30 days.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold" style={{ color: 'var(--text-strong)' }}>
              8. Data Security
            </h2>
            <p>
              We use industry-standard security measures including TLS encryption in transit,
              encryption at rest in the database, and row-level security policies that prevent
              cross-user data access. Access to production systems is restricted to authorized
              personnel only. However, no system is perfectly secure. If you discover a security
              vulnerability, please report it to{' '}
              <a
                href="mailto:support@careeriq.app"
                className="underline"
                style={{ color: 'var(--text-strong)' }}
              >
                support@careeriq.app
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold" style={{ color: 'var(--text-strong)' }}>
              9. Children&apos;s Privacy
            </h2>
            <p>
              CareerIQ is intended for users 18 years of age and older. We do not knowingly collect
              personal data from anyone under 18. If you believe a minor has created an account,
              contact us and we will remove it promptly.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold" style={{ color: 'var(--text-strong)' }}>
              10. Changes to This Policy
            </h2>
            <p>
              We may update this privacy policy to reflect changes in our practices or applicable law.
              We will update the &ldquo;Last updated&rdquo; date and, for material changes, notify you by
              email. Continued use of the service after a policy update constitutes acceptance.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold" style={{ color: 'var(--text-strong)' }}>
              11. Contact Us
            </h2>
            <p>
              For privacy-related questions or to exercise your rights, contact us at{' '}
              <a
                href="mailto:support@careeriq.app"
                className="underline transition-colors hover:opacity-80"
                style={{ color: 'var(--text-strong)' }}
              >
                support@careeriq.app
              </a>
              .
            </p>
          </section>

        </div>

        <div className="mt-14 border-t pt-8 text-sm" style={{ borderColor: 'var(--line-soft)', color: 'var(--text-soft)' }}>
          <div className="flex flex-wrap gap-4">
            <Link to="/terms" className="underline hover:opacity-80" style={{ color: 'var(--text-soft)' }}>
              Terms of Service
            </Link>
            <Link to="/contact" className="underline hover:opacity-80" style={{ color: 'var(--text-soft)' }}>
              Contact
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
