import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      // Colors come from CSS variables so the light and dark themes share every class.
      colors: {
        bg: 'rgb(var(--c-bg) / <alpha-value>)',
        'bg-card': 'rgb(var(--c-bg-card) / <alpha-value>)',
        'bg-card-hover': 'rgb(var(--c-bg-card-hover) / <alpha-value>)',
        'bg-input': 'rgb(var(--c-bg-input) / <alpha-value>)',
        green: 'rgb(var(--c-green) / <alpha-value>)',
        'green-ink': 'rgb(var(--c-green-ink) / <alpha-value>)',
        violet: 'rgb(var(--c-violet) / <alpha-value>)',
        orange: 'rgb(var(--c-orange) / <alpha-value>)',
        coral: 'rgb(var(--c-coral) / <alpha-value>)',
        text: 'rgb(var(--c-text) / <alpha-value>)',
        'text-muted': 'rgb(var(--c-text-muted) / <alpha-value>)',
        'text-faint': 'rgb(var(--c-text-faint) / <alpha-value>)',
        // Hairlines and faint tints: white on dark, near black on light.
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
      },
      fontFamily: {
        poppins: ['Poppins', 'sans-serif'],
        jakarta: ['Plus Jakarta Sans', 'sans-serif'],
        inter: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        pill: '999px',
        card: '16px',
        btn: '10px',
        input: '10px',
        thumb: '8px',
      },
      boxShadow: {
        'green-glow': '0 0 20px rgba(77,255,160,0.3)',
        'violet-glow': '0 0 20px rgba(155,127,255,0.3)',
      },
    },
  },
  plugins: [],
} satisfies Config;
