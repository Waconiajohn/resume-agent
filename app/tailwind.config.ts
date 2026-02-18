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
    },
  },
  plugins: [],
} satisfies Config;
