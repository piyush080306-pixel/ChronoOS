/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        void: '#090A0F',
        abyss: '#111322',
        accent: {
          DEFAULT: '#00F0FF',
          soft: 'rgba(0, 240, 255, 0.12)',
          line: 'rgba(0, 240, 255, 0.35)',
        },
        neon: '#00FF85',
        'glow-amber': '#FFB800',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 20px rgba(0, 240, 255, 0.15)',
        'glow-lg': '0 0 48px rgba(0, 240, 255, 0.22)',
        'glow-neon': '0 0 24px rgba(0, 255, 133, 0.18)',
        'inner-glow': 'inset 0 1px 0 0 rgba(255, 255, 255, 0.06)',
        lift: '0 24px 60px -24px rgba(0, 0, 0, 0.9)',
      },
      backgroundImage: {
        'void-radial':
          'radial-gradient(1200px 700px at 12% -10%, rgba(0,240,255,0.10), transparent 60%), radial-gradient(900px 600px at 100% 0%, rgba(99,102,241,0.14), transparent 55%), radial-gradient(900px 800px at 50% 120%, rgba(0,255,133,0.05), transparent 60%)',
        'fine-grid':
          'linear-gradient(to right, rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.045) 1px, transparent 1px)',
      },
      backgroundSize: {
        grid: '44px 44px',
      },
      animation: {
        'fade-up': 'fadeUp .5s cubic-bezier(.16,1,.3,1) both',
        'fade-in': 'fadeIn .4s ease-out both',
        shimmer: 'shimmer 2.4s linear infinite',
        'pulse-ring': 'pulseRing 2.6s cubic-bezier(.4,0,.6,1) infinite',
        'pulse-dot': 'pulseDot 2s ease-in-out infinite',
        scan: 'scan 7s linear infinite',
        'spin-slow': 'spin 8s linear infinite',
        'draw-line': 'drawLine 1.4s ease-out both',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        pulseRing: {
          '0%': { transform: 'scale(.75)', opacity: '.7' },
          '80%, 100%': { transform: 'scale(2.4)', opacity: '0' },
        },
        pulseDot: {
          '0%, 100%': { opacity: '1', boxShadow: '0 0 0 0 rgba(0,255,133,0.5)' },
          '50%': { opacity: '.75', boxShadow: '0 0 0 6px rgba(0,255,133,0)' },
        },
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(600%)' },
        },
        drawLine: {
          '0%': { strokeDashoffset: '1000' },
          '100%': { strokeDashoffset: '0' },
        },
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(.16,1,.3,1)',
      },
    },
  },
  plugins: [],
};
