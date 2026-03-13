import { GlassCard } from '@/components/GlassCard';
import { Calendar, ExternalLink } from 'lucide-react';

interface ScheduleSession {
  day: string;
  time: string;
  topic: string;
  signupUrl: string;
}

const WEEKLY_SCHEDULE: ScheduleSession[] = [
  { day: 'Tuesday', time: '11:00 AM ET', topic: 'Resume & Positioning Workshop', signupUrl: '#' },
  { day: 'Wednesday', time: '11:00 AM ET', topic: 'Interview Confidence Clinic', signupUrl: '#' },
  { day: 'Friday', time: '11:00 AM ET', topic: 'Job Search & Networking Strategy', signupUrl: '#' },
];

export function WeeklyScheduleStrip() {
  return (
    <GlassCard className="px-5 py-4">
      <div className="flex items-center gap-2 mb-3">
        <Calendar size={14} className="text-[#98b3ff]" />
        <h3 className="text-[13px] font-semibold text-white/75">Weekly Live Sessions</h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {WEEKLY_SCHEDULE.map((session) => (
          <div
            key={session.day}
            className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 flex flex-col gap-1"
          >
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold text-white/70">{session.day}</span>
              <span className="text-[10px] text-white/35">{session.time}</span>
            </div>
            <span className="text-[12px] text-white/55 leading-snug">{session.topic}</span>
            <a
              href={session.signupUrl}
              className="mt-1 flex items-center gap-1 text-[11px] text-[#98b3ff]/70 hover:text-[#98b3ff] transition-colors w-fit"
            >
              Sign up <ExternalLink size={10} />
            </a>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
