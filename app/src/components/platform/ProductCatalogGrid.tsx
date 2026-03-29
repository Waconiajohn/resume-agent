import { GlassCard } from '@/components/GlassCard';
import { PRODUCT_CATALOG } from '@/types/platform';
import type { ProductDefinition } from '@/types/platform';

function isRealName(name: string): boolean {
  return name.length > 0 && !name.includes('@') && name !== 'there';
}

const START_HERE_IDS = ['onboarding-assessment', 'resume-strategist', 'job-command-center'];
const CONTINUE_WITH_IDS = ['linkedin-studio', 'interview-lab'];
const SECONDARY_TOOLS = [
  { id: 'cover-letter', belongsIn: 'Resume Builder' },
  { id: 'salary-negotiation', belongsIn: 'Interview Prep when you reach offer stage' },
];
const CAREER_PROFILE_POWERED_IDS = new Set([
  'resume-strategist',
  'linkedin-studio',
  'job-command-center',
  'interview-lab',
  'salary-negotiation',
  'executive-documents',
]);

/* ─── Props ─── */

interface ProductCatalogGridProps {
  onNavigate: (route: string) => void;
  onOpenCoach?: () => void;
  userName?: string;
}

/* ─── Product Card (compact variant for inside groups) ─── */

function ProductCard({ product, onNavigate }: { product: ProductDefinition; onNavigate: (route: string) => void }) {
  const isBeta = product.status === 'beta';
  const usesCareerProfile = CAREER_PROFILE_POWERED_IDS.has(product.id);

  return (
    <GlassCard
      hover
      className="flex cursor-pointer flex-col gap-2 rounded-2xl border border-[var(--line-soft)] bg-black/10 p-4"
      onClick={() => onNavigate(product.route)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onNavigate(product.route); }}
      aria-label={`Open ${product.name}`}
    >
      <div className="flex items-start justify-between">
        <span className="text-2xl" aria-hidden="true">{product.icon}</span>
        {isBeta && (
          <span className="rounded-full bg-[#afc4ff]/10 border border-[#afc4ff]/20 px-2 py-0.5 text-[12px] font-medium uppercase tracking-wider text-[#afc4ff]/70">
            Beta
          </span>
        )}
      </div>

      <div className="flex flex-col gap-0.5">
        <h4 className="text-sm font-semibold text-[var(--text-strong)]">
          {product.name}
        </h4>
        <p className="text-xs leading-relaxed text-[var(--text-soft)]">
          {product.shortDescription}
        </p>
        {usesCareerProfile && (
          <div className="mt-2 inline-flex w-fit items-center gap-1 rounded-full border border-[#98b3ff]/16 bg-[#98b3ff]/[0.06] px-2 py-0.5 text-[12px] uppercase tracking-[0.16em] text-[#c9d7ff]">
            Uses Career Profile
          </div>
        )}
      </div>
    </GlassCard>
  );
}

function getProductsByIds(ids: string[]): ProductDefinition[] {
  return ids
    .map((id) => PRODUCT_CATALOG.find((product) => product.id === id))
    .filter((product): product is ProductDefinition => Boolean(product));
}

function FeaturedToolCard({
  product,
  onNavigate,
  eyebrow,
}: {
  product: ProductDefinition;
  onNavigate: (route: string) => void;
  eyebrow: string;
}) {
  const usesCareerProfile = CAREER_PROFILE_POWERED_IDS.has(product.id);

  return (
    <GlassCard
      hover
      className="flex h-full cursor-pointer flex-col justify-between gap-4 p-5"
      onClick={() => onNavigate(product.route)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onNavigate(product.route);
      }}
      aria-label={`Open ${product.name}`}
    >
      <div>
        <div className="text-[13px] uppercase tracking-[0.18em] text-[#98b3ff]/70">{eyebrow}</div>
        <div className="mt-3 flex items-start justify-between gap-3">
          <div>
            <span className="text-2xl" aria-hidden="true">{product.icon}</span>
            <div className="mt-3 text-base font-semibold text-[var(--text-strong)]">{product.name}</div>
          </div>
          {product.status === 'beta' && (
            <span className="rounded-full border border-[var(--line-soft)] bg-[var(--surface-1)] px-2 py-0.5 text-[12px] uppercase tracking-[0.16em] text-[var(--text-soft)]">
              Beta
            </span>
          )}
        </div>
        <p className="mt-3 text-sm leading-relaxed text-[var(--text-soft)]">{product.shortDescription}</p>
        {usesCareerProfile && (
          <div className="mt-3 inline-flex items-center gap-1 rounded-full border border-[#98b3ff]/16 bg-[#98b3ff]/[0.06] px-2 py-0.5 text-[12px] uppercase tracking-[0.16em] text-[#c9d7ff]">
            Uses Career Profile
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-[var(--text-soft)]">{product.ctaLabel}</span>
        <span className="rounded-full border border-[#98b3ff]/18 bg-[#98b3ff]/[0.08] px-2.5 py-1 text-[13px] font-medium text-[#c9d7ff]">
          Open
        </span>
      </div>
    </GlassCard>
  );
}

/* ─── Main Component ─── */

export function ProductCatalogGrid({ onNavigate, onOpenCoach, userName }: ProductCatalogGridProps) {
  const firstName = userName?.split(' ')[0] || '';
  const coachLabel = isRealName(firstName) ? `AI ${firstName}` : 'AI Coach';
  const startHereProducts = getProductsByIds(START_HERE_IDS);
  const continueWithProducts = getProductsByIds(CONTINUE_WITH_IDS);
  const secondaryTools = SECONDARY_TOOLS
    .map((item) => ({
      product: PRODUCT_CATALOG.find((product) => product.id === item.id),
      belongsIn: item.belongsIn,
    }))
    .filter((item): item is { product: ProductDefinition; belongsIn: string } => Boolean(item.product));

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-[var(--text-strong)]">AI Career Tools</h1>
        {onOpenCoach && (
          <button
            type="button"
            onClick={onOpenCoach}
            className="flex items-center gap-2 rounded-full bg-indigo-600/30 border border-indigo-400/25 px-4 py-2 text-sm font-medium text-indigo-200 hover:bg-indigo-600/50 hover:border-indigo-400/40 transition-all duration-200"
          >
            <span className="w-6 h-6 rounded-full bg-indigo-600/50 border border-indigo-400/30 flex items-center justify-center text-[12px] font-bold text-indigo-300">AI</span>
            Chat with {coachLabel}
          </button>
        )}
      </div>

      <div className="grid gap-6">
        <GlassCard className="overflow-hidden border-[#98b3ff]/16 bg-[radial-gradient(circle_at_top_left,rgba(152,179,255,0.18),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-5">
          <div className="text-[13px] font-medium uppercase tracking-widest text-[#98b3ff]/70">
            Start Here
          </div>
          <h2 className="mt-2 text-lg font-semibold text-[var(--text-strong)]">Use the platform in this order</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-soft)]">
            We are simplifying the surface on purpose. Start with the shared story, tailor it to a real opportunity, then manage the search around that work.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {startHereProducts.map((product, index) => (
              <FeaturedToolCard
                key={product.id}
                product={product}
                onNavigate={onNavigate}
                eyebrow={`Step ${index + 1}`}
              />
            ))}
          </div>
        </GlassCard>

        <GlassCard className="border-[var(--line-soft)] bg-[linear-gradient(180deg,rgba(255,255,255,0.065),rgba(255,255,255,0.025))] p-5">
          <div className="text-[13px] font-medium uppercase tracking-widest text-[var(--text-soft)]">
            Continue Your Search
          </div>
          <h2 className="mt-2 text-lg font-semibold text-[var(--text-strong)]">Only the next two workspaces stay front and center</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-soft)]">
            Once your profile and resume are in place, the day-to-day work narrows to visibility and interview preparation. Everything else should appear inside the workflow where it belongs.
          </p>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {continueWithProducts.map((product) => (
              <ProductCard key={product.id} product={product} onNavigate={onNavigate} />
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-[var(--line-soft)] bg-black/10 p-4">
            <div className="text-sm font-semibold text-[var(--text-strong)]">Later-stage and secondary tools are still available, just not as separate starting points.</div>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-soft)]">
              We are moving these behind the workflow where they make sense so the app stops feeling like a wall of random agents.
            </p>

            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {secondaryTools.map(({ product, belongsIn }) => (
                <div
                  key={product.id}
                  className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-2"
                >
                  <div className="text-sm font-medium text-[var(--text-strong)]">{product.name}</div>
                  <div className="mt-1 text-xs text-[var(--text-soft)]">Open this from {belongsIn}.</div>
                </div>
              ))}
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

export { CONTINUE_WITH_IDS };
