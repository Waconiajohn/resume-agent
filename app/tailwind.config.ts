import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: 'hsl(220 30% 6%)',
          raised: 'hsl(220 26% 10%)',
          overlay: 'hsl(222 24% 14%)',
        },
      },
      fontSize: {
        body: ['0.8125rem', { lineHeight: '1.4' }],
      },
      keyframes: {
        'panel-enter': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'card-stagger': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'score-ring-draw': {
          from: { 'stroke-dashoffset': 'var(--circumference)' },
          to: { 'stroke-dashoffset': 'var(--offset)' },
        },
        'celebration-check': {
          '0%': { transform: 'scale(0)', opacity: '0' },
          '60%': { transform: 'scale(1.2)', opacity: '1' },
          '80%': { transform: 'scale(0.95)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'celebration-glow': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(168, 215, 184, 0)' },
          '50%': { boxShadow: '0 0 20px 8px rgba(168, 215, 184, 0.15)' },
        },
        'node-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        'node-complete-pop': {
          '0%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.6)' },
          '100%': { transform: 'scale(1)' },
        },
        'progress-shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'msg-in-left': {
          from: { opacity: '0', transform: 'translateX(-12px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'msg-in-right': {
          from: { opacity: '0', transform: 'translateX(12px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
      },
      animation: {
        'panel-enter': 'panel-enter 250ms ease-out',
        'card-stagger': 'card-stagger 200ms ease-out forwards',
        'score-ring-draw': 'score-ring-draw 800ms ease-out forwards',
        'celebration-check': 'celebration-check 500ms ease-out forwards',
        'celebration-glow': 'celebration-glow 2s ease-in-out 500ms infinite',
        'node-pulse': 'node-pulse 2s ease-in-out infinite',
        'node-complete-pop': 'node-complete-pop 300ms ease-out',
        'progress-shimmer': 'progress-shimmer 1.5s ease-in-out infinite',
        'msg-in-left': 'msg-in-left 150ms ease-out',
        'msg-in-right': 'msg-in-right 150ms ease-out',
      },
    },
  },
  plugins: [],
} satisfies Config;
