import { cn } from '@/lib/utils';
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
  { id: 'salary-negotiation', belongsIn: 'Job Workspace when you reach offer stage' },
  { id: 'executive-documents', belongsIn: 'LinkedIn Studio and brand work' },
  { id: 'smart-referrals', belongsIn: 'Job Command Center' },
  { id: 'financial-wellness', belongsIn: 'later-stage planning, not day-one setup' },
  { id: 'job-applier', belongsIn: 'after you already have a tailored resume' },
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
  const isNavigable = product.status === 'active' || product.status === 'beta';
  const isBeta = product.status === 'beta';
  const usesCareerProfile = CAREER_PROFILE_POWERED_IDS.has(product.id);

  return (
    <GlassCard
      hover={isNavigable}
      className={cn(
        'flex flex-col gap-2 rounded-2xl border border-white/[0.06] bg-black/10 p-4',
        isNavigable ? 'cursor-pointer' : 'opacity-60 cursor-default',
      )}
      onClick={isNavigable ? () => onNavigate(product.route) : undefined}
      role={isNavigable ? 'button' : undefined}
      tabIndex={isNavigable ? 0 : undefined}
      onKeyDown={isNavigable ? (e) => { if (e.key === 'Enter' || e.key === ' ') onNavigate(product.route); } : undefined}
      aria-label={isNavigable ? `Open ${product.name}` : `${product.name} — coming soon`}
    >
      <div className="flex items-start justify-between">
        <span className="text-2xl" aria-hidden="true">{product.icon}</span>
        {product.status === 'coming_soon' && (
          <span className="rounded-full bg-white/[0.07] border border-white/[0.1] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/40">
            Coming Soon
          </span>
        )}
        {isBeta && (
          <span className="rounded-full bg-[#afc4ff]/10 border border-[#afc4ff]/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[#afc4ff]/70">
            Beta
          </span>
        )}
      </div>

      <div className="flex flex-col gap-0.5">
        <h4 className={cn(
          'text-sm font-semibold',
          isNavigable ? 'text-white/90' : 'text-white/40',
        )}>
          {product.name}
        </h4>
        <p className={cn(
          'text-xs leading-relaxed',
          isNavigable ? 'text-white/55' : 'text-white/30',
        )}>
          {product.shortDescription}
        </p>
        {usesCareerProfile && (
          <div className="mt-2 inline-flex w-fit items-center gap-1 rounded-full border border-[#98b3ff]/16 bg-[#98b3ff]/[0.06] px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-[#c9d7ff]">
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
  const isNavigable = product.status === 'active' || product.status === 'beta';
  const usesCareerProfile = CAREER_PROFILE_POWERED_IDS.has(product.id);

  return (
    <GlassCard
      hover={isNavigable}
      className={cn(
        'p-5 flex h-full flex-col justify-between gap-4',
        isNavigable ? 'cursor-pointer' : 'opacity-60 cursor-default',
      )}
      onClick={isNavigable ? () => onNavigate(product.route) : undefined}
      role={isNavigable ? 'button' : undefined}
      tabIndex={isNavigable ? 0 : undefined}
      onKeyDown={isNavigable ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') onNavigate(product.route);
      } : undefined}
      aria-label={isNavigable ? `Open ${product.name}` : `${product.name} — coming soon`}
    >
      <div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-[#98b3ff]/70">{eyebrow}</div>
        <div className="mt-3 flex items-start justify-between gap-3">
          <div>
            <span className="text-2xl" aria-hidden="true">{product.icon}</span>
            <div className="mt-3 text-base font-semibold text-white/90">{product.name}</div>
          </div>
          {product.status !== 'active' && (
            <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-white/45">
              {product.status === 'beta' ? 'Beta' : 'Coming Soon'}
            </span>
          )}
        </div>
        <p className="mt-3 text-sm leading-relaxed text-white/58">{product.shortDescription}</p>
        {usesCareerProfile && (
          <div className="mt-3 inline-flex items-center gap-1 rounded-full border border-[#98b3ff]/16 bg-[#98b3ff]/[0.06] px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-[#c9d7ff]">
            Uses Career Profile
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-white/38">{product.ctaLabel}</span>
        <span className="rounded-full border border-[#98b3ff]/18 bg-[#98b3ff]/[0.08] px-2.5 py-1 text-[11px] font-medium text-[#c9d7ff]">
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
        <h1 className="text-lg font-semibold text-white/90">AI Career Tools</h1>
        {onOpenCoach && (
          <button
            type="button"
            onClick={onOpenCoach}
            className="flex items-center gap-2 rounded-full bg-indigo-600/30 border border-indigo-400/25 px-4 py-2 text-sm font-medium text-indigo-200 hover:bg-indigo-600/50 hover:border-indigo-400/40 transition-all duration-200"
          >
            <span className="w-6 h-6 rounded-full bg-indigo-600/50 border border-indigo-400/30 flex items-center justify-center text-[10px] font-bold text-indigo-300">AI</span>
            Chat with {coachLabel}
          </button>
        )}
      </div>

      <div className="grid gap-6">
        <GlassCard className="overflow-hidden border-[#98b3ff]/16 bg-[radial-gradient(circle_at_top_left,rgba(152,179,255,0.18),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-5">
          <div className="text-[11px] font-medium uppercase tracking-widest text-[#98b3ff]/70">
            Start Here
          </div>
          <h2 className="mt-2 text-lg font-semibold text-white/88">Use the platform in this order</h2>
          <p className="mt-2 text-sm leading-relaxed text-white/54">
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

        <GlassCard className="border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.065),rgba(255,255,255,0.025))] p-5">
          <div className="text-[11px] font-medium uppercase tracking-widest text-white/42">
            Continue Your Search
          </div>
          <h2 className="mt-2 text-lg font-semibold text-white/88">Only the next two workspaces stay front and center</h2>
          <p className="mt-2 text-sm leading-relaxed text-white/54">
            Once your profile and resume are in place, the day-to-day work narrows to visibility and interview preparation. Everything else should appear inside the workflow where it belongs.
          </p>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {continueWithProducts.map((product) => (
              <ProductCard key={product.id} product={product} onNavigate={onNavigate} />
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-white/[0.06] bg-black/10 p-4">
            <div className="text-sm font-semibold text-white/82">Later-stage and secondary tools are still available, just not as separate starting points.</div>
            <p className="mt-2 text-sm leading-relaxed text-white/48">
              We are moving these behind the workflow where they make sense so the app stops feeling like a wall of random agents.
            </p>

            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {secondaryTools.map(({ product, belongsIn }) => (
                <div
                  key={product.id}
                  className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2"
                >
                  <div className="text-sm font-medium text-white/82">{product.name}</div>
                  <div className="mt-1 text-xs text-white/46">Open this from {belongsIn}.</div>
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
