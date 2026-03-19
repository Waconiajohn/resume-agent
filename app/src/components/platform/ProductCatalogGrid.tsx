import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/GlassCard';
import { PRODUCT_CATALOG } from '@/types/platform';
import type { ProductDefinition } from '@/types/platform';
import { WeeklyScheduleStrip } from '@/components/career-iq/WeeklyScheduleStrip';

function isRealName(name: string): boolean {
  return name.length > 0 && !name.includes('@') && name !== 'there';
}

/* ─── Theme Groups ─── */

interface ToolGroup {
  label: string;
  icon: string;
  productIds: string[];
}

type GroupTone = {
  shell: string;
  headerChip: string;
  countChip: string;
};

const TOOL_GROUPS: ToolGroup[] = [
  {
    label: 'Your Foundation',
    icon: '🏗️',
    productIds: ['onboarding-assessment', 'resume-strategist', 'cover-letter'],
  },
  {
    label: 'LinkedIn & Brand',
    icon: '🔗',
    productIds: ['linkedin-studio', 'executive-documents'],
  },
  {
    label: 'Job Search & Networking',
    icon: '🎯',
    productIds: ['job-command-center', 'smart-referrals', 'job-applier'],
  },
  {
    label: 'Interview & Offers',
    icon: '🎤',
    productIds: ['interview-lab', 'salary-negotiation', 'financial-wellness'],
  },
];

const START_HERE_IDS = ['onboarding-assessment', 'resume-strategist', 'job-command-center'];
const MOST_USED_IDS = ['linkedin-studio', 'interview-lab', 'salary-negotiation'];
const CAREER_PROFILE_POWERED_IDS = new Set([
  'resume-strategist',
  'linkedin-studio',
  'job-command-center',
  'interview-lab',
  'salary-negotiation',
  'executive-documents',
]);

function getGroupTone(label: string): GroupTone {
  switch (label) {
    case 'Your Foundation':
      return {
        shell: 'border-[#98b3ff]/18 bg-[radial-gradient(circle_at_top_left,rgba(152,179,255,0.14),transparent_40%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.025))]',
        headerChip: 'border-[#98b3ff]/18 bg-[#98b3ff]/[0.08] text-[#d6e0ff]',
        countChip: 'border-[#98b3ff]/16 bg-[#98b3ff]/[0.06] text-[#c9d7ff]/78',
      };
    case 'LinkedIn & Brand':
      return {
        shell: 'border-[#d7b8f0]/18 bg-[radial-gradient(circle_at_top_left,rgba(215,184,240,0.14),transparent_40%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.025))]',
        headerChip: 'border-[#d7b8f0]/18 bg-[#d7b8f0]/[0.08] text-[#f0dcff]',
        countChip: 'border-[#d7b8f0]/16 bg-[#d7b8f0]/[0.06] text-[#f0dcff]/78',
      };
    case 'Job Search & Networking':
      return {
        shell: 'border-[#f0d99f]/18 bg-[radial-gradient(circle_at_top_left,rgba(240,217,159,0.14),transparent_40%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.025))]',
        headerChip: 'border-[#f0d99f]/18 bg-[#f0d99f]/[0.08] text-[#ffe8b8]',
        countChip: 'border-[#f0d99f]/16 bg-[#f0d99f]/[0.06] text-[#ffe8b8]/78',
      };
    case 'Interview & Offers':
    default:
      return {
        shell: 'border-[#b5dec2]/18 bg-[radial-gradient(circle_at_top_left,rgba(181,222,194,0.14),transparent_40%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.025))]',
        headerChip: 'border-[#b5dec2]/18 bg-[#b5dec2]/[0.08] text-[#d8f0df]',
        countChip: 'border-[#b5dec2]/16 bg-[#b5dec2]/[0.06] text-[#d8f0df]/78',
      };
  }
}

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

/* ─── Theme Group Card ─── */

function ThemeGroupCard({ group, onNavigate }: { group: ToolGroup; onNavigate: (route: string) => void }) {
  const tone = getGroupTone(group.label);
  const products = group.productIds
    .map(id => {
      const product = PRODUCT_CATALOG.find(p => p.id === id);
      if (!product && import.meta.env.DEV) {
        console.warn(`[TOOL_GROUPS] Product ID "${id}" in group "${group.label}" not found in PRODUCT_CATALOG`);
      }
      return product;
    })
    .filter((p): p is ProductDefinition => p !== undefined)
    .sort((a, b) => {
      const statusOrder = { active: 0, beta: 1, coming_soon: 2 };
      return (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3);
    });

  return (
    <div className="flex flex-col">
      <GlassCard className={cn('p-4 flex-1', tone.shell)}>
        <div className="mb-4 flex items-center gap-2 border-b border-white/[0.06] pb-3">
          <span className={cn('rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.18em]', tone.headerChip)}>
            {group.icon} {group.label}
          </span>
          <h3 className="sr-only">{group.label}</h3>
          <span className={cn('ml-auto rounded-full border px-2.5 py-1 text-[10px]', tone.countChip)}>
            {products.length} tools
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {products.map(product => (
            <ProductCard key={product.id} product={product} onNavigate={onNavigate} />
          ))}
        </div>
      </GlassCard>
    </div>
  );
}

/* ─── Main Component ─── */

export function ProductCatalogGrid({ onNavigate, onOpenCoach, userName }: ProductCatalogGridProps) {
  const firstName = userName?.split(' ')[0] || '';
  const coachLabel = isRealName(firstName) ? `AI ${firstName}` : 'AI Coach';
  const startHereProducts = getProductsByIds(START_HERE_IDS);
  const mostUsedProducts = getProductsByIds(MOST_USED_IDS);

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

      <div className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
        <GlassCard className="overflow-hidden border-[#98b3ff]/16 bg-[radial-gradient(circle_at_top_left,rgba(152,179,255,0.18),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-5">
          <div className="text-[11px] font-medium uppercase tracking-widest text-[#98b3ff]/70">
            Start Here
          </div>
          <h2 className="mt-2 text-lg font-semibold text-white/88">Use the platform in this order</h2>
          <p className="mt-2 text-sm leading-relaxed text-white/54">
            Build the shared story first, tailor it to a live opportunity second, then manage the job search around that work. This keeps the tools feeling connected instead of random.
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
            Most Used
          </div>
          <h2 className="mt-2 text-lg font-semibold text-white/88">The tools people come back to most</h2>
          <p className="mt-2 text-sm leading-relaxed text-white/54">
            Once Career Profile is in place, these are the highest-value follow-on tools for visibility, preparation, and offer confidence.
          </p>

          <div className="mt-5 space-y-3">
            {mostUsedProducts.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => onNavigate(product.route)}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-black/10 px-4 py-3 text-left transition-colors hover:bg-white/[0.05]"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span className="text-xl" aria-hidden="true">{product.icon}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white/86">{product.name}</div>
                    <div className="mt-1 text-xs leading-relaxed text-white/50">{product.shortDescription}</div>
                    {CAREER_PROFILE_POWERED_IDS.has(product.id) && (
                      <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-[#98b3ff]/16 bg-[#98b3ff]/[0.06] px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-[#c9d7ff]">
                        Uses Career Profile
                      </div>
                    )}
                  </div>
                </div>
                <span className="text-xs text-[#98b3ff]">{product.ctaLabel}</span>
              </button>
            ))}
          </div>
        </GlassCard>
      </div>

      <div className="mt-10">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white/86">Full Tool Catalog</h2>
            <p className="mt-1 text-sm text-white/46">
              Browse the whole platform by area once you know what you need.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {TOOL_GROUPS.map(group => (
            <ThemeGroupCard key={group.label} group={group} onNavigate={onNavigate} />
          ))}
        </div>
      </div>

      <div className="mt-10 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-4">
        <div className="mb-3">
          <h2 className="text-base font-semibold text-white/86">Live Sessions</h2>
          <p className="mt-1 text-sm text-white/46">
            Ongoing programming sits below the core tools so it does not crowd the main product choices.
          </p>
        </div>
        <WeeklyScheduleStrip />
      </div>
    </div>
  );
}

export { TOOL_GROUPS };
