import type { Meta, StoryObj } from "@storybook/web-components";

import { wrapStory } from "../../utils";
import template from "./index.html?raw";
import localImagesPlay from "./local-images";
import localImagesSource from "./local-images?raw";
import nodeImagesPlay from "./node-images";
import nodeImagesSource from "./node-images?raw";
import nodePictogramsPlay from "./node-pictograms";
import nodePictogramsSource from "./node-pictograms?raw";

const meta: Meta = {
  id: "@sigma/node-image",
  title: "Satellite packages/@sigma--node-image",
};
export default meta;

type Story = StoryObj;

export const nodeImages: Story = {
  name: "NodeImageRenderer",
  render: () => template,
  play: wrapStory(nodeImagesPlay),
  args: {},
  parameters: {
    storySource: {
      source: nodeImagesSource,
    },
  },
};

export const nodePictograms: Story = {
  name: "NodePictogramRenderer",
  render: () => template,
  play: wrapStory(nodePictogramsPlay),
  args: {},
  parameters: {
    storySource: {
      source: nodePictogramsSource,
    },
  },
};

export const localImages: Story = {
  name: "Displaying local images",
  render: () => template,
  play: wrapStory(localImagesPlay),
  args: {},
  parameters: {
    storySource: {
      source: localImagesSource,
    },
  },
};
