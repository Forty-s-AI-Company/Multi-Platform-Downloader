import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactRefresh from "eslint-plugin-react-refresh";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      "dist/**",
      "dist-electron/**",
      "node_modules/**",
      // preload 用 CJS（避免 Electron preload 踩 ESM 雷），先不納入 TS ESLint 規則
      "electron/preload.cjs",
      // build 用的複製腳本：小工具，先不納入 lint（避免 node globals 設定打擾主流程）
      "scripts/copy-electron-assets.mjs"
    ]
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module"
    },
    plugins: {
      "react-refresh": reactRefresh,
      "react-hooks": reactHooks
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }]
    }
  }
);
