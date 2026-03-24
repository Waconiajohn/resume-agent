import { useState } from 'react';
import { X } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { cn } from '@/lib/utils';
import type { CreateContactData } from '@/hooks/useNetworkingContacts';
import { CONTACT_ROLE_LABELS, ALL_ROLES } from '@/hooks/useRuleOfFour';

export type { CreateContactData };

interface ContactFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: CreateContactData) => Promise<void>;
  initialData?: Partial<CreateContactData>;
  title?: string;
}

const RELATIONSHIP_TYPE_OPTIONS = [
  { value: 'recruiter', label: 'Recruiter' },
  { value: 'hiring_manager', label: 'Hiring Manager' },
  { value: 'peer', label: 'Peer' },
  { value: 'referral', label: 'Referral' },
  { value: 'mentor', label: 'Mentor' },
  { value: 'other', label: 'Other' },
];

export function ContactFormModal({
  isOpen,
  onClose,
  onSave,
  initialData = {},
  title = 'Add Contact',
}: ContactFormModalProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(initialData.name ?? '');
  const [contactTitle, setContactTitle] = useState(initialData.title ?? '');
  const [company, setCompany] = useState(initialData.company ?? '');
  const [email, setEmail] = useState(initialData.email ?? '');
  const [linkedinUrl, setLinkedinUrl] = useState(initialData.linkedin_url ?? '');
  const [phone, setPhone] = useState(initialData.phone ?? '');
  const [relationshipType, setRelationshipType] = useState(
    initialData.relationship_type ?? 'other',
  );
  const [contactRole, setContactRole] = useState(initialData.contact_role ?? '');
  const [notes, setNotes] = useState(initialData.notes ?? '');

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const data: CreateContactData = {
        name: name.trim(),
        ...(contactTitle.trim() && { title: contactTitle.trim() }),
        ...(company.trim() && { company: company.trim() }),
        ...(email.trim() && { email: email.trim() }),
        ...(linkedinUrl.trim() && { linkedin_url: linkedinUrl.trim() }),
        ...(phone.trim() && { phone: phone.trim() }),
        relationship_type: relationshipType || 'other',
        ...(contactRole && { contact_role: contactRole }),
        ...(notes.trim() && { notes: notes.trim() }),
        ...(initialData.application_id && { application_id: initialData.application_id }),
      };
      await onSave(data);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'w-full rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-2 text-[13px] text-[var(--text-strong)] placeholder:text-[var(--text-soft)] focus:border-[#98b3ff]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40';
  const labelClass = 'block text-[13px] text-[var(--text-soft)] mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <GlassCard
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-lg p-6 z-10"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[15px] font-semibold text-[var(--text-strong)]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--text-soft)] hover:text-[var(--text-soft)] transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Name *</label>
              <input
                type="text"
                placeholder="Full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                autoFocus
              />
            </div>
            <div>
              <label className={labelClass}>Title</label>
              <input
                type="text"
                placeholder="Job title"
                value={contactTitle}
                onChange={(e) => setContactTitle(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Company</label>
            <input
              type="text"
              placeholder="Company name"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Email</label>
              <input
                type="email"
                placeholder="email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Phone</label>
              <input
                type="tel"
                placeholder="+1 555 000 0000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>LinkedIn URL</label>
            <input
              type="url"
              placeholder="https://linkedin.com/in/..."
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Relationship Type</label>
              <select
                value={relationshipType}
                onChange={(e) => setRelationshipType(e.target.value)}
                className={cn(inputClass, 'appearance-none')}
              >
                {RELATIONSHIP_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value} className="bg-[#1a1a2e]">
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Contact Role</label>
              <select
                value={contactRole}
                onChange={(e) => setContactRole(e.target.value)}
                className={cn(inputClass, 'appearance-none')}
              >
                <option value="" className="bg-[#1a1a2e]">
                  None
                </option>
                {ALL_ROLES.map((role) => (
                  <option key={role} value={role} className="bg-[#1a1a2e]">
                    {CONTACT_ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>Notes</label>
            <textarea
              placeholder="Any notes about this contact..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className={cn(inputClass, 'resize-none')}
            />
          </div>
        </div>

        {error && (
          <p className="mt-3 text-[12px] text-red-400">{error}</p>
        )}

        <div className="flex items-center justify-end gap-3 mt-5">
          <button
            type="button"
            onClick={onClose}
            className="text-[13px] text-[var(--text-soft)] hover:text-[var(--text-soft)] transition-colors"
          >
            Cancel
          </button>
          <GlassButton onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? 'Saving...' : 'Save Contact'}
          </GlassButton>
        </div>
      </GlassCard>
    </div>
  );
}
