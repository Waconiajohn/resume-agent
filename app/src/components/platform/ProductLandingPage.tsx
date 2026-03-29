import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import type { ProductDefinition } from '@/types/platform';

interface ProductLandingPageProps {
  product: ProductDefinition;
  onNavigate: (route: string) => void;
}

export function ProductLandingPage({ product, onNavigate }: ProductLandingPageProps) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <button
        onClick={() => onNavigate('/tools')}
        className="mb-6 flex items-center gap-1.5 text-sm text-[var(--text-soft)] hover:text-[var(--text-strong)] transition-colors duration-150"
      >
        <span aria-hidden="true">&#8592;</span>
        Back to Tools
      </button>

      <div className="mb-8 flex items-center gap-4">
        <span className="text-5xl" aria-label={`${product.name} icon`}>{product.icon}</span>
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-strong)]">{product.name}</h1>
          {product.status === 'beta' && (
            <span className="mt-1 inline-block rounded-full bg-[var(--surface-1)] border border-[var(--line-soft)] px-2.5 py-0.5 text-[12px] font-medium uppercase tracking-wider text-[var(--text-soft)]">
              Beta
            </span>
          )}
        </div>
      </div>

      <p className="mb-10 text-base leading-relaxed text-[var(--text-soft)]">{product.longDescription}</p>

      <div className="mb-10 grid grid-cols-1 gap-4 md:grid-cols-2">
        {product.features.map((feature) => (
          <GlassCard key={feature.title} className="p-5 flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-[var(--text-strong)]">{feature.title}</h3>
            <p className="text-xs leading-relaxed text-[var(--text-soft)]">{feature.description}</p>
          </GlassCard>
        ))}
      </div>

      <div className="flex justify-start">
        {product.externalUrl ? (
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
        )}
      </div>
    </div>
  );
}
