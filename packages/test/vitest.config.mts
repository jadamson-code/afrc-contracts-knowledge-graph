import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/[^_]*.ts"],
    exclude: ["**/*.test-d.ts"],
    browser: {
      provider: "playwright",
      name: "chromium",
      enabled: true,
      headless: true,
    },
    typecheck: {
      enabled: true,
      // Exclude primitives-without-satellites.test-d.ts - it requires type isolation
      // and is tested separately via tsc with tsconfig.typecheck-without-satellites.json
      include: ["type/**/*.test-d.ts", "type/*.test-d.ts"],
      exclude: ["type/primitives-without-satellites.test-d.ts"],
      ignoreSourceErrors: true,
    },
  },
});
