import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/GlassCard';
import { PRODUCT_CATALOG } from '@/types/platform';
import type { ProductDefinition } from '@/types/platform';

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
    productIds: ['linkedin-optimizer', 'linkedin-editor', 'linkedin-content', 'content-calendar', 'personal-brand-audit'],
  },
  {
    label: 'Job Search & Network',
    icon: '🎯',
    productIds: ['job-command-center', 'job-applier', 'networking-hub', 'network-intelligence', 'momentum-tracker'],
  },
  {
    label: 'Interview & Offers',
    icon: '🎤',
    productIds: ['interview-prep', 'mock-interview', 'interview-debrief', 'salary-negotiation', 'counter-offer-sim'],
  },
  {
    label: 'Documents & Writing',
    icon: '📝',
    productIds: ['executive-bio', 'case-study-generator', 'thank-you-note', '90-day-plan'],
  },
  {
    label: 'Financial & Planning',
    icon: '💰',
    productIds: ['retirement-bridge', 'planner-handoff', 'b2b-admin'],
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

/* ─── Coach Hero Card ─── */

function isRealName(name: string): boolean {
  return name.length > 0 && !name.includes('@') && name !== 'there';
}

function CoachHeroCard({ userName, onOpenCoach }: { userName?: string; onOpenCoach?: () => void }) {
  const firstName = userName?.split(' ')[0] || '';
  const displayName = isRealName(firstName) ? `AI ${firstName}` : 'AI Coach';

  return (
    <div className="flex justify-center mb-2">
      <GlassCard className="p-6 sm:p-8 max-w-md w-full text-center border-indigo-500/20">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-indigo-600/30 border-2 border-indigo-400/30 flex items-center justify-center">
            <span className="text-xl font-bold text-indigo-300">AI</span>
          </div>

          <div>
            <h2 className="text-lg font-bold text-white/95">{displayName}</h2>
            <p className="text-sm text-white/50 mt-0.5">Your Virtual Career Coach</p>
          </div>

          <p className="text-xs text-white/40 leading-relaxed max-w-xs">
            I orchestrate all {PRODUCT_CATALOG.length} tools below to guide your career transition. Ask me what to do next.
          </p>

          {onOpenCoach && (
            <button
              type="button"
              onClick={onOpenCoach}
              className="mt-1 px-5 py-2 rounded-full bg-indigo-600/40 border border-indigo-400/30 text-sm font-medium text-indigo-200 hover:bg-indigo-600/60 hover:border-indigo-400/50 transition-all duration-200"
            >
              Talk to {displayName}
            </button>
          )}
        </div>
      </GlassCard>
    </div>
  );
}

/* ─── Connector Lines (hero → groups) ─── */

function OrgConnectorLines() {
  return (
    <div className="hidden lg:block" aria-hidden="true">
      {/* Vertical stem from hero */}
      <div className="flex justify-center">
        <div className="w-px h-6 bg-gradient-to-b from-indigo-400/25 to-[rgba(152,179,255,0.15)]" />
      </div>
      {/* Horizontal bar spanning 3 columns with drop points */}
      <div className="mx-auto max-w-7xl px-4">
        <div className="relative h-6">
          {/* Horizontal line */}
          <div className="absolute top-0 left-[16.67%] right-[16.67%] h-px bg-[rgba(152,179,255,0.15)]" />
          {/* Left drop */}
          <div className="absolute top-0 left-[16.67%] w-px h-6 bg-[rgba(152,179,255,0.15)]" />
          {/* Center drop */}
          <div className="absolute top-0 left-1/2 w-px h-6 bg-[rgba(152,179,255,0.15)]" />
          {/* Right drop */}
          <div className="absolute top-0 right-[16.67%] w-px h-6 bg-[rgba(152,179,255,0.15)]" />
        </div>
      </div>
    </div>
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
      {/* Vertical connector from above — desktop only */}
      <div className="hidden lg:flex justify-center" aria-hidden="true">
        <div className="w-px h-6 bg-[rgba(152,179,255,0.15)]" />
      </div>

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
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="sr-only">AI Career Tools</h1>
      <CoachHeroCard userName={userName} onOpenCoach={onOpenCoach} />
      <OrgConnectorLines />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-4 lg:mt-0">
        {TOOL_GROUPS.map(group => (
          <ThemeGroupCard key={group.label} group={group} onNavigate={onNavigate} />
        ))}
      </div>
    </div>
  );
}

export { TOOL_GROUPS };
