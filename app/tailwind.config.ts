import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: 'hsl(225 25% 8%)',
      },
    },
  },
  plugins: [],
} satisfies Config;
