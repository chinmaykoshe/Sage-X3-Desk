/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        canvas: '#F4F4F2',
        surface: '#FFFFFF',
        graphite: '#171717',
        muted: '#777777',
        borderline: '#E8E8E5',
        limeaccent: '#C6F36B',
        tealaccent: '#35B8A6',
        coralaccent: '#F16D64',
        blueaccent: '#638BEF',
        purpleaccent: '#A88CEB',
      },
    },
  },
  plugins: [],
};
