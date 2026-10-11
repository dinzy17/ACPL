import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "ui-sans-serif", "system-ui"],
        body: ["var(--font-body)", "ui-sans-serif", "system-ui"]
      },
      colors: {
        turf: "#0369A1",
        lime: "#22D3EE",
        crimson: "#E11D48",
        canvas: "#D7E9F7",
        gold: "#38BDF8",
        aqua: "#0891B2",
        orange: "#0284C7"
      }
    }
  },
  plugins: []
};
export default config;
