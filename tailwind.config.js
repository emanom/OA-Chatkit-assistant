/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/ui/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        slate: {
          850: "#121829",
        },
      },
    },
  },
  plugins: [],
};

