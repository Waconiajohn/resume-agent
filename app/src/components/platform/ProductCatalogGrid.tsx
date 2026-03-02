import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/GlassCard';
import { PRODUCT_CATALOG } from '@/types/platform';
import type { ProductDefinition } from '@/types/platform';

interface ProductCatalogGridProps {
  onNavigate: (route: string) => void;
}

function ProductCard({ product, onNavigate }: { product: ProductDefinition; onNavigate: (route: string) => void }) {
  const isActive = product.status === 'active';
  const isBeta = product.status === 'beta';

  return (
    <GlassCard
      hover={isActive}
      className={cn(
        'p-6 flex flex-col gap-3',
        isActive ? 'cursor-pointer' : 'opacity-60 cursor-default',
      )}
      onClick={isActive ? () => onNavigate(product.route) : undefined}
      role={isActive ? 'button' : undefined}
      tabIndex={isActive ? 0 : undefined}
      onKeyDown={isActive ? (e) => { if (e.key === 'Enter' || e.key === ' ') onNavigate(product.route); } : undefined}
      aria-label={isActive ? `Open ${product.name}` : `${product.name} — coming soon`}
    >
      <div className="flex items-start justify-between">
        <span className="text-3xl" aria-hidden="true">{product.icon}</span>
        {(product.status === 'coming_soon') && (
          <span className="rounded-full bg-white/[0.07] border border-white/[0.1] px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/40">
            Coming Soon
          </span>
        )}
        {isBeta && (
          <span className="rounded-full bg-[#afc4ff]/10 border border-[#afc4ff]/20 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[#afc4ff]/70">
            Beta
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <h3 className={cn(
          'text-sm font-semibold',
          isActive ? 'text-white/90' : 'text-white/40',
        )}>
          {product.name}
        </h3>
        <p className={cn(
          'text-xs leading-relaxed',
          isActive ? 'text-white/55' : 'text-white/30',
        )}>
          {product.shortDescription}
        </p>
      </div>

      {isActive && (
        <div className="mt-auto pt-2">
          <span className="text-xs font-medium text-[#afc4ff]/80">Open →</span>
        </div>
      )}
    </GlassCard>
  );
}

export function ProductCatalogGrid({ onNavigate }: ProductCatalogGridProps) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-white/90">AI Career Tools</h2>
        <p className="mt-1 text-sm text-white/45">
          Intelligent agents that position you for the roles you want.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PRODUCT_CATALOG.map((product) => (
          <ProductCard key={product.id} product={product} onNavigate={onNavigate} />
        ))}
      </div>
    </div>
  );
}
