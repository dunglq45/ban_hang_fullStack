import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores([
    "dist",
    ".wrangler",
    "node_modules",
    "design",
    "migrations",
    "worker-configuration.d.ts",
  ]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
    },
  },
  {
    files: ["src/react-app/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat["recommended-latest"], reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
  },
  {
    // Quy tắc 1: route và service chỉ truy cập DB qua getDb(env, storeId), không dùng Drizzle thô.
    files: ["src/worker/routes/**/*.ts", "src/worker/services/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/db/client"],
              importNames: ["createDatabase"],
              message: "Dùng getDb(env, storeId) để mọi truy vấn được lọc theo cửa hàng.",
            },
            {
              group: ["drizzle-orm/d1"],
              message: "Dùng getDb(env, storeId) để mọi truy vấn được lọc theo cửa hàng.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["*.config.{ts,js}", "scripts/**/*.ts"],
    languageOptions: { globals: globals.node },
  },
]);
