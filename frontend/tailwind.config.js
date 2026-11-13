/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        pastel: {
          lavender: '#c4b5fd',
          purple: '#a78bfa',
          'purple-deep': '#8b5cf6',
          rose: '#fda4af',
          'rose-deep': '#fb7185',
          mint: '#6ee7b7',
          'mint-deep': '#34d399',
          sky: '#7dd3fc',
          peach: '#fdba74',
          cream: '#fef9f3',
          'cream-dark': '#fdf4eb',
        },
        surface: {
          DEFAULT: '#ffffff',
          secondary: '#faf8f6',
          tertiary: '#f5f1ed',
          warm: '#fff9f4',
        },
        line: '#f0ebe4',
        field: {
          DEFAULT: '#faf7f3',
          border: '#efe9e2',
        },
        ink: {
          DEFAULT: '#2d2b3d',
          secondary: '#6b6880',
          tertiary: '#9e9bae',
          faint: '#c8c6d3',
        },
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.25rem',
        '4xl': '1.75rem',
      },
      boxShadow: {
        soft: '0 2px 16px 0 rgba(45, 43, 61, 0.06)',
        'soft-lg': '0 4px 24px 0 rgba(45, 43, 61, 0.08)',
        glow: '0 0 20px rgba(167, 139, 250, 0.15)',
        float: '0 10px 30px 0 rgba(45, 43, 61, 0.10)',
        nav: '0 -6px 24px 0 rgba(45, 43, 61, 0.06)',
      },
      keyframes: {
        'sheet-up': { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
      },
      animation: {
        'sheet-up': 'sheet-up 240ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        'fade-in': 'fade-in 200ms ease-out',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
