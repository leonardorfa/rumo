import type { Config } from "tailwindcss";

const v = (name: string) => `var(--${name})`;
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: v("bg"), card: v("card"), fill: v("fill"), line: v("line"),
        ink: v("ink"), ink2: v("ink2"), ink3: v("ink3"),
        meu: v("meu"), pai: v("pai"), alert: v("alert"), ok: v("ok"), meta: v("meta"),
        brand: v("brand"), onbrand: v("on-brand"), link: v("link"),
      },
      fontFamily: {
        num: ["ui-rounded", "SF Pro Rounded", "-apple-system", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
