import { useNavigate } from 'react-router-dom';
import { FileText, Search, MessageSquare } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { LiveResume } from './LiveResume';
import { cn } from '@/lib/utils';
import type { CareerIQProfile, LiveResumeState } from '@/types/discovery';

interface CareerIQProfileScreenProps {
  profile: CareerIQProfile;
  resume: LiveResumeState;
  jobText?: string;
}

export function CareerIQProfileScreen({ profile, resume, jobText }: CareerIQProfileScreenProps) {
  const navigate = useNavigate();

  return (
    <div className="flex h-full gap-0">
      {/* Left — profile */}
      <div className="flex w-[55%] flex-col overflow-y-auto px-10 py-10">
        <p
          className="mb-2 text-xs font-bold uppercase tracking-widest text-[var(--text-soft)]"
        >
          Your CareerIQ Profile
        </p>
        <h1
          className="mb-8 text-2xl font-semibold leading-tight text-[var(--text-strong)]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Here is who you are.
        </h1>

        {/* Positioning statement */}
        <ProfileSection label="Your Career Thread">
          <p className="text-lg leading-relaxed text-[var(--text-strong)]" style={{ fontFamily: 'var(--font-display)' }}>
            {profile.positioning?.positioning_statement}
          </p>
        </ProfileSection>

        {/* Core strengths */}
        <ProfileSection label="Where You Are Exceptional">
          <div className="space-y-4">
            {(profile.positioning?.core_strengths ?? []).map((strength, idx) => (
              <div key={idx} className="rounded-xl border border-[var(--line-soft)] bg-[var(--surface-2)] p-4">
                <p className="font-semibold text-[var(--text-strong)]">{strength}</p>
              </div>
            ))}
          </div>
        </ProfileSection>

        {/* Differentiators */}
        <ProfileSection label="What You Bring To This Role">
          <div className="space-y-4">
            {(profile.positioning?.differentiators ?? []).map((d, idx) => (
              <div key={idx} className="rounded-xl border border-[var(--line-soft)] bg-[var(--surface-2)] p-4">
                <p className="font-semibold text-[var(--text-strong)]">{d}</p>
              </div>
            ))}
          </div>
        </ProfileSection>

        {/* Why not me — single text block */}
        {profile.narrative?.why_not_me && (
          <ProfileSection label="What A Hiring Manager Might Worry About">
            <div className="rounded-xl border border-[var(--badge-amber-bg)] bg-[var(--badge-amber-bg)] p-4">
              <p className="text-sm text-[var(--text-muted)]">{profile.narrative.why_not_me}</p>
            </div>
          </ProfileSection>
        )}

        {/* Path forward */}
        <div className="mt-8">
          <p className="mb-4 text-xs font-bold uppercase tracking-widest text-[var(--text-soft)]">
            Your next move
          </p>
          <div className="grid grid-cols-1 gap-3">
            <PathCard
              icon={<FileText className="h-5 w-5" />}
              title="Build the full resume for this job"
              description="Turn this profile into a role-specific resume that positions you as the benchmark candidate."
              onClick={() => navigate('/resume-builder/session', {
                state: { fromDiscovery: true, jobDescription: jobText },
              })}
            />
            <PathCard
              icon={<Search className="h-5 w-5" />}
              title="Find more jobs that fit this profile"
              description="Discover roles where you are already the benchmark candidate."
              onClick={() => navigate('/workspace?room=jobs')}
            />
            <PathCard
              icon={<MessageSquare className="h-5 w-5" />}
              title="Prepare for the interview"
              description="Practice with an AI interviewer who knows this role inside and out."
              onClick={() => navigate('/workspace?room=interview', {
                state: { fromDiscovery: true, jobDescription: jobText },
              })}
            />
          </div>
        </div>
      </div>

      {/* Right — final resume */}
      <div className="flex w-[45%] flex-col border-l border-[var(--line-soft)] px-8 py-10">
        <p className="mb-4 text-xs font-bold uppercase tracking-widest text-[var(--text-soft)]">
          Your updated resume
        </p>
        <div className="flex-1 overflow-hidden">
          <LiveResume resume={resume} highlightedSections={[]} />
        </div>
      </div>
    </div>
  );
}

function ProfileSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <p className="mb-3 text-xs font-bold uppercase tracking-widest text-[var(--text-soft)]">
        {label}
      </p>
      {children}
    </div>
  );
}

interface PathCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}

function PathCard({ icon, title, description, onClick }: PathCardProps) {
  return (
    <GlassCard
      hover
      className={cn(
        'flex cursor-pointer items-start gap-4 px-5 py-4',
        'transition-all duration-200 hover:border-[var(--line-strong)]',
      )}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
    >
      <span className="mt-0.5 shrink-0 text-[var(--link)]">{icon}</span>
      <div>
        <p className="font-semibold text-[var(--text-strong)]">{title}</p>
        <p className="mt-0.5 text-sm text-[var(--text-muted)]">{description}</p>
      </div>
    </GlassCard>
  );
}
