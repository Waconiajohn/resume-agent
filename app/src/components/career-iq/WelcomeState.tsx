import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { Sparkles, ArrowRight, Lock, FileText, Search, MessageSquare } from 'lucide-react';

interface WelcomeStateProps {
  userName: string;
  onStartWhyMe: () => void;
}

export function WelcomeState({ userName, onStartWhyMe }: WelcomeStateProps) {
  const firstName = userName?.split('@')[0]?.split('.')[0] ?? 'there';
  const displayName = firstName.charAt(0).toUpperCase() + firstName.slice(1);

  const steps = [
    { number: '1', label: 'Define Your Story', desc: 'Three coaching questions that unlock your positioning power', icon: MessageSquare, active: true },
    { number: '2', label: 'Build Your First Resume', desc: '3 AI agents craft a resume that positions you as the benchmark', icon: FileText, active: false },
    { number: '3', label: 'Start Your Search', desc: 'Smart matching, networking, and interview prep — all from your story', icon: Search, active: false },
  ];

  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl mx-auto">
      {/* Welcome hero */}
      <GlassCard className="p-8 text-center">
        <div className="flex justify-center mb-4">
          <div className="rounded-2xl bg-[#98b3ff]/10 p-4">
            <Sparkles size={28} className="text-[#98b3ff]" />
          </div>
        </div>

        <h1 className="text-2xl font-semibold text-white/90 mb-2">
          Welcome, {displayName}
        </h1>
        <p className="text-[15px] text-white/55 leading-relaxed max-w-lg mx-auto mb-6">
          Before your agents can go to work, they need to understand what makes you exceptional.
          Three steps to a career platform that works as hard as you do.
        </p>

        <GlassButton variant="primary" size="lg" onClick={onStartWhyMe} className="px-6">
          Define Your Why-Me Story
          <ArrowRight size={18} className="ml-2" />
        </GlassButton>

        <p className="mt-4 text-[12px] text-white/50">
          Takes about 5 minutes — and you can refine it anytime
        </p>
      </GlassCard>

      {/* 3-step path */}
      <div className="flex flex-col gap-3">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <div
              key={step.number}
              className={`rounded-xl border p-4 flex items-center gap-4 transition-all ${
                step.active
                  ? 'border-[#98b3ff]/20 bg-[#98b3ff]/[0.04]'
                  : 'border-white/[0.06] bg-white/[0.02] opacity-50'
              }`}
            >
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                step.active ? 'bg-[#98b3ff]/15' : 'bg-white/[0.04]'
              }`}>
                {step.active ? (
                  <Icon size={18} className="text-[#98b3ff]" />
                ) : (
                  <Lock size={14} className="text-white/20" />
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-bold tabular-nums ${step.active ? 'text-[#98b3ff]' : 'text-white/40'}`}>
                    STEP {step.number}
                  </span>
                  <span className={`text-[13px] font-medium ${step.active ? 'text-white/75' : 'text-white/40'}`}>
                    {step.label}
                  </span>
                </div>
                <div className={`text-[12px] mt-0.5 ${step.active ? 'text-white/45' : 'text-white/40'}`}>
                  {step.desc}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
