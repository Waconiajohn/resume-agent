import { cn } from '@/lib/utils';

type IllustrationVariant = 'resume' | 'research' | 'interview' | 'blueprint';

const illustrations: Record<IllustrationVariant, React.ReactNode> = {
  resume: (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="14" y="8" width="36" height="48" rx="3" />
      <line x1="22" y1="20" x2="42" y2="20" />
      <line x1="22" y1="28" x2="38" y2="28" />
      <line x1="22" y1="36" x2="40" y2="36" />
      <line x1="22" y1="44" x2="32" y2="44" />
    </svg>
  ),
  research: (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="28" cy="28" r="14" />
      <line x1="38" y1="38" x2="52" y2="52" />
      <line x1="22" y1="24" x2="34" y2="24" />
      <line x1="22" y1="30" x2="30" y2="30" />
    </svg>
  ),
  interview: (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="12" width="40" height="32" rx="4" />
      <polyline points="8,44 16,52 24,44" />
      <text x="28" y="33" textAnchor="middle" fontSize="18" fill="currentColor" stroke="none">?</text>
    </svg>
  ),
  blueprint: (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="8" width="48" height="48" rx="3" />
      <line x1="8" y1="20" x2="56" y2="20" />
      <line x1="32" y1="20" x2="32" y2="56" />
      <rect x="12" y="24" width="16" height="8" rx="1" />
      <rect x="36" y="24" width="16" height="12" rx="1" />
      <rect x="12" y="40" width="16" height="12" rx="1" />
    </svg>
  ),
};

export function EmptyStateIllustration({
  variant,
  className,
  message,
}: {
  variant: IllustrationVariant;
  className?: string;
  message?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-8 text-white/20', className)}>
      {illustrations[variant]}
      {message && (
        <p className="text-xs text-white/40 text-center max-w-[200px]">{message}</p>
      )}
    </div>
  );
}
