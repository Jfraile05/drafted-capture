import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        bg: '#0A0518',
        'bg-card': '#150D2E',
        'bg-card-hover': '#1E1248',
        'bg-input': '#110B25',
        green: '#4DFFA0',
        violet: '#9B7FFF',
        orange: '#F5A623',
        coral: '#FF6B8A',
        text: '#EEF0FF',
        'text-muted': '#7A6FA8',
        'text-faint': '#3D2E6A',
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
