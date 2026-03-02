import { ProductCatalogGrid } from './ProductCatalogGrid';

interface ToolsScreenProps {
  onNavigate: (route: string) => void;
}

export function ToolsScreen({ onNavigate }: ToolsScreenProps) {
  return (
    <div className="h-[calc(100vh-3.5rem)] overflow-y-auto">
      <ProductCatalogGrid onNavigate={onNavigate} />
    </div>
  );
}
