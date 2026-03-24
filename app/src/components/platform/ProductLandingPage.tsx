import { useState } from 'react';
import { Check } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { cn } from '@/lib/utils';
import { useWaitlist } from '@/hooks/useWaitlist';
import type { ProductDefinition } from '@/types/platform';

interface ProductLandingPageProps {
  product: ProductDefinition;
  onNavigate: (route: string) => void;
}

function WaitlistForm({ productSlug }: { productSlug: string }) {
  const { submit, status, error } = useWaitlist();
  const [email, setEmail] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submit(email, productSlug);
  };

  if (status === 'success') {
    return (
      <div className="flex items-center gap-2 text-sm text-[#b8f0c8]/90">
        <Check className="h-4 w-4 shrink-0" />
        You're on the list!
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          required
          className={cn(
            'h-9 flex-1 rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)]',
            'px-3 text-sm text-[var(--text-strong)] placeholder:text-[var(--text-soft)]',
            'focus:border-[var(--line-strong)] focus:outline-none focus:ring-0',
            'transition-colors',
          )}
        />
        <GlassButton
          type="submit"
          variant="ghost"
          size="sm"
          disabled={status === 'submitting'}
          className="h-9 shrink-0"
        >
          {status === 'submitting' ? 'Joining…' : 'Join Waitlist'}
        </GlassButton>
      </div>
      {error && (
        <p className="text-xs text-[#f0b8b8]/80">{error}</p>
      )}
    </form>
  );
}

export function ProductLandingPage({ product, onNavigate }: ProductLandingPageProps) {
  const isActive = product.status === 'active';
  const isComingSoon = product.status === 'coming_soon';

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
          {isComingSoon && (
            <span className="mt-1 inline-block rounded-full bg-[var(--surface-1)] border border-[var(--line-soft)] px-2.5 py-0.5 text-[12px] font-medium uppercase tracking-wider text-[var(--text-soft)]">
              Coming Soon
            </span>
          )}
        </div>
      </div>

      <p className="mb-10 text-base leading-relaxed text-[var(--text-soft)]">{product.longDescription}</p>

      <div className={cn('mb-10 grid gap-4', 'grid-cols-1 md:grid-cols-2')}>
        {product.features.map((feature) => (
          <GlassCard key={feature.title} className="p-5 flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-[var(--text-strong)]">{feature.title}</h3>
            <p className="text-xs leading-relaxed text-[var(--text-soft)]">{feature.description}</p>
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
        ) : isComingSoon ? (
          <div className="w-full max-w-sm">
            <p className="mb-3 text-sm text-[var(--text-soft)]">Get notified when this launches:</p>
            <WaitlistForm productSlug={product.slug} />
          </div>
        ) : (
          <GlassButton variant="ghost" disabled>
            Coming Soon
          </GlassButton>
        )}
      </div>
    </div>
  );
}
