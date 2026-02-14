import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: 'hsl(225 25% 8%)',
          raised: 'hsl(225 25% 12%)',
          overlay: 'hsl(225 25% 16%)',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
