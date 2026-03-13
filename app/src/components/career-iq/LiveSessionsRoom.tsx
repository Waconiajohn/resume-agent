import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import {
  Calendar,
  MessageSquare,
  Play,
  Clock,
  Send,
  Star,
  Video,
  Lock,
  FileText,
  Lightbulb,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  BookOpen,
  Search,
  Headphones,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import React, { useState, useMemo } from 'react';
import { AskCoachForm } from './AskCoachForm';
import { RESOURCE_LIBRARY, RESOURCE_CATEGORIES, type Resource } from '@/data/resource-library';

// --- Mock data ---

interface ScheduledSession {
  id: string;
  day: string;
  time: string;
  title: string;
  host: string;
  topic: string;
  isLive: boolean;
  isPast: boolean;
}

interface Replay {
  id: string;
  title: string;
  host: string;
  date: string;
  duration: string;
  relevance: string;
  summary?: SessionSummaryData;
}

interface SessionSummaryData {
  keyPoints: string[];
  topQuestion: string;
  actionItem: { text: string; room: string };
}

const WEEK_SCHEDULE: ScheduledSession[] = [
  { id: '1', day: 'Mon', time: '11:00 AM', title: 'Why-Me Story Workshop', host: 'Sarah Chen', topic: 'why-me', isLive: false, isPast: true },
  { id: '2', day: 'Tue', time: '2:00 PM', title: 'LinkedIn Headline Masterclass', host: 'Marcus Rivera', topic: 'linkedin', isLive: false, isPast: true },
  { id: '3', day: 'Wed', time: '11:00 AM', title: 'Interview Confidence for Executives', host: 'Dr. Amy Walsh', topic: 'interview', isLive: true, isPast: false },
  { id: '4', day: 'Thu', time: '3:00 PM', title: 'Networking Without the Cringe', host: 'James Okafor', topic: 'networking', isLive: false, isPast: false },
  { id: '5', day: 'Fri', time: '10:00 AM', title: 'Resume Positioning Deep-Dive', host: 'Sarah Chen', topic: 'resume', isLive: false, isPast: false },
];

const REPLAYS: Replay[] = [
  {
    id: 'r1',
    title: 'Why-Me Story Workshop — Week 9',
    host: 'Sarah Chen',
    date: 'Feb 24',
    duration: '47 min',
    relevance: 'Because you\'re refining your Why-Me story',
    summary: {
      keyPoints: [
        'Your Why-Me story should be speakable in 30 seconds — if you can\'t say it out loud, it\'s not ready.',
        'The "Why-Not-Me" is just as powerful as the "Why-Me" — it sharpens your targeting and saves you from bad-fit applications.',
        'Colleagues-came-to-you-for is the most underused signal — it reveals what you\'re actually known for, not what your title says.',
      ],
      topQuestion: 'How do I write a Why-Me story when I\'ve done so many different things across my career?',
      actionItem: { text: 'Review your Why-Me story and check if Clarity is green — if not, focus on the first prompt.', room: 'dashboard' },
    },
  },
  {
    id: 'r2',
    title: 'LinkedIn Profile Optimization',
    host: 'Marcus Rivera',
    date: 'Feb 21',
    duration: '52 min',
    relevance: 'Because you\'re working on LinkedIn',
    summary: {
      keyPoints: [
        'Your headline is the single highest-leverage element — it appears in search results, connection requests, and comments.',
        'Replace your job title with your Why-Me statement. "VP of Operations" says nothing. "I turn around underperforming supply chains" says everything.',
        'Post consistently for 30 days before expecting results — the algorithm rewards consistency over quality.',
      ],
      topQuestion: 'Should I mention that I\'m looking for a new role on my profile?',
      actionItem: { text: 'Your LinkedIn Agent suggests updating your headline to reflect your Why-Me story.', room: 'linkedin' },
    },
  },
  {
    id: 'r3',
    title: 'Salary Negotiation Tactics',
    host: 'Patricia Dunn',
    date: 'Feb 19',
    duration: '38 min',
    relevance: 'Recommended for your pipeline stage',
    summary: {
      keyPoints: [
        'Never give a number first — anchor the conversation around the value you deliver, not your salary history.',
        'Total compensation matters more than base salary — equity, bonuses, benefits, and flexibility all have dollar values.',
        'Practice the uncomfortable silence after stating your range — most people negotiate against themselves by filling the gap.',
      ],
      topQuestion: 'How do I handle the salary question on online applications that require a number?',
      actionItem: { text: 'Review your pipeline — any roles in "Offer" stage could benefit from these negotiation tactics.', room: 'jobs' },
    },
  },
];

// --- Components ---

function WeeklySchedule() {
  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <Calendar size={16} className="text-[#98b3ff]" />
        <h3 className="text-[14px] font-semibold text-white/80">This Week's Sessions</h3>
        <span className="ml-auto text-[10px] text-white/20 italic">sample schedule</span>
      </div>
      <div className="space-y-1">
        {WEEK_SCHEDULE.map((session) => (
          <div
            key={session.id}
            className={cn(
              'flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors',
              session.isLive
                ? 'bg-red-400/[0.08] border border-red-400/15'
                : session.isPast
                  ? 'opacity-40'
                  : 'hover:bg-white/[0.03]',
            )}
          >
            {/* Day/time */}
            <div className="w-[72px] flex-shrink-0">
              <div className="text-[12px] font-semibold text-white/50">{session.day}</div>
              <div className="text-[11px] text-white/30">{session.time}</div>
            </div>

            {/* Title & host */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium text-white/70 truncate">
                  {session.title}
                </span>
                {session.isLive && (
                  <span className="flex items-center gap-1 text-[10px] font-semibold text-red-400 uppercase tracking-wider">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" style={{ animationDuration: '2s' }} />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-400" />
                    </span>
                    Live
                  </span>
                )}
              </div>
              <div className="text-[11px] text-white/30 mt-0.5">with {session.host}</div>
            </div>

            {/* Action */}
            <div className="flex-shrink-0">
              {session.isLive ? (
                <button
                  type="button"
                  className="rounded-lg bg-red-400/15 border border-red-400/20 px-3 py-1 text-[11px] font-medium text-red-300 hover:bg-red-400/25 transition-colors"
                >
                  Join
                </button>
              ) : session.isPast ? (
                <button
                  type="button"
                  className="flex items-center gap-1 text-[11px] text-white/30 hover:text-white/50 transition-colors"
                >
                  <Play size={11} />
                  Replay
                </button>
              ) : (
                <button
                  type="button"
                  className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-[11px] font-medium text-white/40 hover:text-white/60 hover:bg-white/[0.06] transition-colors"
                >
                  Remind me
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

function AskBeforeSession() {
  const [question, setQuestion] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const nextFutureSession = WEEK_SCHEDULE.find((s) => !s.isPast && !s.isLive);

  const handleSubmit = () => {
    if (question.trim()) {
      setSubmitted(true);
      setQuestion('');
    }
  };

  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare size={16} className="text-[#98b3ff]" />
        <h3 className="text-[14px] font-semibold text-white/80">Ask Before the Session</h3>
      </div>
      <p className="text-[12px] text-white/40 mb-3">
        Submit a question for <span className="text-white/60">{nextFutureSession?.title ?? 'the next session'}</span> — the host will address top questions live.
      </p>
      {submitted ? (
        <div className="rounded-xl border border-[#b5dec2]/20 bg-[#b5dec2]/[0.06] px-4 py-3 text-[13px] text-[#b5dec2]/80">
          Question submitted! You'll be notified if it's selected.
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="What would you like the host to cover?"
            className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] text-white/70 placeholder:text-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40 focus:border-[#98b3ff]/30"
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!question.trim()}
            className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-white/40 hover:text-white/60 hover:bg-white/[0.07] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Send size={14} />
          </button>
        </div>
      )}
    </GlassCard>
  );
}

function ReplayCard({ replay }: { replay: Replay }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      <div
        className="group flex items-start gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors cursor-pointer"
        onClick={() => replay.summary && setExpanded(!expanded)}
      >
        <div className="rounded-lg bg-white/[0.05] p-2 flex-shrink-0 group-hover:bg-white/[0.08] transition-colors">
          <Video size={16} className="text-white/40 group-hover:text-white/60" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-white/70 group-hover:text-white/85 transition-colors">
            {replay.title}
          </div>
          <div className="flex items-center gap-2 mt-1 text-[11px] text-white/30">
            <span>{replay.host}</span>
            <span>·</span>
            <span>{replay.date}</span>
            <span>·</span>
            <Clock size={10} />
            <span>{replay.duration}</span>
          </div>
          <div className="mt-1.5 text-[11px] text-[#98b3ff]/50 italic">
            {replay.relevance}
          </div>
        </div>
        {replay.summary && (
          <button type="button" className="text-white/25 hover:text-white/50 transition-colors mt-1 flex-shrink-0">
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        )}
      </div>

      {/* Expandable summary */}
      {expanded && replay.summary && (
        <div className="border-t border-white/[0.06] px-4 py-4 space-y-4">
          {/* Key takeaways */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Lightbulb size={12} className="text-[#f0d99f]" />
              <span className="text-[11px] font-medium text-white/45 uppercase tracking-wider">Key Takeaways</span>
            </div>
            <ul className="space-y-2">
              {replay.summary.keyPoints.map((point, i) => (
                <li key={i} className="text-[12px] text-white/50 leading-relaxed pl-4 relative before:absolute before:left-0 before:top-[7px] before:h-1 before:w-1 before:rounded-full before:bg-white/20">
                  {point}
                </li>
              ))}
            </ul>
          </div>

          {/* Top question */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <HelpCircle size={12} className="text-[#98b3ff]" />
              <span className="text-[11px] font-medium text-white/45 uppercase tracking-wider">Top Question Asked</span>
            </div>
            <p className="text-[12px] text-white/50 italic leading-relaxed">
              "{replay.summary.topQuestion}"
            </p>
          </div>

          {/* Action item */}
          <div className="rounded-lg border border-[#98b3ff]/15 bg-[#98b3ff]/[0.04] px-3 py-2.5 flex items-center gap-2">
            <ArrowRight size={12} className="text-[#98b3ff] flex-shrink-0" />
            <span className="text-[12px] text-[#98b3ff]/70">
              {replay.summary.actionItem.text}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function ReplayLibrary() {
  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <Play size={16} className="text-[#98b3ff]" />
        <h3 className="text-[14px] font-semibold text-white/80">Replay Library</h3>
        <span className="text-[11px] text-white/20 ml-auto italic">sample content</span>
      </div>
      <div className="space-y-3">
        {REPLAYS.map((replay) => (
          <ReplayCard key={replay.id} replay={replay} />
        ))}
      </div>
    </GlassCard>
  );
}

function LatestSessionSummary() {
  const latestWithSummary = REPLAYS.find((r) => r.summary);
  if (!latestWithSummary?.summary) return null;

  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <FileText size={16} className="text-[#98b3ff]" />
        <h3 className="text-[14px] font-semibold text-white/80">Latest Session Summary</h3>
      </div>
      <div className="mb-3">
        <div className="text-[13px] font-medium text-white/70">{latestWithSummary.title}</div>
        <div className="text-[11px] text-white/30 mt-0.5">
          {latestWithSummary.host} · {latestWithSummary.date}
        </div>
      </div>
      <div className="space-y-2 mb-4">
        {latestWithSummary.summary.keyPoints.slice(0, 2).map((point, i) => (
          <div key={i} className="flex items-start gap-2">
            <Lightbulb size={11} className="text-[#f0d99f] mt-0.5 flex-shrink-0" />
            <span className="text-[12px] text-white/50 leading-relaxed">{point}</span>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-[#98b3ff]/15 bg-[#98b3ff]/[0.04] px-3 py-2.5 flex items-center gap-2">
        <ArrowRight size={12} className="text-[#98b3ff] flex-shrink-0" />
        <span className="text-[12px] text-[#98b3ff]/70">
          {latestWithSummary.summary.actionItem.text}
        </span>
      </div>
    </GlassCard>
  );
}

function OfficeHours() {
  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-2 mb-3">
        <Star size={16} className="text-[#f0d99f]" />
        <h3 className="text-[14px] font-semibold text-white/80">1:1 Office Hours</h3>
        <span className="ml-auto rounded-full border border-[#f0d99f]/20 bg-[#f0d99f]/[0.06] px-2 py-0.5 text-[10px] font-medium text-[#f0d99f]/70 uppercase tracking-wider">
          Premium
        </span>
      </div>
      <p className="text-[12px] text-white/40 mb-4">
        Book a private 30-minute session with a career coach for personalized guidance on your search strategy.
      </p>
      <GlassButton variant="ghost" className="w-full">
        <Lock size={14} className="mr-1.5 text-white/30" />
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
  return <Icon size={size} className="text-white/40 group-hover:text-white/60" />;
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
        <h3 className="text-[14px] font-semibold text-white/80">Resource Library</h3>
        <span className="text-[11px] text-white/30 ml-auto">{RESOURCE_LIBRARY.length} resources</span>
      </div>

      {/* Search */}
      <div className="flex gap-2 mb-4">
        <div className="flex-1 relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search resources..."
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] pl-8 pr-3 py-2 text-[13px] text-white/70 placeholder:text-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/40 focus:border-[#98b3ff]/30"
          />
        </div>
      </div>

      {/* Category pills */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        <button
          type="button"
          onClick={() => setSelectedCategory(null)}
          className={cn(
            'rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors',
            !selectedCategory
              ? 'bg-[#98b3ff]/15 text-[#98b3ff] border border-[#98b3ff]/20'
              : 'bg-white/[0.03] text-white/40 border border-white/[0.06] hover:text-white/60',
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
              'rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors',
              selectedCategory === cat
                ? 'bg-[#98b3ff]/15 text-[#98b3ff] border border-[#98b3ff]/20'
                : 'bg-white/[0.03] text-white/40 border border-white/[0.06] hover:text-white/60',
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Resource list */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="text-center py-6 text-[13px] text-white/30">
            No resources match your search.
          </div>
        )}
        {filtered.map((resource) => (
          <div
            key={resource.id}
            className="group flex items-start gap-3 rounded-xl px-3 py-3 hover:bg-white/[0.03] transition-colors cursor-pointer"
          >
            <div className="rounded-lg bg-white/[0.05] p-2 flex-shrink-0 group-hover:bg-white/[0.08] transition-colors">
              <ResourceIcon name={resource.icon_name} size={14} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium text-white/70 group-hover:text-white/85 transition-colors">
                {resource.title}
              </div>
              <div className="text-[11px] text-white/35 mt-1 leading-relaxed line-clamp-2">
                {resource.description}
              </div>
              <div className="flex items-center gap-2 mt-1.5 text-[10px] text-white/25">
                <span className="rounded-full border border-white/[0.08] px-2 py-0.5">
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
        <h1 className="text-lg font-semibold text-white/90">Live Sessions</h1>
        <p className="text-[13px] text-white/40">
          Weekly coaching sessions with career experts — live interaction, not pre-recorded videos.
        </p>
      </div>

      {/* Latest session summary — full width, most recent feedback */}
      <LatestSessionSummary />

      {/* Schedule + Ask side-by-side on desktop */}
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-[3] min-w-0">
          <WeeklySchedule />
        </div>
        <div className="flex-[2] flex flex-col gap-6">
          <AskBeforeSession />
          <OfficeHours />
        </div>
      </div>

      {/* Replay library — full width */}
      <ReplayLibrary />

      {/* Resource Library + Ask a Coach side-by-side */}
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-[3] min-w-0">
          <ResourceLibrary />
        </div>
        <div className="flex-[2] min-w-0">
          <AskCoachForm />
        </div>
      </div>
    </div>
  );
}
