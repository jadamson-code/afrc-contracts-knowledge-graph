import type { Meta, StoryObj } from "@storybook/web-components";

import { wrapStory } from "../../utils";
import play, { StoryArgs } from "./index";
import template from "./index.html?raw";
import source from "./index?raw";

const meta: Meta<StoryArgs> = {
  id: "bipartite-network",
  title: "Core library/Features showcases",
  argTypes: {
    labelScaling: {
      name: "Label scaling with zoom",
      control: { type: "select" },
      options: ["fixed", "sqrt", "linear"],
    },
    showBackdrops: {
      name: "Show backdrops",
      control: { type: "select" },
      options: ["none", "all", "hover"],
    },
    backdropPadding: {
      name: "Backdrop padding (pixels)",
      control: { type: "number", min: 0, max: 20, step: 1 },
    },
    labelMargin: {
      name: "Label margin (pixels)",
      control: { type: "number", min: 0, max: 30, step: 1 },
    },
  },
};
export default meta;

type Story = StoryObj<StoryArgs>;

export const story: Story = {
  name: "Bipartite network",
  render: () => template,
  play: wrapStory(play),
  args: {
    labelScaling: "fixed",
    showBackdrops: "hover",
    backdropPadding: 6,
    labelMargin: 5,
  },
  parameters: {
    controls: { disable: false },
    storySource: {
      source,
    },
  },
};
