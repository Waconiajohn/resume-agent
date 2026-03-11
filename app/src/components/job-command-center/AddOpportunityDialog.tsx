import { useState } from 'react';
import type { MouseEvent } from 'react';
import { GlassButton } from '@/components/GlassButton';
import { X } from 'lucide-react';

interface AddOpportunityDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    role_title: string;
    company_name: string;
    source?: string;
    url?: string;
    notes?: string;
  }) => void;
}

export function AddOpportunityDialog({ open, onClose, onSubmit }: AddOpportunityDialogProps) {
  const [roleTitle, setRoleTitle] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [source, setSource] = useState('manual');
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');

  if (!open) return null;

  const canSubmit = roleTitle.trim().length > 0 && companyName.trim().length > 0;

  function handleSubmit() {
    if (!canSubmit) return;
    onSubmit({
      role_title: roleTitle.trim(),
      company_name: companyName.trim(),
      source: source || 'manual',
      url: url.trim() || undefined,
      notes: notes.trim() || undefined,
    });
    setRoleTitle('');
    setCompanyName('');
    setSource('manual');
    setUrl('');
    setNotes('');
    onClose();
  }

  const handleBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add opportunity"
        className="relative w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#0e0e14] p-6 shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-white/30 hover:text-white/60 transition-colors"
        >
          <X size={18} />
        </button>

        <h2 className="text-[16px] font-semibold text-white/85 mb-4">Add Application</h2>

        <div className="space-y-3">
          <div>
            <label className="text-[11px] text-white/40 uppercase tracking-wider mb-1 block">
              Role Title *
            </label>
            <input
              value={roleTitle}
              onChange={(e) => setRoleTitle(e.target.value)}
              placeholder="e.g. VP Operations"
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] text-white/70 placeholder:text-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40 focus:border-[#98b3ff]/30"
            />
          </div>
          <div>
            <label className="text-[11px] text-white/40 uppercase tracking-wider mb-1 block">
              Company *
            </label>
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g. Acme Corp"
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] text-white/70 placeholder:text-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40 focus:border-[#98b3ff]/30"
            />
          </div>
          <div>
            <label className="text-[11px] text-white/40 uppercase tracking-wider mb-1 block">
              Source
            </label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] text-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40 focus:border-[#98b3ff]/30"
            >
              <option value="manual">Manual</option>
              <option value="linkedin">LinkedIn</option>
              <option value="indeed">Indeed</option>
              <option value="referral">Referral</option>
              <option value="job_finder">Job Finder</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] text-white/40 uppercase tracking-wider mb-1 block">
              Job URL
            </label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] text-white/70 placeholder:text-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40 focus:border-[#98b3ff]/30"
            />
          </div>
          <div>
            <label className="text-[11px] text-white/40 uppercase tracking-wider mb-1 block">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes about this role..."
              rows={2}
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] text-white/70 placeholder:text-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40 focus:border-[#98b3ff]/30 resize-y"
            />
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <GlassButton onClick={handleSubmit} disabled={!canSubmit} className="flex-1">
            Add to Pipeline
          </GlassButton>
          <GlassButton onClick={onClose}>Cancel</GlassButton>
        </div>
      </div>
    </div>
  );
}
