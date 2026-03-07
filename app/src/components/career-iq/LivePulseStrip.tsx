import { cn } from '@/lib/utils';
import { Radio, Clock, ArrowRight } from 'lucide-react';
import { useState, useEffect } from 'react';

interface SessionInfo {
  title: string;
  host: string;
  startsAt: Date;
  isLive: boolean;
  topic: string;
}

function getNextSession(): SessionInfo {
  const now = new Date();
  const nextHour = new Date(now);
  nextHour.setHours(now.getHours() + 1, 0, 0, 0);

  // Mock: rotate through session topics based on day
  const topics = [
    { title: 'Why-Me Story Workshop', host: 'Sarah Chen', topic: 'why-me' },
    { title: 'LinkedIn Headline Masterclass', host: 'Marcus Rivera', topic: 'linkedin' },
    { title: 'Interview Confidence for Executives', host: 'Dr. Amy Walsh', topic: 'interview' },
    { title: 'Networking Without the Cringe', host: 'James Okafor', topic: 'networking' },
    { title: 'Salary Negotiation Tactics', host: 'Patricia Dunn', topic: 'financial' },
  ];

  const dayIndex = now.getDay() % topics.length;
  const session = topics[dayIndex];

  // Mock: session is "live" if current minutes are 0-30 of any hour
  const isLive = now.getMinutes() < 30;

  return {
    ...session,
    startsAt: isLive ? now : nextHour,
    isLive,
  };
}

function useCountdown(target: Date, isLive: boolean) {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    if (isLive) {
      setTimeLeft('');
      return;
    }

    function update() {
      const diff = target.getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft('Starting soon');
        return;
      }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      if (mins > 59) {
        const hrs = Math.floor(mins / 60);
        const remainMins = mins % 60;
        setTimeLeft(`${hrs}h ${remainMins}m`);
      } else {
        setTimeLeft(`${mins}m ${secs.toString().padStart(2, '0')}s`);
      }
    }

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [target, isLive]);

  return timeLeft;
}

export function LivePulseStrip() {
  const [session] = useState(getNextSession);
  const countdown = useCountdown(session.startsAt, session.isLive);

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.06] bg-white/[0.02]">
      {/* Left: Live indicator or next session */}
      <div className="flex items-center gap-3 min-w-0">
        {session.isLive ? (
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" style={{ animationDuration: '2s' }} />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-400" />
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-red-400">
              Live Now
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-white/30">
            <Radio size={13} />
            <span className="text-[11px] font-medium uppercase tracking-wider">
              Next Session
            </span>
          </div>
        )}

        <span className="text-[13px] text-white/70 truncate font-medium">
          {session.title}
        </span>
        <span className="hidden sm:inline text-[11px] text-white/30">
          with {session.host}
        </span>
      </div>

      {/* Right: Countdown + Join */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {!session.isLive && countdown && (
          <div className="flex items-center gap-1 text-[12px] text-white/40">
            <Clock size={12} />
            <span className="tabular-nums">{countdown}</span>
          </div>
        )}

        <button
          type="button"
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-3 py-1 text-[12px] font-medium transition-all duration-150',
            session.isLive
              ? 'bg-red-400/15 text-red-300 hover:bg-red-400/25 border border-red-400/20'
              : 'bg-white/[0.05] text-white/50 hover:bg-white/[0.08] hover:text-white/70 border border-white/[0.08]',
          )}
        >
          {session.isLive ? 'Join Now' : 'Set Reminder'}
          <ArrowRight size={12} />
        </button>
      </div>
    </div>
  );
}
