import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["e2e/**", "node_modules/**"],
    typecheck: {
      enabled: true,
      include: ["type/**/*.test-d.ts", "type/*.test-d.ts"],
      exclude: ["type/primitives-without-satellites.test-d.ts"],
      ignoreSourceErrors: true,
    },
  },
});
