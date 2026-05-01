import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  FileText,
  Handshake,
  MessagesSquare,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  UserRoundCheck,
  Workflow,
} from 'lucide-react';
import { GlassButton } from '@/components/GlassButton';

function useFadeIn() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('opacity-100', 'translate-y-0');
          el.classList.remove('opacity-0', 'translate-y-3');
          observer.unobserve(el);
        }
      },
      { threshold: 0.12 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return ref;
}

const FADE_CLASS = 'opacity-100 translate-y-0 transition-all duration-700 ease-out';

const HERO_SIGNALS = [
  '3 free Resume Runs every month',
  'No credit card required',
  'Email confirmation stays on',
];

const WORKFLOW_ITEMS = [
  {
    icon: UserRoundCheck,
    title: 'Benchmark Profile',
    copy: 'The source of truth for your career proof, positioning, and why-me story.',
  },
  {
    icon: Search,
    title: 'Job Search',
    copy: 'Fresh broad listings and insider opportunities with recency limits by default.',
  },
  {
    icon: FileText,
    title: 'Applications',
    copy: 'Role-specific resumes, cover letters, and application workspace in one place.',
  },
  {
    icon: Handshake,
    title: 'Networking',
    copy: 'Warm outreach, follow-ups, thank-you notes, and interview prep tied to the role.',
  },
];

const METHOD_STEPS = [
  {
    title: 'Build the foundation',
    copy: 'Load your complete career history once and turn it into a reusable Benchmark Profile.',
  },
  {
    title: 'Pick the role',
    copy: 'Search current jobs, inspect the role, and decide whether the match is worth pursuing.',
  },
  {
    title: 'Ship the application',
    copy: 'Generate focused materials, revise them, and keep the next action visible.',
  },
];

const PERSONAS = [
  'Executives moving into larger scope',
  'Experienced leaders who need a sharper story',
  'Operators with strong proof but messy career paths',
  'Outplacement teams supporting many job seekers',
];

const FAQ_ITEMS = [
  {
    q: 'Is this only a resume builder?',
    a: 'No. The resume is one part of the workspace. CareerIQ also supports job search, application tracking, networking, cover letters, interview prep, scheduling, thank-you notes, and follow-up.',
  },
  {
    q: 'Does it make things up?',
    a: 'It should not. The product is designed around your actual career evidence. You still review and approve final materials before using them.',
  },
  {
    q: 'Can I sign in with Google, Microsoft, or LinkedIn?',
    a: 'Yes. The app supports those Supabase social sign-ins. Each provider still needs to be enabled in the Supabase dashboard with its own client credentials.',
  },
  {
    q: 'Is this built for outplacement?',
    a: 'The current launch uses individual Supabase accounts. The identity layer is being set up so employer-sponsored seats can use the same product foundation later.',
  },
];

function ProductPreview() {
  return (
    <div className="mx-auto mt-10 w-full max-w-5xl overflow-hidden rounded-[8px] border border-[var(--line-soft)] bg-[var(--surface-1)] shadow-[var(--shadow-mid)]">
      <div className="flex items-center justify-between border-b border-[var(--line-soft)] bg-[var(--surface-2)] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--badge-red-text)]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--badge-amber-text)]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--badge-green-text)]" />
        </div>
        <span className="text-xs font-bold text-[var(--text-soft)]">Workspace preview</span>
      </div>
      <div className="lg:flex">
        <aside className="hidden border-r border-[var(--line-soft)] bg-[var(--surface-2)] p-4 lg:block lg:w-60 lg:shrink-0">
          <div className="mb-5 flex items-center gap-2">
            <BriefcaseBusiness className="h-5 w-5 text-[var(--link)]" />
            <span className="text-sm font-extrabold text-[var(--text-strong)]">CareerIQ</span>
          </div>
          {['Benchmark', 'Jobs', 'Applications', 'Networking', 'Interview prep'].map((item, index) => (
            <div
              key={item}
              className={`mb-2 rounded-[8px] px-3 py-2 text-sm font-bold ${
                index === 1
                  ? 'bg-[var(--badge-blue-bg)] text-[var(--badge-blue-text)]'
                  : 'text-[var(--text-soft)]'
              }`}
            >
              {item}
            </div>
          ))}
        </aside>
        <div className="p-4 sm:p-6 lg:flex-1">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase text-[var(--link)]">Job command center</p>
              <h2 className="mt-1 text-xl font-extrabold text-[var(--text-strong)]">Director of Operations search</h2>
            </div>
            <div className="inline-flex w-fit items-center gap-2 rounded-[8px] border border-[var(--line-soft)] bg-[var(--surface-2)] px-3 py-2 text-xs font-bold text-[var(--text-muted)]">
              <Sparkles className="h-4 w-4 text-[var(--link)]" />
              30-day freshness
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-[8px] border border-[var(--line-soft)] bg-[var(--surface-2)] p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <span className="text-sm font-extrabold text-[var(--text-strong)]">Role matches</span>
                <span className="rounded-full bg-[var(--badge-green-bg)] px-2.5 py-1 text-xs font-extrabold text-[var(--badge-green-text)]">Ready</span>
              </div>
              {[
                ['COO', 'Manufacturing systems leader', 'Strong fit'],
                ['VP Operations', 'Multi-site transformation', 'Warm path'],
                ['Director Product', 'Salesforce platform owner', 'Review'],
              ].map(([title, detail, status]) => (
                <div key={title} className="mb-3 rounded-[8px] border border-[var(--line-soft)] bg-[var(--surface-3)] p-3 last:mb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-extrabold text-[var(--text-strong)]">{title}</div>
                      <div className="mt-1 text-xs font-medium text-[var(--text-soft)]">{detail}</div>
                    </div>
                    <div className="text-xs font-bold text-[var(--link)]">{status}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-[8px] border border-[var(--line-soft)] bg-[var(--surface-2)] p-4">
              <span className="text-sm font-extrabold text-[var(--text-strong)]">Next action</span>
              <div className="mt-4 rounded-[8px] border border-[var(--line-soft)] bg-[var(--surface-3)] p-4">
                <div className="flex items-start gap-3">
                  <Target className="mt-0.5 h-5 w-5 text-[var(--link)]" />
                  <div>
                    <div className="text-sm font-extrabold text-[var(--text-strong)]">Tailor resume</div>
                    <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
                      Pull proof from the Benchmark Profile and align it to this role before applying.
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                {['Proof', 'Resume', 'Outreach'].map((item) => (
                  <div key={item} className="rounded-[8px] bg-[var(--accent-muted)] px-2 py-3 text-xs font-bold text-[var(--text-muted)]">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SalesNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--line-soft)] bg-[var(--surface-0)]/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to="/sales" className="flex items-center gap-2 text-[16px] font-extrabold tracking-normal text-[var(--text-strong)]">
          <BriefcaseBusiness className="h-5 w-5 text-[var(--link)]" />
          Career<span className="text-[var(--link)]">IQ</span>
        </Link>
        <div className="flex items-center gap-2">
          <a
            href="#how-it-works"
            className="hidden rounded-[8px] px-3 py-2 text-[13px] font-bold text-[var(--text-muted)] transition-colors hover:text-[var(--text-strong)] sm:inline-flex"
          >
            How it works
          </a>
          <a
            href="/workspace"
            className="rounded-[8px] border border-[var(--line-strong)] bg-[var(--surface-3)] px-3 py-2 text-[13px] font-bold text-[var(--text-strong)] transition-colors hover:border-[var(--link)]"
          >
            Sign In
          </a>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  const ref = useFadeIn();

  return (
    <section className="relative overflow-hidden border-b border-[var(--line-soft)] px-4 pb-14 pt-12 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(5,102,141,0.08)_1px,transparent_1px),linear-gradient(180deg,rgba(5,102,141,0.06)_1px,transparent_1px)] bg-[length:64px_64px]" />
      <div ref={ref} className={`relative mx-auto max-w-6xl ${FADE_CLASS}`}>
        <div className="max-w-3xl">
          <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-[var(--link)]">
            Career workspace for serious job searches
          </p>
          <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-normal text-[var(--text-strong)] sm:text-5xl lg:text-6xl">
            CareerIQ job search workspace
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--text-muted)] sm:text-lg">
            Build the profile, job search, resume, outreach, interview prep, and follow-up materials for a focused search without scattering the work across ten tools.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a href="/workspace?auth=signup">
              <GlassButton size="lg">
                Get started free
                <ArrowRight className="h-4 w-4" />
              </GlassButton>
            </a>
            <a
              href="#workspace"
              className="inline-flex min-h-[48px] items-center rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-3)] px-5 py-3 text-[15px] font-bold text-[var(--text-strong)] transition-colors hover:border-[var(--link)] hover:bg-[var(--badge-blue-bg)] hover:text-[var(--badge-blue-text)]"
            >
              See the workspace
            </a>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            {HERO_SIGNALS.map((signal) => (
              <span key={signal} className="inline-flex items-center gap-2 rounded-full border border-[var(--line-soft)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-bold text-[var(--text-muted)]">
                <CheckCircle2 className="h-3.5 w-3.5 text-[var(--badge-green-text)]" />
                {signal}
              </span>
            ))}
          </div>
        </div>
        <div id="workspace" className="scroll-mt-20">
          <ProductPreview />
        </div>
      </div>
    </section>
  );
}

function WorkflowSection() {
  const ref = useFadeIn();

  return (
    <section className="py-16 sm:py-20">
      <div ref={ref} className={`mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 ${FADE_CLASS}`}>
        <div className="max-w-2xl">
          <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[var(--link)]">What it replaces</p>
          <h2 className="mt-3 text-3xl font-extrabold text-[var(--text-strong)] sm:text-4xl">
            One workspace for the full consumer journey.
          </h2>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {WORKFLOW_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.title} className="rounded-[8px] border border-[var(--line-soft)] bg-[var(--surface-1)] p-5">
                <Icon className="h-6 w-6 text-[var(--link)]" />
                <h3 className="mt-4 text-base font-extrabold text-[var(--text-strong)]">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{item.copy}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function MethodSection() {
  const ref = useFadeIn();

  return (
    <section id="how-it-works" className="border-y border-[var(--line-soft)] bg-[var(--surface-1)] py-16 sm:py-20 scroll-mt-16">
      <div ref={ref} className={`mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 ${FADE_CLASS}`}>
        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[var(--link)]">How it works</p>
            <h2 className="mt-3 text-3xl font-extrabold text-[var(--text-strong)] sm:text-4xl">
              Strategy first. Writing second.
            </h2>
            <p className="mt-4 text-base leading-7 text-[var(--text-muted)]">
              CareerIQ starts by organizing the evidence. The writing is stronger because the system already understands the target role and your proof.
            </p>
          </div>
          <div className="grid gap-4">
            {METHOD_STEPS.map((step, index) => (
              <article key={step.title} className="flex gap-4 rounded-[8px] border border-[var(--line-soft)] bg-[var(--surface-2)] p-5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-[var(--badge-blue-bg)] text-sm font-extrabold text-[var(--link)]">
                  {index + 1}
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[var(--text-strong)]">{step.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">{step.copy}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function AudienceSection() {
  const ref = useFadeIn();

  return (
    <section className="py-16 sm:py-20">
      <div ref={ref} className={`mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 ${FADE_CLASS}`}>
        <div className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-center">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[var(--link)]">Built for</p>
            <h2 className="mt-3 text-3xl font-extrabold text-[var(--text-strong)] sm:text-4xl">
              Experienced candidates with more proof than their resume shows.
            </h2>
          </div>
          <div className="grid gap-3">
            {PERSONAS.map((persona) => (
              <div key={persona} className="flex items-center gap-3 rounded-[8px] border border-[var(--line-soft)] bg-[var(--surface-1)] p-4">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--badge-green-text)]" />
                <span className="text-sm font-bold text-[var(--text-muted)]">{persona}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function TrustSection() {
  const ref = useFadeIn();

  return (
    <section className="border-y border-[var(--line-soft)] bg-[var(--surface-1)] py-16 sm:py-20">
      <div ref={ref} className={`mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 ${FADE_CLASS}`}>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { icon: ShieldCheck, title: 'Supabase Auth', copy: 'Email/password and social sign-ins use the same session provider.' },
            { icon: Workflow, title: 'Production path', copy: 'The identity model is ready for outplacement seats without swapping today\'s user system.' },
            { icon: MessagesSquare, title: 'Human review', copy: 'Generated materials are drafts. The user reviews before sending anything.' },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.title} className="rounded-[8px] border border-[var(--line-soft)] bg-[var(--surface-2)] p-5">
                <Icon className="h-6 w-6 text-[var(--link)]" />
                <h3 className="mt-4 text-base font-extrabold text-[var(--text-strong)]">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{item.copy}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-[var(--line-soft)] last:border-none">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-4 py-5 text-left"
        aria-expanded={open}
      >
        <span className="text-base font-extrabold text-[var(--text-strong)]">{q}</span>
        <ChevronDown
          size={18}
          className={`shrink-0 text-[var(--text-soft)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <p className="pb-5 text-sm leading-6 text-[var(--text-muted)]">{a}</p>
      )}
    </div>
  );
}

function FAQSection() {
  const ref = useFadeIn();

  return (
    <section className="py-16 sm:py-20">
      <div ref={ref} className={`mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 ${FADE_CLASS}`}>
        <h2 className="text-3xl font-extrabold text-[var(--text-strong)] sm:text-4xl">
          Common questions
        </h2>
        <div className="mt-8 rounded-[8px] border border-[var(--line-soft)] bg-[var(--surface-1)] px-5">
          {FAQ_ITEMS.map((item) => (
            <FAQItem key={item.q} q={item.q} a={item.a} />
          ))}
        </div>
      </div>
    </section>
  );
}

function CTASection() {
  const ref = useFadeIn();

  return (
    <section className="border-t border-[var(--line-soft)] bg-[var(--surface-1)] py-16 sm:py-20">
      <div ref={ref} className={`mx-auto max-w-6xl px-4 text-center sm:px-6 lg:px-8 ${FADE_CLASS}`}>
        <h2 className="mx-auto max-w-2xl text-3xl font-extrabold text-[var(--text-strong)] sm:text-4xl">
          Start with the profile. Then move the search.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-[var(--text-muted)]">
          Create the account, confirm your email, and build the foundation for your next application.
        </p>
        <div className="mt-8">
          <a href="/workspace?auth=signup">
            <GlassButton size="lg">
              Create free account
              <ArrowRight className="h-4 w-4" />
            </GlassButton>
          </a>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[var(--line-soft)] py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 text-sm font-medium text-[var(--text-soft)] sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span>CareerIQ by Agentic.AI</span>
          <div className="flex flex-wrap gap-5">
            <a href="/workspace" className="text-[var(--text-muted)] transition-colors hover:text-[var(--link)]">
              Sign In
            </a>
            <Link to="/terms" className="text-[var(--text-muted)] transition-colors hover:text-[var(--link)]">
              Terms
            </Link>
            <Link to="/privacy" className="text-[var(--text-muted)] transition-colors hover:text-[var(--link)]">
              Privacy
            </Link>
            <Link to="/contact" className="text-[var(--text-muted)] transition-colors hover:text-[var(--link)]">
              Contact
            </Link>
          </div>
        </div>
        <span>&copy; 2026 All rights reserved</span>
      </div>
    </footer>
  );
}

export function SalesPage() {
  useEffect(() => {
    document.title = 'CareerIQ Job Search Workspace';
  }, []);

  return (
    <div className="min-h-screen bg-surface">
      <SalesNav />
      <Hero />
      <WorkflowSection />
      <MethodSection />
      <AudienceSection />
      <TrustSection />
      <FAQSection />
      <CTASection />
      <Footer />
    </div>
  );
}
