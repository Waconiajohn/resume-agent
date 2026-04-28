import { useRef, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { ScoreRing } from '@/components/shared/ScoreRing';

/* ------------------------------------------------------------------ */
/*  Scroll-triggered fade-in                                          */
/* ------------------------------------------------------------------ */

function useFadeIn() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('opacity-100', 'translate-y-0');
          el.classList.remove('opacity-0', 'translate-y-4');
          observer.unobserve(el);
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return ref;
}

const FADE_CLASS = 'opacity-0 translate-y-4 transition-all duration-700 ease-out';

/* ================================================================== */
/*  1. Hero                                                           */
/* ================================================================== */

function Hero() {
  const ref = useFadeIn();
  return (
    <section className="relative flex min-h-[88vh] items-center justify-center overflow-hidden px-6">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            'linear-gradient(90deg, rgba(5,102,141,0.08) 1px, transparent 1px), linear-gradient(180deg, rgba(5,102,141,0.06) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />

      <div ref={ref} className={`relative z-10 mx-auto max-w-3xl text-center ${FADE_CLASS}`}>
        <h1 className="text-4xl font-extrabold tracking-normal text-[var(--text-strong)] sm:text-5xl md:text-6xl">
          Your resume undersells you.
          <br />
          We fix that.
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg font-medium text-[var(--text-muted)]">
          Ten specialized AI agents that find what you've already done —
          and position you as the benchmark candidate.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          {/* Sprint E4 — Get started CTAs open the signup tab; Sign In in the
              header keeps the default sign-in view. */}
          <a href="/workspace?auth=signup">
            <GlassButton>
              Get started free
            </GlassButton>
          </a>
          <a
            href="#methodology"
            className="rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-3)] px-5 py-2.5 text-sm font-bold text-[var(--text-strong)] shadow-[var(--shadow-low)] transition-colors hover:border-[var(--link)] hover:bg-[var(--badge-blue-bg)] hover:text-[var(--badge-blue-text)]"
          >
            See how it works
          </a>
        </div>
        <p className="mt-5 text-xs font-semibold text-[var(--text-soft)]">
          No credit card required · 3 free Resume Runs every month
        </p>
      </div>
    </section>
  );
}

/* ================================================================== */
/*  1b. Trust/Stats Strip                                              */
/* ================================================================== */

const TRUST_STATS = [
  { value: '10', label: 'specialized AI agents' },
  { value: '3-step', label: 'coaching methodology' },
  { value: 'ATS-ready', label: 'PDF + DOCX export' },
  { value: 'Real', label: 'evidence, not fabrication' },
];

function TrustStrip() {
  const ref = useFadeIn();
  return (
    <section className="border-y border-[var(--line-soft)] bg-[var(--accent-muted)] py-10">
      <div ref={ref} className={`mx-auto max-w-5xl px-6 ${FADE_CLASS}`}>
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          {TRUST_STATS.map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-2xl font-extrabold text-[var(--text-strong)] md:text-3xl">{stat.value}</div>
              <div className="mt-1 text-xs font-bold text-[var(--text-soft)]">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ================================================================== */
/*  Built For Section — role personas, no fake testimonials           */
/* ================================================================== */

const PERSONAS = [
  {
    role: 'Mid-career executives',
    desc: 'Making a pivot into a higher-scope role and struggling to reframe their past work for the next chapter.',
  },
  {
    role: 'Senior leaders over 45',
    desc: 'Tired of being quietly screened out. We surface the accomplishments that make age irrelevant.',
  },
  {
    role: 'Operators with unusual paths',
    desc: 'Non-linear careers, turnarounds, acquisitions — stories that generic resume tools flatten.',
  },
];

function BuiltForSection() {
  const ref = useFadeIn();
  return (
    <section className="py-20 md:py-28">
      <div ref={ref} className={`mx-auto max-w-5xl px-6 ${FADE_CLASS}`}>
        <h2 className="text-center text-3xl font-extrabold text-[var(--text-strong)] sm:text-4xl">
          Built for executives the job boards forget
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-[var(--text-muted)]">
          Most executives have 20 years of real experience and a resume that shows 2.
          We work best when there's a lot beneath the surface to surface.
        </p>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {PERSONAS.map((p) => (
            <GlassCard key={p.role} className="p-6">
              <h3 className="text-lg font-bold text-[var(--text-strong)]">{p.role}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">{p.desc}</p>
            </GlassCard>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ================================================================== */
/*  2. Anti-ChatGPT Problem                                           */
/* ================================================================== */

const PROBLEMS = [
  { title: 'Generic', desc: 'Same resume, different name', accent: 'bg-[var(--badge-red-text)]' },
  { title: 'No Strategy', desc: "It writes what you tell it, not what they need to hear", accent: 'bg-[var(--badge-amber-text)]' },
  { title: 'Age Blind', desc: "It doesn't know what gets you screened out", accent: 'bg-[var(--badge-red-text)]' },
];

function ProblemSection() {
  const ref = useFadeIn();
  return (
    <section className="py-20 md:py-32">
      <div ref={ref} className={`mx-auto max-w-5xl px-6 ${FADE_CLASS}`}>
        <h2 className="text-center text-3xl font-extrabold text-[var(--text-strong)] sm:text-4xl">
          ChatGPT writes resumes. It doesn't build careers.
        </h2>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {PROBLEMS.map((p) => (
            <GlassCard key={p.title} className="p-6">
              <div className={`mb-4 h-2.5 w-2.5 rounded-full ${p.accent}`} />
              <h3 className="text-lg font-bold text-[var(--text-strong)]">{p.title}</h3>
              <p className="mt-2 text-sm text-[var(--text-muted)]">{p.desc}</p>
            </GlassCard>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ================================================================== */
/*  3. Coaching Methodology                                           */
/* ================================================================== */

const DIALOGUE: { isCoach: boolean; text: string }[] = [
  {
    isCoach: true,
    text: "Your resume says 'managed operations.' But you didn't just manage — you inherited a broken supply chain and rebuilt it. Let's lead with that.",
  },
  {
    isCoach: false,
    text: 'I reduced downtime by 40% in the first quarter.',
  },
  {
    isCoach: true,
    text: "Perfect. That's the proof. Now let's frame it as a transformation story, not a task list.",
  },
  {
    isCoach: false,
    text: 'I never thought of it that way. It just felt like doing my job.',
  },
];

function CoachingSection() {
  const ref = useFadeIn();
  return (
    <section id="methodology" className="py-20 md:py-32 scroll-mt-16">
      <div ref={ref} className={`mx-auto max-w-5xl px-6 ${FADE_CLASS}`}>
        <h2 className="text-center text-3xl font-extrabold text-[var(--text-strong)] sm:text-4xl">
          We start with the question hiring managers actually ask
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-[var(--text-muted)]">
          Before writing a single word, we uncover what makes you the obvious choice
        </p>

        <div className="mx-auto mt-14 max-w-lg space-y-4">
          {DIALOGUE.map((line, i) => (
            <div key={i} className={`flex ${line.isCoach ? 'justify-start' : 'justify-end'}`}>
              {line.isCoach && (
                <div className="mr-3 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--badge-blue-bg)] text-[10px] font-bold uppercase tracking-widest text-[var(--link)]">
                  AI
                </div>
              )}
              <div
                className={`rounded-[8px] px-5 py-3.5 text-sm leading-relaxed ${
                  line.isCoach
                    ? 'border border-[var(--link)]/24 bg-[var(--badge-blue-bg)] text-[var(--badge-blue-text)]'
                    : 'border border-[var(--line-strong)] bg-[var(--surface-3)] text-[var(--text-muted)]'
                }`}
                style={{ maxWidth: '78%' }}
              >
                {line.text}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-sm font-bold text-[var(--text-soft)]">
          A strategic conversation, not a form to fill out
        </p>
      </div>
    </section>
  );
}

/* ================================================================== */
/*  4. Blueprint Process (Timeline)                                   */
/* ================================================================== */

const STEPS = [
  { num: 1, title: 'Deep Research', desc: 'We research the company, role, and market' },
  { num: 2, title: 'Gap Analysis', desc: "We identify exactly what's missing" },
  { num: 3, title: 'Strategic Blueprint', desc: 'You approve the architecture before we write' },
  { num: 4, title: 'Precision Writing', desc: 'Every bullet engineered for impact' },
];

function BlueprintSection() {
  const ref = useFadeIn();
  return (
    <section className="py-20 md:py-32">
      <div ref={ref} className={`mx-auto max-w-5xl px-6 ${FADE_CLASS}`}>
        <h2 className="text-center text-3xl font-extrabold text-[var(--text-strong)] sm:text-4xl">
          Built with a blueprint. Not a template.
        </h2>

        <div className="relative mt-14">
          {/* Connector line (desktop only) */}
          <div className="absolute left-0 right-0 top-8 hidden h-px bg-[var(--line-soft)] md:block" />

          <div className="grid gap-8 md:grid-cols-4">
            {STEPS.map((s) => (
              <GlassCard key={s.num} className="relative p-6 pt-12">
                {/* Number circle */}
                <div className="absolute -top-4 left-6 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--link)]/30 bg-[var(--badge-blue-bg)] text-sm font-bold text-[var(--link)]">
                  {s.num}
                </div>
                <h3 className="text-base font-bold text-[var(--text-strong)]">{s.title}</h3>
                <p className="mt-2 text-sm text-[var(--text-muted)]">{s.desc}</p>
              </GlassCard>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ================================================================== */
/*  5. Age-Smart Advantage                                            */
/* ================================================================== */

const BEFORE_ITEMS = [
  'Graduated 1998',
  '25 years of progressive experience',
  'Proficient in Lotus Notes, Visual Basic',
];

const AFTER_ITEMS = [
  'B.S. Computer Science, State University',
  'Seasoned technology leader',
  'Expert in cloud architecture, Python, TypeScript',
];

function AgeSmartSection() {
  const ref = useFadeIn();
  return (
    <section className="py-20 md:py-32">
      <div ref={ref} className={`mx-auto max-w-5xl px-6 ${FADE_CLASS}`}>
        <h2 className="text-center text-3xl font-extrabold text-[var(--text-strong)] sm:text-4xl">
          20 years of experience is an asset.
          <br className="hidden sm:block" />
          Unless your resume says otherwise.
        </h2>

        <div className="mt-14 grid gap-6 md:grid-cols-2">
          {/* Before */}
          <GlassCard className="overflow-hidden">
            <div className="border-b border-[var(--badge-red-text)]/20 bg-[var(--badge-red-bg)] px-6 py-3">
              <span className="text-sm font-semibold uppercase tracking-wider text-[var(--badge-red-text)]">
                Before
              </span>
            </div>
            <div className="space-y-3 p-6">
              {BEFORE_ITEMS.map((text) => (
                <p key={text} className="rounded-lg bg-[var(--badge-red-bg)] px-3 py-2 text-sm text-[var(--badge-red-text)]/80">
                  {text}
                </p>
              ))}
            </div>
          </GlassCard>

          {/* After */}
          <GlassCard className="overflow-hidden">
            <div className="border-b border-[var(--badge-green-text)]/20 bg-[var(--badge-green-bg)] px-6 py-3">
              <span className="text-sm font-semibold uppercase tracking-wider text-[var(--badge-green-text)]">
                After
              </span>
            </div>
            <div className="space-y-3 p-6">
              {AFTER_ITEMS.map((text) => (
                <p key={text} className="rounded-lg bg-[var(--badge-green-bg)] px-3 py-2 text-sm text-[var(--badge-green-text)]">
                  {text}
                </p>
              ))}
            </div>
          </GlassCard>
        </div>

        <p className="mx-auto mt-10 max-w-xl text-center text-sm font-medium text-[var(--text-soft)]">
          We help detect and neutralize age signals that trigger unconscious bias
        </p>
      </div>
    </section>
  );
}

/* ================================================================== */
/*  6. Quality Promise                                                */
/* ================================================================== */

const QUALITY_METRICS = [
  { score: 85, max: 100, label: 'ATS Compliance', color: 'text-[var(--badge-green-text)]', desc: 'Passes automated screening systems' },
  { score: 92, max: 100, label: 'Humanization', color: 'text-[var(--link)]', desc: 'Reads like you wrote it, not a robot' },
  { score: 88, max: 100, label: 'Impact Score', color: 'text-[var(--badge-amber-text)]', desc: 'Every bullet quantified and compelling' },
];

function QualitySection() {
  const ref = useFadeIn();
  return (
    <section className="py-20 md:py-32">
      <div ref={ref} className={`mx-auto max-w-5xl px-6 ${FADE_CLASS}`}>
        <h2 className="text-center text-3xl font-extrabold text-[var(--text-strong)] sm:text-4xl">
          Triple-checked. Not just spell-checked.
        </h2>

        <GlassCard className="mx-auto mt-14 max-w-2xl p-8">
          <div className="flex items-start justify-around">
            {QUALITY_METRICS.map((m) => (
              <div key={m.label} className="flex flex-col items-center gap-3">
                <ScoreRing score={m.score} max={m.max} label={m.label} color={m.color} />
                <p className="max-w-[140px] text-center text-xs font-medium text-[var(--text-soft)]">{m.desc}</p>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>
    </section>
  );
}

/* ================================================================== */
/*  7. Positioning Profile                                            */
/* ================================================================== */

function PositioningSection() {
  const ref = useFadeIn();
  return (
    <section className="py-20 md:py-32">
      <div ref={ref} className={`mx-auto max-w-5xl px-6 ${FADE_CLASS}`}>
        <h2 className="text-center text-3xl font-extrabold text-[var(--text-strong)] sm:text-4xl">
          Answer once. Apply everywhere.
        </h2>

        <div className="mx-auto mt-14 flex max-w-2xl flex-col items-center gap-8 md:flex-row md:justify-center">
          {/* Profile card */}
          <GlassCard className="w-52 shrink-0 p-5">
            <div className="mb-3 h-10 w-10 rounded-[8px] bg-[var(--link)]" />
            <div className="h-3 w-28 rounded bg-[var(--line-strong)]" />
            <div className="mt-2 h-2 w-20 rounded bg-[var(--line-soft)]" />
            <div className="mt-4 space-y-1.5">
              <div className="h-2 w-full rounded bg-[var(--line-soft)]" />
              <div className="h-2 w-3/4 rounded bg-[var(--line-soft)]" />
              <div className="h-2 w-5/6 rounded bg-[var(--line-soft)]" />
            </div>
          </GlassCard>

          {/* Arrows */}
          <div className="flex flex-row gap-4 md:flex-col">
            {['Role A', 'Role B', 'Role C'].map((label) => (
              <div key={label} className="flex items-center gap-2">
                <svg className="hidden h-4 w-6 text-[var(--link)]/50 md:block" viewBox="0 0 24 16" fill="none">
                  <path d="M0 8h20m0 0l-5-5m5 5l-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <GlassCard className="px-3 py-1.5">
                  <span className="text-xs font-semibold text-[var(--text-muted)]">{label}</span>
                </GlassCard>
              </div>
            ))}
          </div>
        </div>

        <p className="mx-auto mt-10 max-w-lg text-center text-sm font-medium text-[var(--text-soft)]">
          Your career story gets sharper with every application. One strategic
          conversation builds a positioning profile that adapts to every role you
          target.
        </p>
      </div>
    </section>
  );
}

/* ================================================================== */
/*  8. Social Proof / Role Tags                                       */
/* ================================================================== */

const ROLES = [
  'VP Engineering', 'Director of Marketing', 'Senior PM', 'CFO',
  'Chief of Staff', 'SVP Operations', 'Head of Product', 'Managing Director',
  'CTO', 'VP Sales', 'Director of HR', 'General Manager',
];

function RoleTagsSection() {
  const ref = useFadeIn();
  return (
    <section className="py-20 md:py-32">
      <div ref={ref} className={`mx-auto max-w-5xl px-6 ${FADE_CLASS}`}>
        <h2 className="text-center text-3xl font-extrabold text-[var(--text-strong)] sm:text-4xl">
          Built for leaders who've outgrown templates
        </h2>

        <div className="mt-14 -mx-6 overflow-x-auto px-6 scrollbar-hide">
          <div className="flex gap-3">
            {ROLES.map((role) => (
              <span
                key={role}
                className="shrink-0 rounded-full border border-[var(--line-strong)] bg-[var(--surface-3)] px-4 py-2 text-sm font-bold text-[var(--text-muted)]"
              >
                {role}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ================================================================== */
/*  9. FAQ                                                            */
/* ================================================================== */

const FAQ_ITEMS = [
  {
    q: 'How is this different from ChatGPT?',
    a: "We don't just rewrite. We analyze the job description, build a benchmark candidate profile, find your positioning gaps, and write a resume that makes you the standard everyone else is measured against. ChatGPT echoes what you give it. We surface what hiring managers are actually looking for — and match you to it.",
  },
  {
    q: 'How long does it take?',
    a: 'About 2-3 minutes for the AI to generate your first draft. Most executives spend 15-30 minutes reviewing and refining with the coach before exporting.',
  },
  {
    q: 'Is my resume data secure?',
    a: 'Yes. Your data is encrypted, never sold, and processed only to build your resume. You can delete your account and all associated data at any time.',
  },
  {
    q: 'What if the AI gets something wrong?',
    a: "Every suggestion is grounded in YOUR actual experience. Our Truth Verification agent checks every claim against your original resume. You review and approve everything before export — nothing ships without your sign-off.",
  },
  {
    q: 'Do I need a different resume for each job?',
    a: "Yes, and that's the point. Each resume is role-specific, optimized for that particular job description, company, and hiring context. Generic resumes get screened out. Targeted ones get interviews.",
  },
];

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
        <span className="text-base font-bold text-[var(--text-strong)]">{q}</span>
        <ChevronDown
          size={18}
          className={`shrink-0 text-[var(--text-soft)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <p className="pb-5 text-sm leading-relaxed text-[var(--text-muted)]">{a}</p>
      )}
    </div>
  );
}

function FAQSection() {
  const ref = useFadeIn();
  return (
    <section className="py-20 md:py-32">
      <div ref={ref} className={`mx-auto max-w-5xl px-6 ${FADE_CLASS}`}>
        <h2 className="text-center text-3xl font-extrabold text-[var(--text-strong)] sm:text-4xl">
          Common Questions
        </h2>
        <GlassCard className="mx-auto mt-14 max-w-2xl px-6 py-2">
          {FAQ_ITEMS.map((item) => (
            <FAQItem key={item.q} q={item.q} a={item.a} />
          ))}
        </GlassCard>
      </div>
    </section>
  );
}

/* ================================================================== */
/*  10. CTA                                                           */
/* ================================================================== */

function CTASection() {
  const ref = useFadeIn();
  return (
    <section className="py-20 md:py-32">
      <div ref={ref} className={`mx-auto max-w-5xl px-6 ${FADE_CLASS}`}>
        <div className="mx-auto max-w-lg text-center">
          <h2 className="text-3xl font-extrabold text-[var(--text-strong)] sm:text-4xl">
            Ready to stop underselling yourself?
          </h2>
          <p className="mt-4 text-[var(--text-muted)]">
            Create your free account and build a resume that lands interviews
          </p>
          <div className="mt-8">
            <a href="/workspace?auth=signup">
              <GlassButton>
                Get Started
              </GlassButton>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ================================================================== */
/*  11. Footer                                                        */
/* ================================================================== */

function Footer() {
  return (
    <footer className="border-t border-[var(--line-soft)] py-10">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-6 text-sm font-medium text-[var(--text-soft)]">
        <span>CareerIQ by Agentic.AI</span>
        <span>&copy; 2026 All rights reserved</span>
        <div className="flex flex-wrap items-center justify-center gap-5">
          <a href="/workspace" className="text-[var(--text-muted)] transition-colors hover:text-[var(--link)]">
            Sign In
          </a>
          <Link to="/terms" className="text-[var(--text-muted)] transition-colors hover:text-[var(--link)]">
            Terms of Service
          </Link>
          <Link to="/privacy" className="text-[var(--text-muted)] transition-colors hover:text-[var(--link)]">
            Privacy Policy
          </Link>
          <Link to="/contact" className="text-[var(--text-muted)] transition-colors hover:text-[var(--link)]">
            Contact
          </Link>
        </div>
      </div>
    </footer>
  );
}

/* ================================================================== */
/*  SalesPage (assembled)                                             */
/* ================================================================== */

/* ================================================================== */
/*  Sales Nav                                                         */
/* ================================================================== */

function SalesNav() {
  return (
    <header
      className="sticky top-0 z-40 border-b border-white/10 bg-[var(--header-bg)]"
    >
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
        <span className="text-[18px] font-extrabold tracking-tight text-white">
          Career<span className="text-[#63c4e6]">IQ</span>
        </span>
        <a
          href="/workspace"
          className="rounded-[8px] border border-white/20 bg-white/[0.04] px-3 py-2 text-[13px] font-bold text-white/80 transition-colors hover:border-white/30 hover:bg-white/[0.08] hover:text-white"
        >
          Sign In
        </a>
      </div>
    </header>
  );
}

/* ================================================================== */
/*  SalesPage (assembled)                                             */
/* ================================================================== */

export function SalesPage() {
  return (
    <div className="min-h-screen bg-surface">
      <SalesNav />
      <Hero />
      <TrustStrip />
      <ProblemSection />
      <CoachingSection />
      <BlueprintSection />
      <AgeSmartSection />
      <QualitySection />
      <PositioningSection />
      <BuiltForSection />
      <RoleTagsSection />
      <FAQSection />
      <CTASection />
      <Footer />
    </div>
  );
}
