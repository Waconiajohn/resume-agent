import { useEffect } from 'react';
import { Link } from 'react-router-dom';

const LAST_UPDATED = 'May 1, 2026';

export function TermsOfService() {
  useEffect(() => { document.title = 'Terms of Service | CareerIQ'; }, []);

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
          Terms of Service
        </h1>
        <p className="mb-10 text-sm" style={{ color: 'var(--text-soft)' }}>
          Last updated: {LAST_UPDATED}
        </p>

        <div className="space-y-10 text-[0.9375rem] leading-relaxed" style={{ color: 'var(--text-soft)' }}>

          <section>
            <h2 className="mb-3 text-lg font-semibold" style={{ color: 'var(--text-strong)' }}>
              1. Agreement to Terms
            </h2>
            <p>
              By accessing or using CareerIQ (operated by Agentic.AI), you agree to be bound by these Terms
              of Service and our Privacy Policy. If you do not agree to these terms, please do not use our
              service. These terms apply to all users, including visitors, registered users, and subscribers.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold" style={{ color: 'var(--text-strong)' }}>
              2. Description of Service
            </h2>
            <p className="mb-3">
              CareerIQ is an AI-powered career coaching platform that helps professionals optimize their
              resumes, prepare for interviews, and position themselves for career opportunities. Our services
              include:
            </p>
            <ul className="list-disc space-y-1 pl-6">
              <li>AI-assisted resume writing and optimization</li>
              <li>Cover letter generation</li>
              <li>Job description analysis and gap assessment</li>
              <li>Interview preparation tools</li>
              <li>LinkedIn profile optimization</li>
              <li>Career coaching workflows</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold" style={{ color: 'var(--text-strong)' }}>
              3. User Responsibilities
            </h2>
            <p className="mb-3">You agree to:</p>
            <ul className="list-disc space-y-1 pl-6">
              <li>Provide accurate information about your professional background and experience</li>
              <li>Use the platform only for lawful purposes and in accordance with these terms</li>
              <li>Keep your account credentials secure and notify us immediately of unauthorized access</li>
              <li>Not attempt to reverse-engineer, scrape, or disrupt the platform or its infrastructure</li>
              <li>Not use the platform to generate content that is fraudulent, defamatory, or misleading</li>
              <li>Not share your account with others or resell access to the service</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold" style={{ color: 'var(--text-strong)' }}>
              4. AI-Generated Content Disclaimer
            </h2>
            <p className="mb-3">
              CareerIQ uses large language models and AI systems to generate resume content, career guidance,
              and other materials. You acknowledge and agree that:
            </p>
            <ul className="list-disc space-y-1 pl-6">
              <li>
                AI-generated content is a starting point. You are responsible for reviewing, verifying, and
                ensuring the accuracy of all content before submitting it to employers.
              </li>
              <li>
                CareerIQ does not fabricate credentials, work history, or qualifications. Our AI works only
                with information you provide.
              </li>
              <li>
                We make no guarantee that AI-generated content will result in job interviews, offers, or any
                specific career outcome.
              </li>
              <li>
                AI systems can make errors. Do not rely solely on CareerIQ output without human review.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold" style={{ color: 'var(--text-strong)' }}>
              5. Data Usage
            </h2>
            <p>
              By using CareerIQ, you grant us a limited, non-exclusive license to process the information
              you provide (resume text, job descriptions, career history) solely to deliver the service.
              We do not sell your personal data. For details on how we collect, store, and use your
              information, please review our{' '}
              <Link
                to="/privacy"
                className="underline transition-colors hover:opacity-80"
                style={{ color: 'var(--text-strong)' }}
              >
                Privacy Policy
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold" style={{ color: 'var(--text-strong)' }}>
              6. Payment Terms
            </h2>
            <p className="mb-3">
              Paid subscriptions are billed on a recurring basis (monthly or annually) through our payment
              processor, Stripe. By subscribing, you authorize us to charge your payment method on each
              renewal date.
            </p>
            <ul className="list-disc space-y-1 pl-6">
              <li>
                <strong style={{ color: 'var(--text-strong)' }}>Cancellation:</strong> You may cancel your
                subscription at any time. Cancellation takes effect at the end of the current billing period.
                No partial refunds are issued for unused time.
              </li>
              <li>
                <strong style={{ color: 'var(--text-strong)' }}>Refunds:</strong> We offer a 7-day
                money-back guarantee for new subscribers. Contact{' '}
                <a
                  href="mailto:support@careeriq.app"
                  className="underline"
                  style={{ color: 'var(--text-strong)' }}
                >
                  support@careeriq.app
                </a>{' '}
                within 7 days of your first charge to request a refund.
              </li>
              <li>
                <strong style={{ color: 'var(--text-strong)' }}>Price changes:</strong> We will give at
                least 30 days notice before changing subscription prices.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold" style={{ color: 'var(--text-strong)' }}>
              7. Intellectual Property
            </h2>
            <p className="mb-3">
              The CareerIQ platform, including its design, code, and proprietary AI prompts, is owned by
              Agentic.AI. You retain ownership of all content you input into the platform (your resume
              text, career history, etc.).
            </p>
            <p>
              Content generated by the platform based on your inputs is provided to you for your personal
              use. You may use, edit, and distribute AI-generated resume content freely. You may not
              resell or sublicense access to the platform itself.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold" style={{ color: 'var(--text-strong)' }}>
              8. Termination
            </h2>
            <p className="mb-3">
              Either party may terminate this agreement at any time. We reserve the right to suspend or
              terminate accounts that:
            </p>
            <ul className="list-disc space-y-1 pl-6">
              <li>Violate these terms</li>
              <li>Engage in fraudulent activity</li>
              <li>Attempt to abuse or circumvent platform limits</li>
              <li>Have outstanding unpaid balances</li>
            </ul>
            <p className="mt-3">
              Upon termination, your right to access the service ends. You may request a data export
              before account closure by contacting support.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold" style={{ color: 'var(--text-strong)' }}>
              9. Limitation of Liability
            </h2>
            <p className="mb-3">
              To the fullest extent permitted by applicable law, Agentic.AI and CareerIQ shall not be
              liable for:
            </p>
            <ul className="list-disc space-y-1 pl-6">
              <li>Indirect, incidental, or consequential damages arising from use of the service</li>
              <li>Loss of career opportunities, employment, or income</li>
              <li>Actions taken by employers based on content generated by the platform</li>
              <li>Service interruptions, data loss, or technical failures</li>
            </ul>
            <p className="mt-3">
              Our total liability in any matter related to the service is limited to the amount you paid
              us in the 12 months preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold" style={{ color: 'var(--text-strong)' }}>
              10. Disclaimer of Warranties
            </h2>
            <p>
              The service is provided &ldquo;as is&rdquo; without warranties of any kind, express or implied.
              We do not warrant that the service will be uninterrupted, error-free, or produce any specific
              career outcome. Career results depend on many factors outside our control.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold" style={{ color: 'var(--text-strong)' }}>
              11. Governing Law
            </h2>
            <p>
              These terms are governed by the laws of the State of Delaware, United States, without regard
              to conflict of law principles. Any disputes shall be resolved in the courts of Delaware.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold" style={{ color: 'var(--text-strong)' }}>
              12. Changes to These Terms
            </h2>
            <p>
              We may update these terms from time to time. When we do, we will update the &ldquo;Last
              updated&rdquo; date at the top of this page and, for material changes, notify registered users
              by email. Continued use of the service after changes are posted constitutes acceptance of the
              revised terms.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold" style={{ color: 'var(--text-strong)' }}>
              13. Contact
            </h2>
            <p>
              Questions about these terms? Email us at{' '}
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
            <Link to="/privacy" className="underline hover:opacity-80" style={{ color: 'var(--text-soft)' }}>
              Privacy Policy
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
