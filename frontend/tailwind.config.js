/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx}',
    './src/components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        safety: {
          green: '#22c55e',
          yellow: '#eab308',
          red: '#ef4444',
        }
      }
    },
  },
  plugins: [],
}
