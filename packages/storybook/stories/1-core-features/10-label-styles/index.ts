/**
 * This example demonstrates label styles using the node program system.
 * It shows a 5x4 grid of nodes where:
 * - Each column uses a different shape (circle, square, triangle, diamond)
 * - Each row uses a different label position (right, left, above, below, over)
 *
 * This demonstrates how labels are positioned relative to each shape's edge.
 * Use the controls to toggle node rotation with camera and adjust label angle.
 */
import Graph from "graphology";
import Sigma from "sigma";
import {
  LabelProgramType,
  NodeProgramType,
  createNodeProgram,
  layerFill,
  sdfCircle,
  sdfDiamond,
  sdfSquare,
  sdfTriangle,
} from "sigma/rendering";
import { LabelPosition } from "sigma/types";

export default () => {
  const container = document.getElementById("sigma-container") as HTMLElement;

  const graph = new Graph();

  // Grid configuration
  const SPACING = 50;
  const NODE_SIZE = 15;

  // Colors for each row
  const ROW_COLORS = ["#5B8FF9", "#5AD8A6", "#F6BD16", "#E8684A", "#9270CA"];

  // Shape names for node types
  const SHAPES = ["circle", "square", "triangle", "diamond"];

  // Label positions for each row
  const LABEL_POSITIONS: LabelPosition[] = ["right", "left", "above", "below", "over"];

  const COLS = SHAPES.length;
  const ROWS = LABEL_POSITIONS.length;

  // Create nodes in a grid
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const nodeId = `${SHAPES[col]}-${LABEL_POSITIONS[row]}`;
      graph.addNode(nodeId, {
        x: col * SPACING,
        y: -row * SPACING,
        size: NODE_SIZE,
        color: ROW_COLORS[row],
        label: `${SHAPES[col]} / ${LABEL_POSITIONS[row]}`,
        type: nodeId,
      });
    }
  }

  // Helper to get shape SDF
  const getShape = (shapeName: string) => {
    switch (shapeName) {
      case "circle":
        return sdfCircle();
      case "square":
        return sdfSquare();
      case "triangle":
        return sdfTriangle();
      case "diamond":
        return sdfDiamond();
      default:
        return sdfCircle();
    }
  };

  // Function to create all program combinations with given settings
  const createPrograms = (
    rotateWithCamera: boolean,
    labelAngle: number,
    labelMargin: number,
  ): { nodePrograms: Record<string, NodeProgramType>; labelPrograms: Record<string, LabelProgramType> } => {
    const nodePrograms: Record<string, NodeProgramType> = {};
    const labelPrograms: Record<string, LabelProgramType> = {};

    for (const shape of SHAPES) {
      for (const position of LABEL_POSITIONS) {
        const nodeType = `${shape}-${position}`;
        const NodeProgram = createNodeProgram({
          shape: getShape(shape),
          layers: [layerFill()],
          rotateWithCamera,
          label: {
            position,
            angle: labelAngle,
            margin: labelMargin,
          },
        });
        nodePrograms[nodeType] = NodeProgram;
        if (NodeProgram.LabelProgram) {
          labelPrograms[nodeType] = NodeProgram.LabelProgram;
        }
      }
    }

    return { nodePrograms, labelPrograms };
  };

  // Initial state
  const initialPrograms = createPrograms(false, 0, 5);
  const renderer = new Sigma(graph, container, {
    nodeProgramClasses: initialPrograms.nodePrograms,
    labelProgramClasses: initialPrograms.labelPrograms,
    defaultNodeType: "circle-right",
    // Use positions-based sizing for a clean grid appearance
    itemSizesReference: "positions",
    zoomToSizeRatioFunction: (x) => x,
    autoRescale: true,
  });

  // Set a slight camera rotation to demonstrate the feature
  renderer.getCamera().setState({ angle: 0.1 });

  // Helper to update programs based on current control values
  const updatePrograms = () => {
    const rotateWithCamera = (document.getElementById("rotate-with-camera") as HTMLInputElement).checked;
    const labelAngleDegrees = parseFloat((document.getElementById("label-angle") as HTMLInputElement).value) || 0;
    const labelAngle = (labelAngleDegrees * Math.PI) / 180; // Convert to radians
    const labelMargin = parseFloat((document.getElementById("label-margin") as HTMLInputElement).value);

    const programs = createPrograms(rotateWithCamera, labelAngle, labelMargin);
    renderer.setSetting("nodeProgramClasses", programs.nodePrograms);
    renderer.setSetting("labelProgramClasses", programs.labelPrograms);
  };

  // Handle checkbox change
  const checkbox = document.getElementById("rotate-with-camera") as HTMLInputElement;
  checkbox.addEventListener("change", updatePrograms);

  // Handle angle input change
  const angleInput = document.getElementById("label-angle") as HTMLInputElement;
  angleInput.addEventListener("input", updatePrograms);

  // Handle margin input change
  const marginInput = document.getElementById("label-margin") as HTMLInputElement;
  marginInput.addEventListener("input", updatePrograms);

  return () => {
    renderer.kill();
  };
};
