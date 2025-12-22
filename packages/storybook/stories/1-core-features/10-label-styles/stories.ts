import type { Meta, StoryObj } from "@storybook/web-components";

import { wrapStory } from "../../utils";
import play, { StoryArgs } from "./index";
import template from "./index.html?raw";
import source from "./index?raw";

const meta: Meta<StoryArgs> = {
  id: "label-styles",
  title: "Core library/Features showcases",
  argTypes: {
    labelPosition: {
      name: "Label position",
      control: { type: "select" },
      options: ["right", "left", "above", "below", "over"],
    },
    labelAngle: {
      name: "Label angle (degrees)",
      control: { type: "number", min: -180, max: 180, step: 5 },
    },
    labelMargin: {
      name: "Label margin (pixels)",
      control: { type: "number", min: 0, max: 50, step: 1 },
    },
    rotateWithCamera: {
      name: "Rotate nodes with camera",
      control: { type: "boolean" },
    },
  },
};
export default meta;

type Story = StoryObj<StoryArgs>;

export const story: Story = {
  name: "Label styles",
  render: () => template,
  play: wrapStory(play),
  args: {
    labelPosition: "right",
    labelAngle: 0,
    labelMargin: 5,
    rotateWithCamera: false,
  },
  parameters: {
    controls: { disable: false },
    storySource: {
      source,
    },
  },
};
