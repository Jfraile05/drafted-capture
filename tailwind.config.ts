import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        bg: '#0B0D0C',
        'bg-card': '#141716',
        'bg-card-hover': '#1B1F1D',
        'bg-input': '#101312',
        green: '#4DFFA0',
        violet: '#9B7FFF',
        orange: '#F5A623',
        coral: '#FF6B8A',
        text: '#F2F4F3',
        'text-muted': '#A6ACA9',
        'text-faint': '#7D8380',
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
