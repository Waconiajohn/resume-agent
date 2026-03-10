import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { cn } from '@/lib/utils';
import type { ProductDefinition } from '@/types/platform';

interface ProductLandingPageProps {
  product: ProductDefinition;
  onNavigate: (route: string) => void;
}

export function ProductLandingPage({ product, onNavigate }: ProductLandingPageProps) {
  const isActive = product.status === 'active';

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <button
        onClick={() => onNavigate('/tools')}
        className="mb-6 flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80 transition-colors duration-150"
      >
        <span aria-hidden="true">&#8592;</span>
        Back to Tools
      </button>

      <div className="mb-8 flex items-center gap-4">
        <span className="text-5xl" aria-label={`${product.name} icon`}>{product.icon}</span>
        <div>
          <h1 className="text-2xl font-semibold text-white/90">{product.name}</h1>
          {product.status === 'coming_soon' && (
            <span className="mt-1 inline-block rounded-full bg-white/[0.07] border border-white/[0.1] px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/40">
              Coming Soon
            </span>
          )}
        </div>
      </div>

      <p className="mb-10 text-base leading-relaxed text-white/60">{product.longDescription}</p>

      <div className={cn('mb-10 grid gap-4', 'grid-cols-1 md:grid-cols-2')}>
        {product.features.map((feature) => (
          <GlassCard key={feature.title} className="p-5 flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-white/85">{feature.title}</h3>
            <p className="text-xs leading-relaxed text-white/50">{feature.description}</p>
          </GlassCard>
        ))}
      </div>

      <div className="flex justify-start">
        {isActive ? (
          product.externalUrl ? (
            <a
              href={product.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-[#afc4ff]/20 bg-[#afc4ff]/10 px-5 py-2.5 text-sm font-medium text-[#afc4ff] hover:bg-[#afc4ff]/15 transition-colors"
            >
              {product.ctaLabel}
              <span aria-hidden="true" className="text-xs">&#8599;</span>
            </a>
          ) : (
            <GlassButton
              variant="primary"
              onClick={() => onNavigate(product.route)}
            >
              {product.ctaLabel}
            </GlassButton>
          )
        ) : (
          <GlassButton variant="ghost" disabled>
            Coming Soon
          </GlassButton>
        )}
      </div>
    </div>
  );
}
