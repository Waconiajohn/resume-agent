import { useState } from 'react';
import { X, Mail, Phone, Linkedin, MessageSquare, Clock, User } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { cn } from '@/lib/utils';
import type { NetworkingContact, Touchpoint } from '@/hooks/useNetworkingContacts';

const TOUCHPOINT_TYPES = [
  { value: 'call', label: 'Phone Call' },
  { value: 'email', label: 'Email' },
  { value: 'inmail', label: 'LinkedIn InMail' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'event', label: 'Event' },
  { value: 'other', label: 'Other' },
];

const TOUCHPOINT_ICONS: Record<string, React.ReactNode> = {
  call: <Phone size={11} />,
  email: <Mail size={11} />,
  inmail: <Linkedin size={11} />,
  meeting: <User size={11} />,
  event: <MessageSquare size={11} />,
  other: <MessageSquare size={11} />,
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

interface ContactDetailSheetProps {
  contact: NetworkingContact;
  touchpoints: Touchpoint[];
  onClose: () => void;
  onLogTouchpoint: (type: string, notes?: string) => Promise<void>;
}

export function ContactDetailSheet({
  contact,
  touchpoints,
  onClose,
  onLogTouchpoint,
}: ContactDetailSheetProps) {
  const [logType, setLogType] = useState('email');
  const [logNotes, setLogNotes] = useState('');
  const [logging, setLogging] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);

  const handleLogTouchpoint = async () => {
    setLogging(true);
    setLogError(null);
    try {
      await onLogTouchpoint(logType, logNotes.trim() || undefined);
      setLogNotes('');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setLogError(message);
    } finally {
      setLogging(false);
    }
  };

  const inputClass =
    'w-full rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-2 text-[13px] text-[var(--text-strong)] placeholder:text-[var(--text-soft)] focus:border-[#98b3ff]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <GlassCard
        role="dialog"
        aria-modal="true"
        aria-label={contact.name}
        className="relative w-full max-w-xl p-6 z-10 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-[15px] font-semibold text-[var(--text-strong)]">{contact.name}</h2>
            {contact.title && (
              <p className="text-[12px] text-[var(--text-soft)]">{contact.title}</p>
            )}
            {contact.company && (
              <p className="text-[12px] text-[var(--text-soft)]">{contact.company}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--text-soft)] hover:text-white/60 transition-colors ml-4 flex-shrink-0"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Contact details */}
        <div className="space-y-2 mb-5">
          {contact.email && (
            <div className="flex items-center gap-2 text-[12px] text-[var(--text-soft)]">
              <Mail size={12} className="text-[var(--text-soft)] flex-shrink-0" />
              <a
                href={`mailto:${contact.email}`}
                className="hover:text-[var(--text-muted)] transition-colors truncate"
              >
                {contact.email}
              </a>
            </div>
          )}
          {contact.phone && (
            <div className="flex items-center gap-2 text-[12px] text-[var(--text-soft)]">
              <Phone size={12} className="text-[var(--text-soft)] flex-shrink-0" />
              <span>{contact.phone}</span>
            </div>
          )}
          {contact.linkedin_url && (
            <div className="flex items-center gap-2 text-[12px] text-[var(--text-soft)]">
              <Linkedin size={12} className="text-[var(--text-soft)] flex-shrink-0" />
              <a
                href={contact.linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[var(--text-muted)] transition-colors truncate"
              >
                {contact.linkedin_url}
              </a>
            </div>
          )}
          {contact.last_contact_date && (
            <div className="flex items-center gap-2 text-[12px] text-[var(--text-soft)]">
              <Clock size={12} className="text-[var(--text-soft)] flex-shrink-0" />
              <span>Last contact: {formatDate(contact.last_contact_date)}</span>
            </div>
          )}
        </div>

        {/* Relationship info */}
        <div className="flex flex-wrap gap-2 mb-5">
          <span className="rounded-md bg-[#98b3ff]/10 px-2.5 py-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#98b3ff]">
            {contact.relationship_type.replace('_', ' ')}
          </span>
          <span className="rounded-md border border-[var(--line-soft)] px-2.5 py-1 text-[12px] font-medium text-[var(--text-soft)]">
            Strength: {contact.relationship_strength}/5
          </span>
          {contact.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-md border border-[var(--line-soft)] px-2.5 py-1 text-[12px] font-medium text-[var(--text-soft)]"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Notes */}
        {contact.notes && (
          <div className="mb-5 rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3">
            <p className="text-[12px] text-[var(--text-soft)] leading-relaxed">{contact.notes}</p>
          </div>
        )}

        {/* Log touchpoint */}
        <div className="mb-5">
          <h3 className="text-[13px] font-medium text-[var(--text-soft)] mb-3">Log Interaction</h3>
          <div className="flex items-center gap-2 mb-2">
            <select
              value={logType}
              onChange={(e) => setLogType(e.target.value)}
              className={cn(inputClass, 'appearance-none flex-1')}
            >
              {TOUCHPOINT_TYPES.map((t) => (
                <option key={t.value} value={t.value} className="bg-[#1a1a2e]">
                  {t.label}
                </option>
              ))}
            </select>
            <GlassButton onClick={handleLogTouchpoint} disabled={logging}>
              {logging ? 'Logging...' : 'Log'}
            </GlassButton>
          </div>
          <textarea
            placeholder="Optional notes..."
            value={logNotes}
            onChange={(e) => setLogNotes(e.target.value)}
            rows={2}
            className={cn(inputClass, 'resize-none')}
          />
          {logError && <p className="mt-1.5 text-[13px] text-red-400">{logError}</p>}
        </div>

        {/* Touchpoint timeline */}
        {touchpoints.length > 0 && (
          <div>
            <h3 className="text-[13px] font-medium text-[var(--text-soft)] mb-3">Interaction History</h3>
            <div className="space-y-2">
              {touchpoints.map((tp) => (
                <div
                  key={tp.id}
                  className="flex items-start gap-3 rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-2.5"
                >
                  <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md bg-[var(--accent-muted)] text-[var(--text-soft)]">
                    {TOUCHPOINT_ICONS[tp.type] ?? <MessageSquare size={11} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-medium text-[var(--text-soft)] capitalize">
                        {tp.type}
                      </span>
                      <span className="text-[12px] text-[var(--text-soft)]">
                        {formatDate(tp.created_at)}
                      </span>
                    </div>
                    {tp.notes && (
                      <p className="text-[13px] text-[var(--text-soft)] mt-0.5">{tp.notes}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {touchpoints.length === 0 && (
          <p className="text-[12px] text-[var(--text-soft)] text-center py-3">No interactions logged yet.</p>
        )}
      </GlassCard>
    </div>
  );
}
