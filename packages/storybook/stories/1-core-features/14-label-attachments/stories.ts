import type { Meta, StoryObj } from "@storybook/web-components";

import { wrapStory } from "../../utils";
import play, { StoryArgs } from "./index";
import template from "./index.html?raw";
import source from "./index?raw";

const meta: Meta<StoryArgs> = {
  id: "label-attachments",
  title: "Core library/Features showcases",
  argTypes: {
    backdropPadding: {
      name: "Backdrop padding (px)",
      control: { type: "range", min: 0, max: 20, step: 1 },
    },
  },
};
export default meta;

type Story = StoryObj<StoryArgs>;

export const story: Story = {
  name: "Label attachments",
  render: () => template,
  play: wrapStory(play),
  args: {
    backdropPadding: 6,
  },
  parameters: {
    controls: { disable: false },
    storySource: {
      source,
    },
  },
};
