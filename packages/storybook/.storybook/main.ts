import type { StorybookConfig } from "@storybook/html-vite";
import { mergeConfig } from "vite";

/** @type { import('@storybook/html-vite').StorybookConfig } */
const config: StorybookConfig = {
  stories: ["../stories/**/*.mdx", "../stories/**/stories.ts"],
  addons: [
    { name: "@storybook/addon-essentials", options: { actions: false, controls: false } },
    "@storybook/addon-storysource",
  ],
  framework: "@storybook/html-vite",
  typescript: {
    check: true,
  },
  core: {
    disableTelemetry: true,
  },
  staticDirs: ["../public"],
  logLevel: "error",
  async viteFinal(config) {
    return mergeConfig(config, {
      resolve: {
        preserveSymlinks: false,
      },
    });
  },
};
export default config;
