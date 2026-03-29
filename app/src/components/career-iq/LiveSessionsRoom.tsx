import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import {
  Clock,
  Star,
  Lock,
  FileText,
  Lightbulb,
  ArrowRight,
  MessageSquare,
  BookOpen,
  Search,
  Headphones,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import React, { useMemo, useState } from 'react';
import { AskCoachForm } from './AskCoachForm';
import { RESOURCE_LIBRARY, RESOURCE_CATEGORIES, type Resource } from '@/data/resource-library';

function OfficeHours() {
  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-2 mb-3">
        <Star size={16} className="text-[#f0d99f]" />
        <h3 className="text-[14px] font-semibold text-[var(--text-strong)]">1:1 Office Hours</h3>
        <span className="ml-auto rounded-full border border-[#f0d99f]/20 bg-[#f0d99f]/[0.06] px-2 py-0.5 text-[12px] font-medium text-[#f0d99f]/70 uppercase tracking-wider">
          Premium
        </span>
      </div>
      <p className="text-[12px] text-[var(--text-soft)] mb-4">
        Book a private 30-minute session with a career coach for personalized guidance on your search strategy.
      </p>
      <GlassButton variant="ghost" className="w-full">
        <Lock size={14} className="mr-1.5 text-[var(--text-soft)]" />
        Upgrade to Book Office Hours
      </GlassButton>
    </GlassCard>
  );
}

// --- Resource Library ---

/**
 * Maps icon_name strings from the resource-library data file to lucide-react
 * components. Falls back to BookOpen for any unrecognized name.
 */
function ResourceIcon({ name, size }: { name: string; size: number }) {
  const iconMap: Record<string, LucideIcon> = {
    FileText,
    Star,
    Lightbulb,
    BookOpen,
    Headphones,
    Search,
    ArrowRight,
    MessageSquare,
  };
  const Icon = iconMap[name] ?? BookOpen;
  return <Icon size={size} className="text-[var(--text-soft)] group-hover:text-[var(--text-soft)]" />;
}

function ResourceLibrary() {
  const [filter, setFilter] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const filtered = useMemo<Resource[]>(() => {
    let result = RESOURCE_LIBRARY;
    if (selectedCategory) {
      result = result.filter((r) => r.category === selectedCategory);
    }
    if (filter.trim()) {
      const q = filter.toLowerCase();
      result = result.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q),
      );
    }
    return result;
  }, [filter, selectedCategory]);

  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <BookOpen size={16} className="text-[#98b3ff]" />
        <h3 className="text-[14px] font-semibold text-[var(--text-strong)]">Resource Library</h3>
        <span className="text-[13px] text-[var(--text-soft)] ml-auto">{RESOURCE_LIBRARY.length} resources</span>
      </div>

      {/* Search */}
      <div className="flex gap-2 mb-4">
        <div className="flex-1 relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-soft)]" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search resources..."
            className="w-full rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] pl-8 pr-3 py-2 text-[13px] text-[var(--text-muted)] placeholder:text-[var(--text-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40 focus:border-[#98b3ff]/30"
          />
        </div>
      </div>

      {/* Category pills */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        <button
          type="button"
          onClick={() => setSelectedCategory(null)}
          className={cn(
            'rounded-lg px-2.5 py-1 text-[13px] font-medium transition-colors',
            !selectedCategory
              ? 'bg-[#98b3ff]/15 text-[#98b3ff] border border-[#98b3ff]/20'
              : 'bg-[var(--accent-muted)] text-[var(--text-soft)] border border-[var(--line-soft)] hover:text-[var(--text-soft)]',
          )}
        >
          All
        </button>
        {RESOURCE_CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
            className={cn(
              'rounded-lg px-2.5 py-1 text-[13px] font-medium transition-colors',
              selectedCategory === cat
                ? 'bg-[#98b3ff]/15 text-[#98b3ff] border border-[#98b3ff]/20'
                : 'bg-[var(--accent-muted)] text-[var(--text-soft)] border border-[var(--line-soft)] hover:text-[var(--text-soft)]',
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Resource list */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="text-center py-6 text-[13px] text-[var(--text-soft)]">
            No resources match your search.
          </div>
        )}
        {filtered.map((resource) => (
          <div
            key={resource.id}
            className="group flex items-start gap-3 rounded-xl px-3 py-3 hover:bg-[var(--accent-muted)] transition-colors cursor-pointer"
          >
            <div className="rounded-lg bg-[var(--accent-muted)] p-2 flex-shrink-0 group-hover:bg-[var(--surface-1)] transition-colors">
              <ResourceIcon name={resource.icon_name} size={14} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium text-[var(--text-muted)] group-hover:text-[var(--text-strong)] transition-colors">
                {resource.title}
              </div>
              <div className="text-[13px] text-[var(--text-soft)] mt-1 leading-relaxed line-clamp-2">
                {resource.description}
              </div>
              <div className="flex items-center gap-2 mt-1.5 text-[12px] text-[var(--text-soft)]">
                <span className="rounded-full border border-[var(--line-soft)] px-2 py-0.5">
                  {resource.category}
                </span>
                <span className="capitalize">{resource.content_type}</span>
                <span>
                  <Clock size={9} className="inline mr-0.5" />
                  {resource.read_time}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

// --- Main component ---

export function LiveSessionsRoom() {
  return (
    <div className="flex flex-col gap-6 p-6 max-w-[1400px] mx-auto">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-[var(--text-strong)]">Expert Guidance</h1>
        <p className="text-[13px] text-[var(--text-soft)]">
          Use the coach, browse the resource library, and book deeper support when you need more than self-serve tools.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-[3] min-w-0">
          <ResourceLibrary />
        </div>
        <div className="flex-[2] min-w-0">
          <div className="flex flex-col gap-6">
            <AskCoachForm />
            <OfficeHours />
          </div>
        </div>
      </div>
    </div>
  );
}
