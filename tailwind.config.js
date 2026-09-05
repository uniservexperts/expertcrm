/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: "#152238",
        navy2: "#1E304D",
        navy3: "#2A4066",
        brass: "#A9812F",
        clay: "#B23A32",
        leaf: "#3D7A57",
      },
      fontFamily: {
        display: ["var(--font-jakarta)", "ui-sans-serif", "system-ui"],
      },
    },
  },
  plugins: [],
};
