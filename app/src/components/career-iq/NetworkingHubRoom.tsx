import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { ContextLoadedBadge } from '@/components/career-iq/ContextLoadedBadge';
import {
  Users,
  UserCircle,
  MessageSquare,
  Send,
  Copy,
  Check,
  TrendingUp,
  Briefcase,
  Clock,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Loader2,
  AlertCircle,
  RotateCcw,
  Bell,
  Plus,
  Zap,
  Minus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useNetworkingOutreach } from '@/hooks/useNetworkingOutreach';
import { useNetworkingContacts, type NetworkingContact, type Touchpoint } from '@/hooks/useNetworkingContacts';
import { useRuleOfFour, CONTACT_ROLE_LABELS, ALL_ROLES, type ContactRole, type RuleOfFourGroup } from '@/hooks/useRuleOfFour';
import { ContactFormModal, type CreateContactData } from '@/components/career-iq/ContactFormModal';
import { ContactDetailSheet } from '@/components/career-iq/ContactDetailSheet';
import { RuleOfFourCoachingBar } from '@/components/career-iq/RuleOfFourCoachingBar';

// --- Business Rules ---

const FOLLOWUP_DAYS = 4;
const SNOOZE_DAYS = 3;
const RESPONSE_STRENGTH_THRESHOLD = 1;

// --- Messaging Method Config ---

type MessagingMethod = 'group_message' | 'connection_request' | 'inmail';

const MESSAGING_METHOD_CONFIG: Record<MessagingMethod, {
  label: string;
  maxChars: number;
  description: string;
  coaching: string;
}> = {
  group_message: {
    label: 'Group Message',
    maxChars: 8000,
    description: 'Free messaging via shared LinkedIn groups',
    coaching: 'Best option — join shared groups for free messaging access. No InMail credits needed.',
  },
  connection_request: {
    label: 'Connection Request',
    maxChars: 300,
    description: 'Direct connection request with note',
    coaching: 'Limited to 300 characters. Make every word count — lead with shared context.',
  },
  inmail: {
    label: 'InMail',
    maxChars: 1900,
    description: 'LinkedIn InMail (uses credits)',
    coaching: 'Reserve for high-value targets with no shared groups. You get ~5/week on most plans.',
  },
};

// --- Outreach prefill type ---

export interface OutreachReferralContext {
  company: string;
  bonus_amount: string;
  bonus_currency?: string;
  job_title?: string;
  contact_name?: string;
  contact_title?: string;
}

interface OutreachPrefill {
  name: string;
  title: string;
  company: string;
  referralContext?: OutreachReferralContext;
}

// --- Status config ---

type OutreachStatus = 'not_started' | 'messaged';

const STATUS_CONFIG: Record<OutreachStatus, { label: string; color: string; borderColor: string }> = {
  not_started: { label: 'Not Started', color: 'text-[var(--text-soft)] bg-[var(--accent-muted)]', borderColor: 'border-[var(--line-soft)]' },
  messaged: { label: 'Contacted', color: 'text-[#afc4ff] bg-[#afc4ff]/10', borderColor: 'border-[#afc4ff]/15' },
};

function deriveOutreachStatus(contact: NetworkingContact): OutreachStatus {
  return contact.last_contact_date ? 'messaged' : 'not_started';
}

function daysSince(iso: string | null): number {
  if (!iso) return Infinity;
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

function daysUntil(iso: string | null): number {
  if (!iso) return Infinity;
  return Math.floor((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function startOfWeek(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

// --- FollowUpBar (Story 61-6) ---

interface FollowUpBarProps {
  followUps: NetworkingContact[];
  onDone: (id: string) => void;
  onSnooze: (id: string) => void;
}

function FollowUpBar({ followUps, onDone, onSnooze }: FollowUpBarProps) {
  if (followUps.length === 0) return null;

  return (
    <details className="rounded-xl border border-[#f0d99f]/20 bg-[#f0d99f]/[0.04] overflow-hidden">
      <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer list-none hover:bg-[var(--accent-muted)] transition-colors">
        <Bell size={14} className="text-[#f0d99f] flex-shrink-0" />
        <span className="text-[13px] font-medium text-[#f0d99f]">
          {followUps.length} contact{followUps.length !== 1 ? 's' : ''} need follow-up
        </span>
        <ChevronDown size={13} className="text-[#f0d99f]/50 ml-auto" />
      </summary>

      <div className="border-t border-[#f0d99f]/10 px-4 py-3 space-y-2">
        {followUps.map((contact) => {
          const days = daysUntil(contact.next_followup_at);
          const overdue = days < 0;
          return (
            <div key={contact.id} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <span className="text-[13px] font-medium text-[var(--text-muted)]">{contact.name}</span>
                {contact.company && (
                  <span className="text-[13px] text-[var(--text-soft)] ml-2">{contact.company}</span>
                )}
                <span
                  className={cn(
                    'text-[13px] ml-2',
                    overdue ? 'text-red-400' : 'text-[#f0d99f]',
                  )}
                >
                  {overdue
                    ? `${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''} overdue`
                    : `due in ${days} day${days !== 1 ? 's' : ''}`}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => onDone(contact.id)}
                  className="text-[13px] text-[#b5dec2] hover:text-[#b5dec2]/80 transition-colors px-2 py-1 rounded border border-[#b5dec2]/20 hover:bg-[#b5dec2]/5"
                >
                  Done
                </button>
                <button
                  type="button"
                  onClick={() => onSnooze(contact.id)}
                  className="text-[13px] text-[var(--text-soft)] hover:text-[var(--text-soft)] transition-colors px-2 py-1 rounded border border-[var(--line-soft)] hover:bg-[var(--accent-muted)]"
                >
                  Snooze {SNOOZE_DAYS}d
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </details>
  );
}

// --- RuleOfFourSection (Story 61-2) ---

interface RuleOfFourSectionProps {
  groups: RuleOfFourGroup[];
  loading: boolean;
  onAddContact: (applicationId: string, company: string, missingRole: ContactRole) => void;
  onGenerateMessage: (prefill: OutreachPrefill) => void;
}

function RuleOfFourSection({ groups, loading, onAddContact, onGenerateMessage }: RuleOfFourSectionProps) {
  const [expandedGroup, setExpandedGroup] = useState<string>(groups[0]?.application.id ?? '');

  useEffect(() => {
    if (groups.length > 0 && !expandedGroup) {
      setExpandedGroup(groups[0].application.id);
    }
  }, [groups, expandedGroup]);

  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-2 mb-2">
        <Users size={18} className="text-[#98b3ff]" />
        <h3 className="text-[15px] font-semibold text-[var(--text-strong)]">Rule of Four</h3>
      </div>
      <p className="text-[12px] text-[var(--text-soft)] mb-4">
        For every application, reach out to 4 people at the target company. Networking bypasses the queue.
      </p>

      {loading && (
        <div className="flex items-center gap-2 text-[12px] text-[var(--text-soft)] py-4">
          <Loader2 size={13} className="animate-spin" />
          Loading applications...
        </div>
      )}

      {!loading && groups.length === 0 && (
        <p className="text-[12px] text-[var(--text-soft)] py-4 text-center">
          No active applications found. Add applications in Job Search to get started.
        </p>
      )}

      <div className="space-y-3">
        {groups.map((group) => {
          const isExpanded = expandedGroup === group.application.id;
          return (
            <div
              key={group.application.id}
              className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setExpandedGroup(isExpanded ? '' : group.application.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--accent-muted)] transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-[var(--text-muted)]">
                    {group.application.company_name}
                  </div>
                  <div className="text-[13px] text-[var(--text-soft)]">{group.application.role_title}</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span
                    className={cn(
                      'text-[13px] font-medium',
                      group.progress === 4
                        ? 'text-[#b5dec2]'
                        : group.progress > 0
                        ? 'text-[#f0d99f]'
                        : 'text-[var(--text-soft)]',
                    )}
                  >
                    {group.progress}/4
                  </span>
                  {isExpanded ? (
                    <ChevronUp size={14} className="text-[var(--text-soft)]" />
                  ) : (
                    <ChevronDown size={14} className="text-[var(--text-soft)]" />
                  )}
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-[var(--line-soft)] px-4 py-3 space-y-2.5">
                  {group.contacts.map((contact) => {
                    const status = STATUS_CONFIG[deriveOutreachStatus(contact)];
                    return (
                      <div key={contact.id} className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-[var(--accent-muted)] flex items-center justify-center flex-shrink-0">
                          <UserCircle size={16} className="text-[var(--text-soft)]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[12px] font-medium text-[var(--text-muted)]">
                              {contact.name}
                            </span>
                          </div>
                          <div className="text-[13px] text-[var(--text-soft)]">{contact.title}</div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {contact.contact_role && (
                            <span className="text-[12px] text-[var(--text-soft)] uppercase tracking-wider">
                              {CONTACT_ROLE_LABELS[contact.contact_role as ContactRole]}
                            </span>
                          )}
                          <span
                            className={cn(
                              'text-[12px] font-medium px-1.5 py-0.5 rounded-md border',
                              status.color,
                              status.borderColor,
                            )}
                          >
                            {status.label}
                          </span>
                          <button
                            type="button"
                            onClick={() => onGenerateMessage({
                              name: contact.name,
                              title: contact.title ?? '',
                              company: group.application.company_name,
                            })}
                            className="flex items-center gap-0.5 text-[12px] text-[#98b3ff]/50 hover:text-[#98b3ff] transition-colors px-1.5 py-0.5 rounded border border-[#98b3ff]/15 hover:bg-[#98b3ff]/[0.06]"
                          >
                            <Sparkles size={9} />
                            Message
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {group.missingRoles.length > 0 && (
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() =>
                          onAddContact(
                            group.application.id,
                            group.application.company_name,
                            group.missingRoles[0],
                          )
                        }
                        className="flex items-center gap-1.5 text-[13px] text-[#98b3ff]/60 hover:text-[#98b3ff] transition-colors"
                      >
                        <Plus size={11} />
                        Add {CONTACT_ROLE_LABELS[group.missingRoles[0]]}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}

// --- Follow-Up Timeline ---

const FOLLOWUP_TIMELINE_STEPS = [
  { label: 'Connection Request', day: 0, description: 'First contact — specific reason for connecting' },
  { label: 'Follow-Up #1', day: 3, description: 'Share one insight, ask one question' },
  { label: 'Follow-Up #2', day: 10, description: 'Provide value — resource, intro, or perspective' },
  { label: 'Value Offer', day: 24, description: 'Specific, tangible value tailored to them' },
  { label: 'Stop', day: 0, description: 'No response after 3 attempts — move on gracefully' },
];

function FollowUpTimeline({ hasReport }: { hasReport: boolean }) {
  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <Clock size={14} className="text-[#afc4ff]" />
        <span className="text-[12px] font-semibold text-[var(--text-muted)]">Follow-Up Cadence</span>
        <span className="ml-auto text-[12px] text-[var(--text-soft)]">Best practice</span>
      </div>
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-[var(--accent-muted)]" />
        <div className="space-y-4">
          {FOLLOWUP_TIMELINE_STEPS.map((step, idx) => {
            const isStop = step.label === 'Stop';
            return (
              <div key={step.label} className="flex items-start gap-3 relative">
                <div className={cn(
                  'w-3.5 h-3.5 rounded-full border flex-shrink-0 mt-0.5 flex items-center justify-center',
                  isStop
                    ? 'border-[#f0b8b8]/40 bg-[#f0b8b8]/10'
                    : hasReport && idx === 0
                    ? 'border-[#b5dec2]/40 bg-[#b5dec2]/20'
                    : 'border-[var(--line-strong)] bg-[var(--accent-muted)]',
                )}>
                  {isStop ? (
                    <Minus size={6} className="text-[#f0b8b8]/60" />
                  ) : (
                    <div className={cn(
                      'w-1.5 h-1.5 rounded-full',
                      hasReport && idx === 0 ? 'bg-[#b5dec2]' : 'bg-[var(--line-strong)]',
                    )} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn(
                      'text-[13px] font-medium',
                      isStop ? 'text-[#f0b8b8]/70' : 'text-[var(--text-muted)]',
                    )}>
                      {step.label}
                    </span>
                    {step.day > 0 && (
                      <span className="text-[12px] text-[#afc4ff]/50 bg-[#afc4ff]/[0.06] px-1.5 py-0.5 rounded-md border border-[#afc4ff]/10">
                        Day {step.day}
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-[var(--text-soft)] mt-0.5 leading-tight">{step.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </GlassCard>
  );
}

// --- GeneratedMessages (shows last generated outreach sequence) ---

interface GeneratedMessagesProps {
  report: string | null;
  qualityScore: number | null;
  messageCount: number | null;
}

function GeneratedMessages({ report, qualityScore, messageCount }: GeneratedMessagesProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!report) return;
    navigator.clipboard.writeText(report).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-2 mb-2">
        <MessageSquare size={18} className="text-[#afc4ff]" />
        <h3 className="text-[15px] font-semibold text-[var(--text-strong)]">Generated Sequence</h3>
        {qualityScore != null && (
          <span className={cn(
            'ml-auto text-[12px] font-medium px-1.5 py-0.5 rounded-md border',
            qualityScore >= 80
              ? 'text-[#b5dec2] bg-[#b5dec2]/10 border-[#b5dec2]/15'
              : qualityScore >= 60
              ? 'text-[#f0d99f] bg-[#f0d99f]/10 border-[#f0d99f]/15'
              : 'text-[#f0b8b8] bg-[#f0b8b8]/10 border-[#f0b8b8]/15',
          )}>
            Quality: {qualityScore}%
          </span>
        )}
      </div>

      {!report && (
        <div className="py-6 text-center space-y-2">
          <Zap size={24} className="text-[var(--text-soft)] mx-auto" />
          <p className="text-[12px] text-[var(--text-soft)] leading-relaxed">
            Click <span className="text-[#afc4ff]/60 font-medium">Message</span> next to any Rule of Four contact to generate a personalized outreach sequence.
          </p>
          <p className="text-[13px] text-[var(--text-soft)] leading-relaxed">
            Each sequence includes a connection request, follow-ups, a value offer, and a meeting request — all personalized to the specific contact.
          </p>
        </div>
      )}

      {report && (
        <div className="space-y-3 mt-2">
          {messageCount != null && (
            <div className="flex items-center gap-2">
              <span className="text-[13px] text-[var(--text-soft)]">{messageCount} messages</span>
              <span className="text-[12px] text-[var(--text-soft)]">·</span>
              <span className="text-[12px] text-[#afc4ff]/50 bg-[#afc4ff]/[0.06] px-1.5 py-0.5 rounded-md border border-[#afc4ff]/10">
                Personalized sequence
              </span>
            </div>
          )}
          <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-4 max-h-[380px] overflow-y-auto">
            <pre className="text-[12px] text-[var(--text-muted)] leading-relaxed whitespace-pre-wrap font-sans">
              {report}
            </pre>
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1.5 text-[13px] text-[var(--text-soft)] hover:text-[var(--text-soft)] transition-colors"
          >
            {copied ? (
              <><Check size={11} className="text-[#b5dec2]" /> Copied</>
            ) : (
              <><Copy size={11} /> Copy Full Sequence</>
            )}
          </button>
        </div>
      )}
    </GlassCard>
  );
}

// --- WeeklyActivity (Story 61-4) ---

interface WeeklyActivityProps {
  contacts: NetworkingContact[];
}

function WeeklyActivity({ contacts: rawContacts }: WeeklyActivityProps) {
  const contacts = rawContacts ?? [];
  const weekStart = startOfWeek();

  const metrics = useMemo(() => {
    const weekContacts = contacts.filter(
      (c) => c.created_at && new Date(c.created_at) >= weekStart,
    );
    const weekResponses = contacts.filter(
      (c) =>
        c.last_contact_date &&
        new Date(c.last_contact_date) >= weekStart &&
        c.relationship_strength > RESPONSE_STRENGTH_THRESHOLD,
    );

    return [
      { label: 'New Contacts', value: String(weekContacts.length), period: 'this week' },
      { label: 'Responses', value: String(weekResponses.length), period: 'this week' },
      { label: 'Total Network', value: String(contacts.length), period: 'all time' },
    ];
  }, [contacts, weekStart]);

  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp size={18} className="text-[#98b3ff]" />
        <h3 className="text-[15px] font-semibold text-[var(--text-strong)]">Weekly Activity</h3>
        <span className="ml-auto text-[13px] text-[var(--text-soft)]">This week</span>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-4 text-center"
          >
            <div className="text-[22px] font-bold text-[var(--text-strong)] tabular-nums">{metric.value}</div>
            <div className="text-[13px] text-[var(--text-soft)] mt-0.5">{metric.label}</div>
            <div className="flex items-center justify-center gap-1 mt-2">
              <span className="text-[12px] text-[var(--text-soft)]">{metric.period}</span>
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

// --- RecruiterTracker (Story 61-5) ---

interface RecruiterTrackerProps {
  contacts: NetworkingContact[];
  onAddRecruiter: () => void;
  onOpenContact: (contact: NetworkingContact) => void;
}

function RecruiterTracker({ contacts: rawContacts, onAddRecruiter, onOpenContact }: RecruiterTrackerProps) {
  const contacts = rawContacts ?? [];
  const statusColors: Record<string, string> = {
    active: 'text-[#b5dec2] bg-[#b5dec2]/10',
    cold: 'text-[#f0d99f] bg-[#f0d99f]/10',
    dormant: 'text-[var(--text-soft)] bg-[var(--accent-muted)]',
  };

  function recruiterStatus(contact: NetworkingContact): 'active' | 'cold' | 'dormant' {
    const days = daysSince(contact.last_contact_date);
    if (days < 14) return 'active';
    if (days < 30) return 'cold';
    return 'dormant';
  }

  const recruiters = contacts.filter((c) => c.relationship_type === 'recruiter');

  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Briefcase size={18} className="text-[#98b3ff]" />
        <h3 className="text-[15px] font-semibold text-[var(--text-strong)]">Recruiter Tracker</h3>
        <button
          type="button"
          onClick={onAddRecruiter}
          className="ml-auto flex items-center gap-1.5 text-[13px] text-[#98b3ff]/60 hover:text-[#98b3ff] transition-colors"
        >
          <Plus size={11} /> Add Recruiter
        </button>
      </div>
      <p className="text-[12px] text-[var(--text-soft)] mb-4">
        Executive recruiters working in your space. Keep them warm — they source 30%+ of VP-level placements.
      </p>

      {recruiters.length === 0 && (
        <p className="text-[12px] text-[var(--text-soft)] text-center py-4">
          No recruiters added yet.{' '}
          <button
            type="button"
            onClick={onAddRecruiter}
            className="text-[#98b3ff]/60 hover:text-[#98b3ff] transition-colors"
          >
            Add your first recruiter.
          </button>
        </p>
      )}

      <div className="space-y-2.5">
        {recruiters.map((recruiter) => {
          const status = recruiterStatus(recruiter);
          return (
            <button
              key={recruiter.id}
              type="button"
              onClick={() => onOpenContact(recruiter)}
              className="w-full flex items-center gap-3 rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3 text-left hover:bg-[var(--accent-muted)] transition-colors"
            >
              <div className="h-8 w-8 rounded-full bg-[var(--accent-muted)] flex items-center justify-center flex-shrink-0">
                <span className="text-[12px] font-bold text-[var(--text-soft)]">
                  {recruiter.name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-[var(--text-muted)]">{recruiter.name}</div>
                <div className="text-[13px] text-[var(--text-soft)]">
                  {recruiter.company ?? 'Unknown firm'}
                  {recruiter.title ? ` · ${recruiter.title}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {recruiter.last_contact_date && (
                  <span className="flex items-center gap-1 text-[12px] text-[var(--text-soft)]">
                    <Clock size={10} />
                    {new Date(recruiter.last_contact_date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                )}
                <span
                  className={cn(
                    'text-[12px] font-medium px-2 py-0.5 rounded-full capitalize',
                    statusColors[status],
                  )}
                >
                  {status}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </GlassCard>
  );
}

// --- Outreach Generator ---

interface OutreachGeneratorProps {
  prefill?: OutreachPrefill | null;
  onReady?: (outreach: ReturnType<typeof useNetworkingOutreach>) => void;
}

function OutreachGenerator({ prefill, onReady }: OutreachGeneratorProps) {
  const outreach = useNetworkingOutreach();
  const [targetName, setTargetName] = useState(prefill?.name ?? '');
  const [targetTitle, setTargetTitle] = useState(prefill?.title ?? '');
  const [targetCompany, setTargetCompany] = useState(prefill?.company ?? '');
  const [targetLinkedIn, setTargetLinkedIn] = useState('');
  const [contextNotes, setContextNotes] = useState('');
  const [resumeText, setResumeText] = useState('');
  const [messagingMethod, setMessagingMethod] = useState<MessagingMethod>('group_message');
  const [showForm, setShowForm] = useState(true);

  // Auto-load master resume on mount
  useEffect(() => {
    let cancelled = false;
    async function loadResume() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;
        const { data } = await supabase
          .from('master_resumes')
          .select('raw_text')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .single();
        if (!cancelled && data?.raw_text) {
          setResumeText(data.raw_text);
        }
      } catch { /* ignore */ }
    }
    loadResume();
    return () => { cancelled = true; };
  }, []);

  // Sync prefill into form when a contact's "Generate Message" is clicked
  useEffect(() => {
    if (prefill) {
      setTargetName(prefill.name);
      setTargetTitle(prefill.title);
      setTargetCompany(prefill.company);
      setShowForm(true);
      outreach.reset();
    }
  }, [prefill]);

  // Expose the outreach hook to the parent for GeneratedMessages access.
  // Depend on outreach.status (a primitive) rather than the outreach object
  // itself, which is a new reference on every render.
  useEffect(() => {
    onReady?.(outreach);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outreach.status, onReady]);

  const canGenerate =
    targetName.trim() && targetTitle.trim() && targetCompany.trim() && resumeText.trim().length >= 50;

  const handleGenerate = useCallback(async () => {
    if (!canGenerate) return;
    setShowForm(false);
    await outreach.startPipeline({
      resumeText,
      messagingMethod,
      targetInput: {
        target_name: targetName.trim(),
        target_title: targetTitle.trim(),
        target_company: targetCompany.trim(),
        target_linkedin_url: targetLinkedIn.trim() || undefined,
        context_notes: contextNotes.trim() || undefined,
      },
      referralContext: prefill?.referralContext,
    });
  }, [
    canGenerate,
    outreach.startPipeline,
    resumeText,
    messagingMethod,
    targetName,
    targetTitle,
    targetCompany,
    targetLinkedIn,
    contextNotes,
  ]);

  const handleReset = useCallback(() => {
    outreach.reset();
    setShowForm(true);
  }, [outreach.reset]);

  const handleReviewGeneratedSequence = useCallback(() => {
    const el = document.getElementById('generated-outreach-sequence');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles size={18} className="text-[#98b3ff]" />
        <h3 className="text-[15px] font-semibold text-[var(--text-strong)]">Outreach Generator</h3>
        {outreach.status !== 'idle' && outreach.status !== 'connecting' && (
          <button
            type="button"
            onClick={handleReset}
            className="ml-auto flex items-center gap-1 text-[13px] text-[var(--text-soft)] hover:text-[var(--text-soft)] transition-colors"
          >
            <RotateCcw size={11} /> New Sequence
          </button>
        )}
      </div>
      <p className="text-[12px] text-[var(--text-soft)] mb-4">
        Generate a personalized LinkedIn outreach sequence for any target contact. Built from your
        resume and positioning.
      </p>

      {/* Input form */}
      {showForm && outreach.status === 'idle' && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              id="outreach-target-name"
              aria-label="Target name"
              type="text"
              placeholder="Target name *"
              value={targetName}
              onChange={(e) => setTargetName(e.target.value)}
              className="rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-2 text-[13px] text-[var(--text-muted)] placeholder:text-[var(--text-soft)] focus:border-[#98b3ff]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40"
            />
            <input
              id="outreach-target-title"
              aria-label="Target title"
              type="text"
              placeholder="Target title *"
              value={targetTitle}
              onChange={(e) => setTargetTitle(e.target.value)}
              className="rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-2 text-[13px] text-[var(--text-muted)] placeholder:text-[var(--text-soft)] focus:border-[#98b3ff]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40"
            />
            <input
              id="outreach-target-company"
              aria-label="Target company"
              type="text"
              placeholder="Target company *"
              value={targetCompany}
              onChange={(e) => setTargetCompany(e.target.value)}
              className="rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-2 text-[13px] text-[var(--text-muted)] placeholder:text-[var(--text-soft)] focus:border-[#98b3ff]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              id="outreach-linkedin-url"
              aria-label="Target LinkedIn URL"
              type="url"
              placeholder="LinkedIn URL (optional)"
              value={targetLinkedIn}
              onChange={(e) => setTargetLinkedIn(e.target.value)}
              className="rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-2 text-[13px] text-[var(--text-muted)] placeholder:text-[var(--text-soft)] focus:border-[#98b3ff]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40"
            />
            <input
              id="outreach-context-notes"
              aria-label="Context notes"
              type="text"
              placeholder="Context notes (optional — shared events, mutual connections, etc.)"
              value={contextNotes}
              onChange={(e) => setContextNotes(e.target.value)}
              className="rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-2 text-[13px] text-[var(--text-muted)] placeholder:text-[var(--text-soft)] focus:border-[#98b3ff]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40"
            />
          </div>
          <textarea
            id="outreach-resume"
            aria-label="Resume text"
            placeholder="Resume text * — auto-loading from your master resume..."
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-2 text-[13px] text-[var(--text-muted)] placeholder:text-[var(--text-soft)] focus:border-[#98b3ff]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40 resize-none"
          />
          <div className="flex flex-col gap-2">
            <label className="text-[13px] font-medium text-[var(--text-soft)] uppercase tracking-wider">Messaging Method</label>
            <div className="grid grid-cols-3 gap-2">
              {(['group_message', 'connection_request', 'inmail'] as const).map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => setMessagingMethod(method)}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-left transition-all',
                    messagingMethod === method
                      ? 'border-[#98b3ff]/30 bg-[#98b3ff]/[0.06]'
                      : 'border-[var(--line-soft)] bg-[var(--accent-muted)] hover:border-[var(--line-soft)]',
                  )}
                >
                  <div className="text-[12px] font-medium text-[var(--text-soft)]">{MESSAGING_METHOD_CONFIG[method].label}</div>
                  <div className="text-[12px] text-[var(--text-soft)]">{MESSAGING_METHOD_CONFIG[method].maxChars} chars</div>
                </button>
              ))}
            </div>
            <p className="text-[13px] text-[#98b3ff]/50 italic">{MESSAGING_METHOD_CONFIG[messagingMethod].coaching}</p>
          </div>
          <GlassButton onClick={handleGenerate} disabled={!canGenerate} className="w-full sm:w-auto">
            <Sparkles size={14} />
            Generate Outreach Sequence
          </GlassButton>
        </div>
      )}

      {/* Running state */}
      {(outreach.status === 'connecting' || outreach.status === 'running') && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-[13px] text-[var(--text-soft)]">
            <Loader2 size={14} className="animate-spin text-[#98b3ff]" />
            <span>
              {outreach.currentStage === 'writing'
                ? 'Writing outreach messages...'
                : 'Researching target contact...'}
            </span>
          </div>
          {outreach.activityMessages.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] p-3 space-y-1.5">
              {outreach.activityMessages.map((msg) => (
                <div key={msg.id} className="flex items-start gap-2 text-[13px]">
                  <span className="text-[#98b3ff]/40 font-mono shrink-0">
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                  <span className="text-[var(--text-soft)]">{msg.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Error state */}
      {outreach.status === 'error' && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
          <AlertCircle size={14} className="text-red-400 shrink-0" />
          <span className="text-[12px] text-red-300">{outreach.error}</span>
        </div>
      )}

      {/* Complete state — hand off to the dedicated results card below */}
      {outreach.status === 'complete' && outreach.report && (
        <div className="rounded-xl border border-[#b5dec2]/20 bg-[#b5dec2]/[0.05] px-4 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-[13px] font-semibold text-[#b5dec2]">Sequence ready</div>
              <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-soft)]">
                Review the finished outreach sequence in the Generated Sequence card below, then copy or reset from there.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {outreach.messageCount != null && (
                <span className="text-[12px] text-[var(--text-soft)]">
                  {outreach.messageCount} messages ready
                </span>
              )}
              <GlassButton variant="ghost" onClick={handleReviewGeneratedSequence}>
                View sequence
              </GlassButton>
            </div>
          </div>
        </div>
      )}
    </GlassCard>
  );
}

// --- Main component ---

interface NetworkingHubRoomProps {
  /** Pre-fill the outreach generator with this context when the room mounts */
  initialPrefill?: OutreachPrefill;
}

export function NetworkingHubRoom({ initialPrefill }: NetworkingHubRoomProps = {}) {
  const ruleOfFour = useRuleOfFour();
  const networkingContacts = useNetworkingContacts();

  const [showContactModal, setShowContactModal] = useState(false);
  const [contactModalDefaults, setContactModalDefaults] = useState<Partial<CreateContactData>>({});
  const [contactModalTitle, setContactModalTitle] = useState('Add Contact');

  const [selectedContact, setSelectedContact] = useState<NetworkingContact | null>(null);
  const [selectedTouchpoints, setSelectedTouchpoints] = useState<Touchpoint[]>([]);

  const [followUps, setFollowUps] = useState<NetworkingContact[]>([]);
  const [contactsError, setContactsError] = useState<string | null>(null);

  // Story 62-1: prefill state for outreach generator + expose messages for GeneratedMessages
  const [outreachPrefill, setOutreachPrefill] = useState<OutreachPrefill | null>(initialPrefill ?? null);
  const [outreachState, setOutreachState] = useState<ReturnType<typeof useNetworkingOutreach> | null>(null);

  useEffect(() => {
    setOutreachPrefill(initialPrefill ?? null);
  }, [initialPrefill]);

  const handleGenerateMessage = useCallback((prefill: OutreachPrefill) => {
    setOutreachPrefill(prefill);
    // Scroll to generator section
    const el = document.getElementById('outreach-generator');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // Fetch contacts and follow-ups on mount
  useEffect(() => {
    networkingContacts.fetchContacts().catch(() => {
      setContactsError('Could not load contacts. Please try again.');
    });
    networkingContacts.fetchFollowUps(7).then((contacts) => {
      setFollowUps(contacts);
    }).catch(() => {
      setContactsError('Could not load follow-ups. Please try again.');
    });
  }, [networkingContacts.fetchContacts, networkingContacts.fetchFollowUps]);

  const recruiterContacts = useMemo(
    () => (networkingContacts.contacts ?? []).filter((c) => c.relationship_type === 'recruiter'),
    [networkingContacts.contacts],
  );

  // Open modal to add a contact for a specific application + role
  const handleAddContactForApp = useCallback(
    (applicationId: string, company: string, missingRole: ContactRole) => {
      setContactModalDefaults({
        application_id: applicationId,
        company,
        contact_role: missingRole,
        relationship_type: missingRole === 'hr_recruiter' ? 'recruiter' : 'other',
      });
      setContactModalTitle(`Add ${CONTACT_ROLE_LABELS[missingRole]} — ${company}`);
      setShowContactModal(true);
    },
    [],
  );

  const handleAddRecruiter = useCallback(() => {
    setContactModalDefaults({ relationship_type: 'recruiter' });
    setContactModalTitle('Add Recruiter');
    setShowContactModal(true);
  }, []);

  const handleAddGenericContact = useCallback(() => {
    setContactModalDefaults({});
    setContactModalTitle('Add Contact');
    setShowContactModal(true);
  }, []);

  const handleSaveContact = useCallback(
    async (data: CreateContactData): Promise<void> => {
      await networkingContacts.createContact(data);
      // Refresh rule of four data
      await ruleOfFour.refresh();
    },
    [networkingContacts.createContact, ruleOfFour.refresh],
  );

  const handleOpenContactDetail = useCallback(
    async (contact: NetworkingContact) => {
      setSelectedContact(contact);
      const touchpoints = await networkingContacts.fetchTouchpoints(contact.id);
      setSelectedTouchpoints(touchpoints);
    },
    [networkingContacts.fetchTouchpoints],
  );

  const handleLogTouchpoint = useCallback(
    async (type: string, notes?: string): Promise<void> => {
      if (!selectedContact) return;
      const result = await networkingContacts.logTouchpoint(selectedContact.id, type, notes);
      if (result) {
        // Refresh touchpoints for the detail sheet
        const updated = await networkingContacts.fetchTouchpoints(selectedContact.id);
        setSelectedTouchpoints(updated);
      }
    },
    [selectedContact, networkingContacts.logTouchpoint, networkingContacts.fetchTouchpoints],
  );

  const handleDone = useCallback(
    async (id: string) => {
      await networkingContacts.logTouchpoint(id, 'email');
      const nextFollowup = new Date(Date.now() + FOLLOWUP_DAYS * 24 * 60 * 60 * 1000).toISOString();
      await networkingContacts.updateContact(id, { next_followup_at: nextFollowup });
      // Remove from follow-ups list
      setFollowUps((prev) => prev.filter((c) => c.id !== id));
    },
    [networkingContacts.logTouchpoint, networkingContacts.updateContact],
  );

  const handleSnooze = useCallback(
    async (id: string) => {
      const nextFollowup = new Date(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000).toISOString();
      await networkingContacts.updateContact(id, { next_followup_at: nextFollowup });
      setFollowUps((prev) => prev.filter((c) => c.id !== id));
    },
    [networkingContacts.updateContact],
  );

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-[var(--text-strong)]">Contacts &amp; Outreach</h1>
          <p className="text-[13px] text-[var(--text-soft)]">
            Smart Referrals turns your network into real outreach. For every application, the Rule
            of Four helps you get past the queue and in front of decision-makers.
          </p>
          <ContextLoadedBadge
            contextTypes={['career_profile', 'positioning_strategy', 'evidence_item']}
            className="mt-2"
          />
        </div>
        <div className="flex items-center gap-2">
          <GlassButton onClick={handleAddGenericContact}>
            <Plus size={14} />
            Add Contact
          </GlassButton>
        </div>
      </div>

      {/* Contacts load error */}
      {contactsError && (
        <div className="text-[12px] text-red-400/70 flex items-center gap-2">
          <AlertCircle size={12} />
          {contactsError}
          <button
            type="button"
            onClick={() => {
              setContactsError(null);
              networkingContacts.fetchContacts().catch(() => {
                setContactsError('Could not load contacts. Please try again.');
              });
            }}
            className="text-[#98b3ff] hover:underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Follow-up reminders */}
      {followUps.length > 0 && (
        <FollowUpBar followUps={followUps} onDone={handleDone} onSnooze={handleSnooze} />
      )}

      {/* Rule of Four coaching nudges */}
      {ruleOfFour.groups.length > 0 && (
        <RuleOfFourCoachingBar
          groups={ruleOfFour.groups}
          onFixGap={(appId, role) => {
            const app = ruleOfFour.groups.find((g) => g.application.id === appId)?.application;
            setContactModalDefaults({
              application_id: appId,
              contact_role: role,
              company: app?.company_name ?? '',
            });
            setShowContactModal(true);
          }}
        />
      )}

      {/* Outreach Generator — full width */}
      <div id="outreach-generator">
        <OutreachGenerator
          prefill={outreachPrefill}
          onReady={setOutreachState}
        />
      </div>

      {/* Rule of Four — full width */}
      <RuleOfFourSection
        groups={ruleOfFour.groups}
        loading={ruleOfFour.loading}
        onAddContact={handleAddContactForApp}
        onGenerateMessage={handleGenerateMessage}
      />

      {/* Generated Outreach Messages + Follow-Up Timeline + Weekly Activity */}
      <div className="flex flex-col lg:flex-row gap-6">
        <div id="generated-outreach-sequence" className="flex-[3] min-w-0">
          <GeneratedMessages
            report={outreachState?.report ?? null}
            qualityScore={outreachState?.qualityScore ?? null}
            messageCount={outreachState?.messageCount ?? null}
          />
        </div>
        <div className="flex-[2] flex flex-col gap-6">
          <FollowUpTimeline hasReport={!!outreachState?.report} />
          <WeeklyActivity contacts={networkingContacts.contacts ?? []} />
        </div>
      </div>

      {/* Recruiter Tracker — full width */}
      <RecruiterTracker
        contacts={recruiterContacts}
        onAddRecruiter={handleAddRecruiter}
        onOpenContact={handleOpenContactDetail}
      />

      {/* Modals */}
      {showContactModal && (
        <ContactFormModal
          isOpen={showContactModal}
          onClose={() => setShowContactModal(false)}
          onSave={handleSaveContact}
          initialData={contactModalDefaults}
          title={contactModalTitle}
        />
      )}

      {selectedContact && (
        <ContactDetailSheet
          contact={selectedContact}
          touchpoints={selectedTouchpoints}
          onClose={() => {
            setSelectedContact(null);
            setSelectedTouchpoints([]);
          }}
          onLogTouchpoint={handleLogTouchpoint}
        />
      )}
    </div>
  );
}
