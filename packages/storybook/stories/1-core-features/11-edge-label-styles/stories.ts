import type { Meta, StoryObj } from "@storybook/web-components";

import { wrapStory } from "../../utils";
import play, { StoryArgs } from "./index";
import template from "./index.html?raw";
import source from "./index?raw";

const meta: Meta<StoryArgs> = {
  id: "edge-label-styles",
  title: "Core library/Features showcases",
  argTypes: {
    fontSizeMode: {
      name: "Font size mode",
      control: { type: "select" },
      options: ["fixed", "scaled"],
    },
    headType: {
      name: "Head extremity",
      control: { type: "select" },
      options: ["none", "arrow"],
    },
    tailType: {
      name: "Tail extremity",
      control: { type: "select" },
      options: ["none", "arrow"],
    },
  },
};
export default meta;

type Story = StoryObj<StoryArgs>;

export const story: Story = {
  name: "Edge label styles",
  render: () => template,
  play: wrapStory(play),
  args: {
    fontSizeMode: "fixed",
    headType: "arrow",
    tailType: "none",
  },
  parameters: {
    controls: { disable: false },
    storySource: {
      source,
    },
  },
};
