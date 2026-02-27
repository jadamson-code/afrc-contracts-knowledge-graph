import type { Meta, StoryObj } from "@storybook/web-components";

import { wrapStory } from "../../utils";
import play, { StoryArgs } from "./index";
import template from "./index.html?raw";
import source from "./index?raw";

const meta: Meta<StoryArgs> = {
  id: "backdrop-styles",
  title: "Core library/Features showcases",
  argTypes: {
    backdropDisplay: {
      name: "Backdrop display",
      control: { type: "select" },
      options: ["always", "hover", "hidden"],
    },
    backdropColor: {
      name: "Fill color",
      control: { type: "color" },
    },
    backdropShadowColor: {
      name: "Shadow color",
      control: { type: "color" },
    },
    backdropShadowBlur: {
      name: "Shadow blur (px)",
      control: { type: "range", min: 0, max: 30, step: 1 },
    },
    backdropPadding: {
      name: "Node padding (px)",
      control: { type: "range", min: 0, max: 20, step: 1 },
    },
    backdropBorderColor: {
      name: "Border color",
      control: { type: "color" },
    },
    backdropBorderWidth: {
      name: "Border width (px)",
      control: { type: "range", min: 0, max: 8, step: 0.5 },
    },
    backdropCornerRadius: {
      name: "Corner radius (px)",
      control: { type: "range", min: 0, max: 20, step: 1 },
    },
    backdropLabelPadding: {
      name: "Label padding (px)",
      control: { type: "range", min: -1, max: 20, step: 1 },
    },
    backdropArea: {
      name: "Area coverage",
      control: { type: "select" },
      options: ["both", "node", "label"],
    },
  },
};
export default meta;

type Story = StoryObj<StoryArgs>;

export const story: Story = {
  name: "Backdrop styles",
  render: () => template,
  play: wrapStory(play),
  args: {
    backdropDisplay: "always",
    backdropColor: "#ffffff",
    backdropShadowColor: "rgba(0, 0, 0, 0.5)",
    backdropShadowBlur: 12,
    backdropPadding: 6,
    backdropBorderColor: "transparent",
    backdropBorderWidth: 0,
    backdropCornerRadius: 0,
    backdropLabelPadding: -1,
    backdropArea: "both",
  },
  parameters: {
    controls: { disable: false },
    storySource: {
      source,
    },
  },
};
