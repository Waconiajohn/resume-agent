import { useRef, useEffect } from 'react';
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
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-6">
      {/* Animated gradient overlay */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(135deg, rgba(96,165,250,0.08) 0%, rgba(139,92,246,0.06) 50%, rgba(96,165,250,0.08) 100%)',
          backgroundSize: '200% 200%',
          animation: 'gradient-shift 8s ease infinite',
        }}
      />
      <style>{`@keyframes gradient-shift { 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }`}</style>

      <div ref={ref} className={`relative z-10 mx-auto max-w-3xl text-center ${FADE_CLASS}`}>
        <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl md:text-6xl">
          Your resume undersells you.
          <br />
          We fix that.
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-white/60">
          AI-powered career coaching that understands executive positioning
        </p>
        <div className="mt-10">
          <a href="/app">
            <GlassButton>
              Get Started Free
            </GlassButton>
          </a>
        </div>
      </div>
    </section>
  );
}

/* ================================================================== */
/*  2. Anti-ChatGPT Problem                                           */
/* ================================================================== */

const PROBLEMS = [
  { title: 'Generic', desc: 'Same resume, different name', accent: 'bg-red-400' },
  { title: 'No Strategy', desc: "It writes what you tell it, not what they need to hear", accent: 'bg-amber-400' },
  { title: 'Age Blind', desc: "It doesn't know what gets you screened out", accent: 'bg-red-400' },
];

function ProblemSection() {
  const ref = useFadeIn();
  return (
    <section className="py-20 md:py-32">
      <div ref={ref} className={`mx-auto max-w-5xl px-6 ${FADE_CLASS}`}>
        <h2 className="text-center text-3xl font-bold text-white sm:text-4xl">
          ChatGPT writes resumes. It doesn't build careers.
        </h2>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {PROBLEMS.map((p) => (
            <GlassCard key={p.title} className="p-6">
              <div className={`mb-4 h-2.5 w-2.5 rounded-full ${p.accent}`} />
              <h3 className="text-lg font-semibold text-white">{p.title}</h3>
              <p className="mt-2 text-sm text-white/60">{p.desc}</p>
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

function CoachingSection() {
  const ref = useFadeIn();
  return (
    <section className="py-20 md:py-32">
      <div ref={ref} className={`mx-auto max-w-5xl px-6 ${FADE_CLASS}`}>
        <h2 className="text-center text-3xl font-bold text-white sm:text-4xl">
          We start with the question hiring managers actually ask
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-white/60">
          Before writing a single word, we uncover what makes you the obvious choice
        </p>

        {/* Mock conversation bubbles */}
        <div className="mx-auto mt-14 max-w-md space-y-4">
          {[false, true, false, true].map((isRight, i) => (
            <div key={i} className={`flex ${isRight ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`rounded-2xl px-5 py-3 ${
                  isRight
                    ? 'bg-blue-500/20 border border-blue-400/20'
                    : 'bg-white/[0.06] border border-white/[0.12]'
                }`}
                style={{ maxWidth: '75%' }}
              >
                <div className="h-3 w-36 rounded bg-white/20 blur-sm" />
                <div className="mt-2 h-3 w-24 rounded bg-white/15 blur-sm" />
              </div>
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-sm font-medium text-white/50">
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
        <h2 className="text-center text-3xl font-bold text-white sm:text-4xl">
          Built with a blueprint. Not a template.
        </h2>

        <div className="relative mt-14">
          {/* Connector line (desktop only) */}
          <div className="absolute left-0 right-0 top-8 hidden h-px bg-white/10 md:block" />

          <div className="grid gap-8 md:grid-cols-4">
            {STEPS.map((s) => (
              <GlassCard key={s.num} className="relative p-6 pt-12">
                {/* Number circle */}
                <div className="absolute -top-4 left-6 flex h-8 w-8 items-center justify-center rounded-full border border-blue-400/30 bg-blue-500/20 text-sm font-bold text-blue-400">
                  {s.num}
                </div>
                <h3 className="text-base font-semibold text-white">{s.title}</h3>
                <p className="mt-2 text-sm text-white/60">{s.desc}</p>
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
        <h2 className="text-center text-3xl font-bold text-white sm:text-4xl">
          20 years of experience is an asset.
          <br className="hidden sm:block" />
          Unless your resume says otherwise.
        </h2>

        <div className="mt-14 grid gap-6 md:grid-cols-2">
          {/* Before */}
          <GlassCard className="overflow-hidden">
            <div className="border-b border-red-400/20 bg-red-500/10 px-6 py-3">
              <span className="text-sm font-semibold uppercase tracking-wider text-red-400">
                Before
              </span>
            </div>
            <div className="space-y-3 p-6">
              {BEFORE_ITEMS.map((text) => (
                <p key={text} className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
                  {text}
                </p>
              ))}
            </div>
          </GlassCard>

          {/* After */}
          <GlassCard className="overflow-hidden">
            <div className="border-b border-emerald-400/20 bg-emerald-500/10 px-6 py-3">
              <span className="text-sm font-semibold uppercase tracking-wider text-emerald-400">
                After
              </span>
            </div>
            <div className="space-y-3 p-6">
              {AFTER_ITEMS.map((text) => (
                <p key={text} className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
                  {text}
                </p>
              ))}
            </div>
          </GlassCard>
        </div>

        <p className="mx-auto mt-10 max-w-xl text-center text-sm text-white/50">
          Our AI detects and neutralizes age signals that trigger unconscious bias
        </p>
      </div>
    </section>
  );
}

/* ================================================================== */
/*  6. Quality Promise                                                */
/* ================================================================== */

const QUALITY_METRICS = [
  { score: 85, max: 100, label: 'ATS Compliance', color: 'text-emerald-400', desc: 'Passes automated screening systems' },
  { score: 92, max: 100, label: 'Humanization', color: 'text-blue-400', desc: 'Reads like you wrote it, not a robot' },
  { score: 88, max: 100, label: 'Impact Score', color: 'text-amber-400', desc: 'Every bullet quantified and compelling' },
];

function QualitySection() {
  const ref = useFadeIn();
  return (
    <section className="py-20 md:py-32">
      <div ref={ref} className={`mx-auto max-w-5xl px-6 ${FADE_CLASS}`}>
        <h2 className="text-center text-3xl font-bold text-white sm:text-4xl">
          Triple-checked. Not just spell-checked.
        </h2>

        <GlassCard className="mx-auto mt-14 max-w-2xl p-8">
          <div className="flex items-start justify-around">
            {QUALITY_METRICS.map((m) => (
              <div key={m.label} className="flex flex-col items-center gap-3">
                <ScoreRing score={m.score} max={m.max} label={m.label} color={m.color} />
                <p className="max-w-[140px] text-center text-xs text-white/50">{m.desc}</p>
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
        <h2 className="text-center text-3xl font-bold text-white sm:text-4xl">
          Answer once. Apply everywhere.
        </h2>

        <div className="mx-auto mt-14 flex max-w-2xl flex-col items-center gap-8 md:flex-row md:justify-center">
          {/* Profile card */}
          <GlassCard className="w-52 shrink-0 p-5">
            <div className="mb-3 h-10 w-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600" />
            <div className="h-3 w-28 rounded bg-white/20" />
            <div className="mt-2 h-2 w-20 rounded bg-white/10" />
            <div className="mt-4 space-y-1.5">
              <div className="h-2 w-full rounded bg-white/10" />
              <div className="h-2 w-3/4 rounded bg-white/10" />
              <div className="h-2 w-5/6 rounded bg-white/10" />
            </div>
          </GlassCard>

          {/* Arrows */}
          <div className="flex flex-row gap-4 md:flex-col">
            {['Role A', 'Role B', 'Role C'].map((label) => (
              <div key={label} className="flex items-center gap-2">
                <svg className="hidden h-4 w-6 text-blue-400/50 md:block" viewBox="0 0 24 16" fill="none">
                  <path d="M0 8h20m0 0l-5-5m5 5l-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <GlassCard className="px-3 py-1.5">
                  <span className="text-xs text-white/60">{label}</span>
                </GlassCard>
              </div>
            ))}
          </div>
        </div>

        <p className="mx-auto mt-10 max-w-lg text-center text-sm text-white/50">
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
        <h2 className="text-center text-3xl font-bold text-white sm:text-4xl">
          Built for leaders who've outgrown templates
        </h2>

        <div className="mt-14 -mx-6 overflow-x-auto px-6 scrollbar-hide">
          <div className="flex gap-3">
            {ROLES.map((role) => (
              <span
                key={role}
                className="shrink-0 rounded-full border border-white/[0.12] bg-white/[0.06] px-4 py-2 text-sm text-white/70"
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
/*  9. CTA                                                            */
/* ================================================================== */

function CTASection() {
  const ref = useFadeIn();
  return (
    <section className="py-20 md:py-32">
      <div ref={ref} className={`mx-auto max-w-5xl px-6 ${FADE_CLASS}`}>
        <div className="mx-auto max-w-lg text-center">
          <h2 className="text-3xl font-bold text-white sm:text-4xl">
            Ready to stop underselling yourself?
          </h2>
          <p className="mt-4 text-white/60">
            Create your free account and build a resume that lands interviews
          </p>
          <div className="mt-8">
            <a href="/app">
              <GlassButton>
                Get Started Free
              </GlassButton>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ================================================================== */
/*  10. Footer                                                        */
/* ================================================================== */

function Footer() {
  return (
    <footer className="border-t border-white/[0.08] py-10">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 px-6 text-sm text-white/40">
        <span>Resume Agent</span>
        <span>&copy; 2026 All rights reserved</span>
        <a href="/app" className="text-white/50 transition-colors hover:text-white">
          Sign In
        </a>
      </div>
    </footer>
  );
}

/* ================================================================== */
/*  SalesPage (assembled)                                             */
/* ================================================================== */

export function SalesPage() {
  return (
    <div className="min-h-screen bg-surface">
      <Hero />
      <ProblemSection />
      <CoachingSection />
      <BlueprintSection />
      <AgeSmartSection />
      <QualitySection />
      <PositioningSection />
      <RoleTagsSection />
      <CTASection />
      <Footer />
    </div>
  );
}
