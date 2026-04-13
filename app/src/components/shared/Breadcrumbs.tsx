import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={cn('shell-breadcrumbs', className)}>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={`${item.label}-${index}`}>
            {item.onClick && !isLast ? (
              <button type="button" onClick={item.onClick}>
                {item.label}
              </button>
            ) : (
              <span className={isLast ? 'text-[var(--text-strong)]' : undefined} aria-current={isLast ? 'page' : undefined}>{item.label}</span>
            )}
            {!isLast && <ChevronRight className="separator h-3.5 w-3.5" aria-hidden="true" />}
          </span>
        );
      })}
    </nav>
  );
}
