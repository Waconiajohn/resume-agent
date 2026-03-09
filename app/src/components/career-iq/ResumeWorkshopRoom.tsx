import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import {
  FileText,
  Plus,
  Clock,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
interface ResumeSession {
  id: string;
  company_name?: string | null;
  created_at: string;
  pipeline_stage?: string | null;
}

interface SavedResume {
  id: string;
  name?: string;
  is_default?: boolean;
  created_at: string;
}

interface ResumeWorkshopRoomProps {
  sessions: ResumeSession[];
  resumes: SavedResume[];
  loading: boolean;
  onNewSession: () => void;
  onResumeSession: (sessionId: string) => void;
  onNavigate?: (route: string) => void;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function stageLabel(stage?: string | null): { label: string; color: string } {
  switch (stage) {
    case 'complete':
    case 'completed':
      return { label: 'Complete', color: 'text-[#b5dec2]' };
    case 'writing':
    case 'crafting':
      return { label: 'In Progress', color: 'text-[#98b3ff]' };
    case 'reviewing':
    case 'quality_review':
      return { label: 'Reviewing', color: 'text-[#f0d99f]' };
    default:
      return { label: 'In Progress', color: 'text-[#98b3ff]' };
  }
}

export function ResumeWorkshopRoom({ sessions, resumes, loading, onNewSession, onResumeSession, onNavigate }: ResumeWorkshopRoomProps) {
  const recentSessions = sessions.slice(0, 8);
  const defaultResume = resumes.find((r) => r.is_default);

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold text-white/90">Resume Workshop</h1>
          <p className="text-[13px] text-white/40">
            Create targeted resumes powered by your Why-Me story. Each session optimizes your positioning for a specific role.
          </p>
        </div>
        <GlassButton variant="primary" onClick={onNewSession} className="flex-shrink-0">
          <Plus size={16} className="mr-1.5" />
          New Resume
        </GlassButton>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Recent sessions — main area */}
        <div className="flex-[3] min-w-0">
          <GlassCard className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <FileText size={16} className="text-[#98b3ff]" />
              <h3 className="text-[14px] font-semibold text-white/80">Recent Sessions</h3>
              <span className="text-[11px] text-white/30 ml-auto">{sessions.length} total</span>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 animate-pulse">
                    <div className="h-4 bg-white/[0.06] rounded w-2/3 mb-2" />
                    <div className="h-3 bg-white/[0.04] rounded w-1/3" />
                  </div>
                ))}
              </div>
            ) : recentSessions.length === 0 ? (
              <div className="text-center py-8">
                <Sparkles size={24} className="text-[#98b3ff]/40 mx-auto mb-3" />
                <p className="text-[14px] text-white/50 mb-1">No resume sessions yet</p>
                <p className="text-[12px] text-white/30 mb-4">
                  Start your first session to create a targeted resume powered by 3 AI agents.
                </p>
                <GlassButton variant="primary" onClick={onNewSession}>
                  <Plus size={16} className="mr-1.5" />
                  Create Your First Resume
                </GlassButton>
              </div>
            ) : (
              <div className="space-y-2">
                {recentSessions.map((session) => {
                  const stage = stageLabel(session.pipeline_stage);
                  return (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => onResumeSession(session.id)}
                      className="group flex w-full items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-left hover:bg-white/[0.04] hover:border-white/[0.1] transition-all"
                    >
                      <div className="rounded-lg bg-white/[0.05] p-2 flex-shrink-0 group-hover:bg-white/[0.08] transition-colors">
                        <FileText size={16} className="text-white/40 group-hover:text-white/60" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium text-white/70 group-hover:text-white/85 truncate transition-colors">
                          {session.company_name || 'Untitled Session'}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-white/30">
                          <Clock size={10} />
                          <span>{formatRelativeTime(session.created_at)}</span>
                          <span>·</span>
                          <span className={stage.color}>{stage.label}</span>
                        </div>
                      </div>
                      {(session.pipeline_stage === 'complete' || session.pipeline_stage === 'completed') && onNavigate && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onNavigate('cover-letter');
                          }}
                          className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[10px] text-white/40 hover:text-white/60 hover:bg-white/[0.06] transition-colors flex-shrink-0"
                        >
                          <FileText size={10} />
                          Cover Letter
                        </button>
                      )}
                      <ArrowRight size={14} className="text-white/20 group-hover:text-white/50 transition-colors flex-shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}
          </GlassCard>
        </div>

        {/* Sidebar: base resume + tips */}
        <div className="flex-[2] flex flex-col gap-6">
          {/* Base resume status */}
          <GlassCard className="p-5">
            <h3 className="text-[14px] font-semibold text-white/80 mb-3">Your Base Resume</h3>
            {defaultResume ? (
              <div className="flex items-start gap-3">
                <CheckCircle2 size={16} className="text-[#b5dec2] mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-[13px] text-white/60">
                    {defaultResume.name || 'Default Resume'}
                  </div>
                  <div className="text-[11px] text-white/30 mt-0.5">
                    Uploaded {formatRelativeTime(defaultResume.created_at)}
                  </div>
                  <p className="text-[11px] text-white/35 mt-2 leading-relaxed">
                    This is your foundation. Each new session starts from here and tailors your positioning for the target role.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <AlertCircle size={16} className="text-[#f0d99f] mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-[13px] text-white/60">No base resume uploaded</div>
                  <p className="text-[11px] text-white/35 mt-1 leading-relaxed">
                    Upload your current resume when you start a new session. The agents will analyze it alongside your Why-Me story.
                  </p>
                </div>
              </div>
            )}
          </GlassCard>

          {/* How it works */}
          <GlassCard className="p-5">
            <h3 className="text-[14px] font-semibold text-white/80 mb-3">How It Works</h3>
            <div className="space-y-3">
              {[
                { step: '1', label: 'Strategist Agent', desc: 'Analyzes the role and designs your positioning strategy' },
                { step: '2', label: 'Craftsman Agent', desc: 'Writes each section with coaching-level precision' },
                { step: '3', label: 'Producer Agent', desc: 'Verifies ATS compliance and executive formatting' },
              ].map((item) => (
                <div key={item.step} className="flex items-start gap-3">
                  <div className="h-6 w-6 rounded-full bg-[#98b3ff]/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-[11px] font-bold text-[#98b3ff]">{item.step}</span>
                  </div>
                  <div>
                    <div className="text-[12px] font-medium text-white/60">{item.label}</div>
                    <div className="text-[11px] text-white/30 mt-0.5">{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
