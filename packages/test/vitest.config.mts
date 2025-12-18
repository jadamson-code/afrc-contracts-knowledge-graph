import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/[^_]*.ts"],
    browser: {
      provider: "playwright",
      name: "chromium",
      enabled: true,
      headless: true,
    },
    typecheck: {
      enabled: true,
      include: ["unit/types/**/*.test-d.ts"],
      ignoreSourceErrors: true,
    },
  },
});
