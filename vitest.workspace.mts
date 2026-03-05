import { defineWorkspace } from "vitest/config";

const PACKAGES = ["sigma", "node-image", "node-border", "node-piechart", "utils", "layer-leaflet", "layer-maplibre"];

export default defineWorkspace([
  ...PACKAGES.map((pkg) => ({
    test: {
      name: pkg,
      root: `packages/${pkg}`,
      include: ["src/**/*.test.ts"],
      browser: {
        provider: "playwright",
        name: "chromium",
        enabled: true,
        headless: true,
      },
    },
  })),
  // Type tests and benchmarks remain in packages/test with their own config
  "packages/test",
]);
