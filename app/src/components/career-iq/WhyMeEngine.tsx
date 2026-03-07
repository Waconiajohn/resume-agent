import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { cn } from '@/lib/utils';
import { Sparkles, ChevronRight, ChevronLeft, Check } from 'lucide-react';
import { useState } from 'react';
import type { WhyMeStory, WhyMeSignals, SignalLevel } from './useWhyMeStory';

interface WhyMeEngineProps {
  story: WhyMeStory;
  signals: WhyMeSignals;
  onUpdate: (field: keyof WhyMeStory, value: string) => void;
  onClose?: () => void;
}

interface PromptStep {
  field: keyof WhyMeStory;
  signal: keyof WhyMeSignals;
  title: string;
  question: string;
  context: string;
  placeholder: string;
}

const STEPS: PromptStep[] = [
  {
    field: 'colleaguesCameForWhat',
    signal: 'clarity',
    title: 'Clarity',
    question: 'What did your colleagues come to you for?',
    context:
      'Think about the people you worked with — peers, direct reports, cross-functional partners. What did they specifically seek you out to help with? Not because you were assigned to it, but because they chose you. This reveals your natural superpower — the thing that makes you irreplaceable.',
    placeholder:
      'Example: "People came to me when a complex project was going off the rails. I could walk into chaos, figure out what was actually broken vs. what people thought was broken, and build a plan that got everyone moving in the same direction within 48 hours."',
  },
  {
    field: 'knownForWhat',
    signal: 'alignment',
    title: 'Alignment',
    question: 'What do you want to be known for in your next role?',
    context:
      'Not a job title — a capability, a contribution, a result. What is the thing you do that creates the most value? When someone describes you to a hiring manager, what do you want them to say? This defines the direction every agent aims you toward.',
    placeholder:
      'Example: "I want to be known as the person who transforms underperforming operations into competitive advantages. I take messy, expensive processes and turn them into scalable systems that actually work."',
  },
  {
    field: 'whyNotMe',
    signal: 'differentiation',
    title: 'Differentiation',
    question: 'Why should someone NOT hire you?',
    context:
      'This feels counterintuitive, but defining the Why-Not-Me is one of the most powerful positioning tools we have. The roles, industries, and functions that are a bad fit — naming them sharpens your targeting by contrast. It also builds trust with hiring managers because you\'re not pretending to be everything to everyone.',
    placeholder:
      'Example: "Don\'t hire me if you need someone to maintain the status quo. I\'m not a keep-the-lights-on operator. I\'m the person you bring in when you need to fundamentally change how something works. If you\'re happy with how things run today, I\'m not your person."',
  },
];

function SignalIndicator({ level }: { level: SignalLevel }) {
  const config: Record<SignalLevel, { color: string; label: string }> = {
    green: { color: 'bg-[#b5dec2]', label: 'Strong' },
    yellow: { color: 'bg-[#dfc797]', label: 'Getting there' },
    red: { color: 'bg-white/20', label: 'Not started' },
  };
  const c = config[level];
  return (
    <div className="flex items-center gap-1.5">
      <div className={cn('h-2 w-2 rounded-full transition-colors duration-500', c.color)} />
      <span className="text-[11px] text-white/40">{c.label}</span>
    </div>
  );
}

function StepIndicator({ currentStep, signals }: { currentStep: number; signals: WhyMeSignals }) {
  const signalKeys: (keyof WhyMeSignals)[] = ['clarity', 'alignment', 'differentiation'];
  return (
    <div className="flex items-center gap-3">
      {STEPS.map((step, i) => (
        <div key={step.field} className="flex items-center gap-2">
          <button
            type="button"
            className={cn(
              'h-8 w-8 rounded-full flex items-center justify-center text-[12px] font-medium transition-all duration-200',
              i === currentStep
                ? 'bg-[#98b3ff]/20 text-[#98b3ff] ring-1 ring-[#98b3ff]/30'
                : signals[signalKeys[i]] === 'green'
                  ? 'bg-[#b5dec2]/15 text-[#b5dec2]'
                  : 'bg-white/[0.06] text-white/40',
            )}
          >
            {signals[signalKeys[i]] === 'green' ? <Check size={14} /> : i + 1}
          </button>
          {i < STEPS.length - 1 && (
            <div className={cn(
              'h-px w-8 transition-colors duration-300',
              signals[signalKeys[i]] === 'green' ? 'bg-[#b5dec2]/30' : 'bg-white/[0.08]',
            )} />
          )}
        </div>
      ))}
    </div>
  );
}

export function WhyMeEngine({ story, signals, onUpdate, onClose }: WhyMeEngineProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const step = STEPS[currentStep];
  const signalKeys: (keyof WhyMeSignals)[] = ['clarity', 'alignment', 'differentiation'];

  const canGoBack = currentStep > 0;
  const canGoForward = currentStep < STEPS.length - 1;
  const isLastStep = currentStep === STEPS.length - 1;
  const allComplete = signals.clarity === 'green' && signals.alignment === 'green' && signals.differentiation === 'green';

  return (
    <div className="max-w-2xl mx-auto">
      <GlassCard className="p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles size={16} className="text-[#98b3ff]" />
              <span className="text-[11px] font-medium text-[#98b3ff] uppercase tracking-widest">
                Your Why-Me Story
              </span>
            </div>
            <p className="text-[13px] text-white/45">
              Three questions that unlock your entire positioning strategy
            </p>
          </div>
          <StepIndicator currentStep={currentStep} signals={signals} />
        </div>

        {/* Current Prompt */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold text-white/90">
              {step.question}
            </h3>
            <SignalIndicator level={signals[signalKeys[currentStep]]} />
          </div>
          <p className="text-[13px] text-white/50 leading-relaxed mb-5">
            {step.context}
          </p>

          <textarea
            value={story[step.field]}
            onChange={(e) => onUpdate(step.field, e.target.value)}
            placeholder={step.placeholder}
            className={cn(
              'w-full min-h-[160px] rounded-xl border bg-white/[0.03] px-4 py-3',
              'text-[14px] text-white/85 placeholder:text-white/25 leading-relaxed',
              'focus:outline-none focus:ring-1 transition-all duration-200 resize-y',
              signals[signalKeys[currentStep]] === 'green'
                ? 'border-[#b5dec2]/20 focus:ring-[#b5dec2]/30 focus:border-[#b5dec2]/30'
                : 'border-white/[0.1] focus:ring-[#98b3ff]/30 focus:border-[#98b3ff]/20',
            )}
          />

          <div className="flex items-center justify-between mt-2">
            <span className="text-[11px] text-white/30">
              {story[step.field].trim().length > 0
                ? `${story[step.field].trim().length} characters`
                : 'Take your time — there are no wrong answers'}
            </span>
            {story[step.field].trim().length > 0 && story[step.field].trim().length < 50 && (
              <span className="text-[11px] text-[#dfc797]">
                A few more sentences will strengthen this
              </span>
            )}
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between pt-4 border-t border-white/[0.06]">
          <div>
            {canGoBack && (
              <button
                type="button"
                onClick={() => setCurrentStep((s) => s - 1)}
                className="flex items-center gap-1.5 text-[13px] text-white/50 hover:text-white/70 transition-colors"
              >
                <ChevronLeft size={16} />
                {STEPS[currentStep - 1].title}
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {onClose && allComplete && (
              <GlassButton variant="primary" onClick={onClose}>
                Go to Dashboard
                <ChevronRight size={16} className="ml-1" />
              </GlassButton>
            )}
            {canGoForward && (
              <button
                type="button"
                onClick={() => setCurrentStep((s) => s + 1)}
                className="flex items-center gap-1.5 text-[13px] text-white/50 hover:text-white/70 transition-colors"
              >
                {STEPS[currentStep + 1].title}
                <ChevronRight size={16} />
              </button>
            )}
            {isLastStep && !allComplete && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="text-[12px] text-white/35 hover:text-white/50 transition-colors"
              >
                Skip for now
              </button>
            )}
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
