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

  return (
    <GlassCard
      hover={isNavigable}
      className={cn(
        'p-4 flex flex-col gap-2',
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
      </div>
    </GlassCard>
  );
}

/* ─── Theme Group Card ─── */

function ThemeGroupCard({ group, onNavigate }: { group: ToolGroup; onNavigate: (route: string) => void }) {
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
      <GlassCard className="p-4 flex-1">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/[0.06]">
          <span className="text-lg" aria-hidden="true">{group.icon}</span>
          <h3 className="text-sm font-semibold text-white/80">{group.label}</h3>
          <span className="ml-auto text-[10px] text-white/30">{products.length}</span>
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

      <div className="mb-6">
        <WeeklyScheduleStrip />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {TOOL_GROUPS.map(group => (
          <ThemeGroupCard key={group.label} group={group} onNavigate={onNavigate} />
        ))}
      </div>
    </div>
  );
}

export { TOOL_GROUPS };
