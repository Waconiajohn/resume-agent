import {
  TrendingUp,
  Zap,
  Target,
  AlignLeft,
  Award,
  ListOrdered,
  X,
  BarChart2,
  Layers,
  RefreshCw,
  Minus,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface WorkbenchActionChipsProps {
  section: string;
  onAction: (instruction: string) => void;
  disabled: boolean;
}

interface Chip {
  label: string;
  icon: React.ReactNode;
  instruction: string;
}

const SECTION_CHIPS: Record<string, Chip[]> = {
  summary: [
    {
      label: 'Sharpen Opening',
      icon: <Zap className="h-3 w-3" />,
      instruction: 'Sharpen the opening sentence to immediately signal executive-level value and impact',
    },
    {
      label: 'Add Leadership Signal',
      icon: <Award className="h-3 w-3" />,
      instruction: 'Strengthen the leadership signal — add clear indicators of team leadership, organizational scope, or strategic accountability',
    },
    {
      label: 'Embed Keywords',
      icon: <Target className="h-3 w-3" />,
      instruction: 'Naturally embed the most important ATS keywords from the job description into this section',
    },
    {
      label: 'Tighten to 3 Lines',
      icon: <Minus className="h-3 w-3" />,
      instruction: 'Tighten this section to 3 powerful lines maximum — cut anything that does not add unique value',
    },
  ],
  experience: [
    {
      label: 'Add Metric',
      icon: <BarChart2 className="h-3 w-3" />,
      instruction: 'Add specific metrics and numbers to quantify achievements — revenue, team size, growth percentages, cost savings, or timeline improvements',
    },
    {
      label: 'Power Verb',
      icon: <Zap className="h-3 w-3" />,
      instruction: 'Replace weak or passive verbs with strong executive action verbs that convey leadership and impact',
    },
    {
      label: 'Show Impact',
      icon: <TrendingUp className="h-3 w-3" />,
      instruction: 'Make the business impact explicit — connect actions directly to outcomes and why they mattered to the organization',
    },
    {
      label: 'ATS Keyword',
      icon: <Target className="h-3 w-3" />,
      instruction: 'Naturally integrate missing ATS keywords from the job description into this experience section',
    },
    {
      label: 'Tighten',
      icon: <Minus className="h-3 w-3" />,
      instruction: 'Tighten each bullet point — remove filler words and make every word earn its place',
    },
  ],
  skills: [
    {
      label: 'Reorder by Relevance',
      icon: <ListOrdered className="h-3 w-3" />,
      instruction: 'Reorder skills by relevance to the target role — most critical skills first',
    },
    {
      label: 'Add Missing Keywords',
      icon: <Target className="h-3 w-3" />,
      instruction: 'Add any critical keywords from the job description that are missing from the skills section',
    },
    {
      label: 'Remove Dated Skills',
      icon: <X className="h-3 w-3" />,
      instruction: 'Remove any outdated or dated skills that might signal age or irrelevance to the target role',
    },
  ],
  selected_accomplishments: [
    {
      label: 'Quantify Impact',
      icon: <BarChart2 className="h-3 w-3" />,
      instruction: 'Quantify the impact of each accomplishment with specific numbers, percentages, or dollar amounts',
    },
    {
      label: 'Add Context',
      icon: <Layers className="h-3 w-3" />,
      instruction: 'Add brief context to each accomplishment — what was the challenge or situation that made this impressive?',
    },
    {
      label: 'Reorder by Relevance',
      icon: <ListOrdered className="h-3 w-3" />,
      instruction: 'Reorder accomplishments by relevance to the target role — lead with the most compelling proof points',
    },
  ],
};

const DEFAULT_CHIPS: Chip[] = [
  {
    label: 'Add Detail',
    icon: <AlignLeft className="h-3 w-3" />,
    instruction: 'Add more specific detail that demonstrates depth of expertise and real-world experience',
  },
  {
    label: 'Tighten',
    icon: <Minus className="h-3 w-3" />,
    instruction: 'Tighten the writing — remove filler words and make every word count',
  },
  {
    label: 'Rephrase',
    icon: <RefreshCw className="h-3 w-3" />,
    instruction: 'Rephrase for stronger, clearer, more executive-sounding language',
  },
  {
    label: 'Add Metric',
    icon: <BarChart2 className="h-3 w-3" />,
    instruction: 'Add specific metrics and numbers to make the impact concrete and credible',
  },
];

function getChips(section: string): Chip[] {
  const normalized = section.toLowerCase().replace(/-/g, '_');
  if (SECTION_CHIPS[normalized]) return SECTION_CHIPS[normalized];
  // Partial match for experience variants (e.g. experience_1, experience_company_name)
  if (normalized.startsWith('experience')) return SECTION_CHIPS['experience'];
  return DEFAULT_CHIPS;
}

export function WorkbenchActionChips({ section, onAction, disabled }: WorkbenchActionChipsProps) {
  const chips = getChips(section);

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-medium tracking-wide uppercase text-white/35 px-0.5">
        Refine
      </p>
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <button
            key={chip.label}
            onClick={() => onAction(chip.instruction)}
            disabled={disabled}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a9beff]/45',
              'border-white/[0.1] bg-white/[0.03] text-white/60',
              !disabled && 'hover:border-white/[0.2] hover:bg-white/[0.07] hover:text-white/85 cursor-pointer',
              disabled && 'opacity-50 pointer-events-none cursor-default',
            )}
          >
            <span className="text-white/50">{chip.icon}</span>
            {chip.label}
          </button>
        ))}
      </div>
    </div>
  );
}
