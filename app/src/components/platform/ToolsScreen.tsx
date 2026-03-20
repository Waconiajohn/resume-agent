import { ProductCatalogGrid } from './ProductCatalogGrid';
import { ProductLandingPage } from './ProductLandingPage';
import { PRODUCT_CATALOG } from '@/types/platform';

const EXPOSED_TOOL_SLUGS = new Set([
  'onboarding',
  'resume',
  'cover-letter',
  'linkedin',
  'jobs',
  'interview',
  'salary-negotiation',
]);

interface ToolsScreenProps {
  slug?: string;
  onNavigate: (route: string) => void;
  onOpenCoach?: () => void;
  userName?: string;
}

export function ToolsScreen({ slug, onNavigate, onOpenCoach, userName }: ToolsScreenProps) {
  if (slug) {
    const product = EXPOSED_TOOL_SLUGS.has(slug)
      ? PRODUCT_CATALOG.find((p) => p.slug === slug)
      : undefined;

    if (!product) {
      return (
        <div className="h-[calc(100vh-3.5rem)] overflow-y-auto">
          <div className="mx-auto max-w-4xl px-4 py-8">
            <button
              onClick={() => onNavigate('/tools')}
              className="mb-6 flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80 transition-colors duration-150"
            >
              <span aria-hidden="true">&#8592;</span>
              Back to Tools
            </button>
            <p className="text-sm text-white/50">Product not found.</p>
          </div>
        </div>
      );
    }

    return (
      <div className="h-[calc(100vh-3.5rem)] overflow-y-auto">
        <ProductLandingPage product={product} onNavigate={onNavigate} />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-3.5rem)] overflow-y-auto">
      <ProductCatalogGrid onNavigate={onNavigate} onOpenCoach={onOpenCoach} userName={userName} />
    </div>
  );
}
