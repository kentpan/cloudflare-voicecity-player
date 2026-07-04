// Minimal ESLint flat config for VoiceCity
// Note: eslint-config-next v16 has circular structure issues with FlatCompat.
// This config provides basic TypeScript + Next.js support without the full next config.
import js from "@eslint/js";
import typescript from "@typescript-eslint/eslint-plugin";
import typescriptParser from "@typescript-eslint/parser";

const eslintConfig = [
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs}"],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
      globals: {
        window: "readonly",
        document: "readonly",
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        fetch: "readonly",
        crypto: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearTimeout: "readonly",
        clearInterval: "readonly",
        globalThis: "readonly",
        location: "readonly",
        navigator: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        Request: "readonly",
        Response: "readonly",
        Headers: "readonly",
        FormData: "readonly",
        Blob: "readonly",
        File: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        history: "readonly",
        HTMLElement: "readonly",
        HTMLInputElement: "readonly",
        HTMLFormElement: "readonly",
        HTMLButtonElement: "readonly",
        Event: "readonly",
        MouseEvent: "readonly",
        KeyboardEvent: "readonly",
        AbortController: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": typescript,
    },
    rules: {
      ...typescript.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-require-imports": "off",
      "no-unused-vars": "off",
      "no-undef": "off",
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      ".vercel/**",
      "dist/**",
      "build/**",
      "public/**",
      "upload/**",
      "skills/**",
      "*.config.*",
      "scripts/patch-ios13.mjs",
    ],
  },
];

export default eslintConfig;
