import { GlassCard } from '@/components/GlassCard';
import { AlertCircle, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RuleOfFourGroup, ContactRole } from '@/hooks/useRuleOfFour';
import { CONTACT_ROLE_LABELS } from '@/hooks/useRuleOfFour';

interface RuleOfFourCoachingBarProps {
  groups: RuleOfFourGroup[];
  onFixGap: (applicationId: string, role: ContactRole) => void;
}

export function RuleOfFourCoachingBar({ groups: rawGroups, onFixGap }: RuleOfFourCoachingBarProps) {
  const groups = rawGroups ?? [];
  const incomplete = groups.filter((g) => g.progress < 4);
  if (incomplete.length === 0) return null;

  return (
    <GlassCard className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertCircle size={14} className="text-[#f0d99f]" />
        <span className="text-[12px] font-medium text-[#f0d99f]/80">
          {incomplete.length} application{incomplete.length !== 1 ? 's' : ''} need
          {incomplete.length === 1 ? 's' : ''} more contacts
        </span>
      </div>
      <div className="space-y-2">
        {incomplete.slice(0, 5).map((group) => (
          <div key={group.application.id} className="flex items-center gap-3 text-[12px]">
            <span className="text-[var(--text-soft)] font-medium min-w-[120px] truncate">
              {group.application.company_name}
            </span>
            <span className="text-[var(--text-soft)]">needs</span>
            <div className="flex gap-1.5 flex-wrap">
              {group.missingRoles.map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => onFixGap(group.application.id, role)}
                  className={cn(
                    'text-[12px] text-[#98b3ff]/70 bg-[#98b3ff]/[0.06] px-2 py-0.5 rounded-full',
                    'hover:bg-[#98b3ff]/[0.12] transition-colors flex items-center gap-1',
                  )}
                >
                  {CONTACT_ROLE_LABELS[role]}
                  <ChevronRight size={9} />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
