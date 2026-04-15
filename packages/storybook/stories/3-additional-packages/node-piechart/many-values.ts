import { createNodePiechartProgram } from "@sigma/node-piechart";
import chroma from "chroma-js";
import Graph from "graphology";
import Sigma from "sigma";
import type { NonEmptyArray } from "sigma/types";

const NB_VALUES = 13;

export default () => {
  const container = document.getElementById("sigma-container") as HTMLElement;
  const colors = chroma.scale(["#FFF", "#000"]).mode("lch").colors(NB_VALUES);
  const keyValues = Array.from(Array(NB_VALUES).keys()).map((index) => ({
    attribute: `value_${index}`,
    color: colors[index],
  }));

  function getRandomValues() {
    return keyValues.reduce(
      (acc, curr) => ({ ...acc, [curr.attribute]: Math.round(Math.random() * 10) }),
      {} as { [key: string]: number },
    );
  }

  const graph = new Graph();

  graph.addNode("a", {
    x: 0,
    y: 0,
    size: 20,
    label: "A",
    ...getRandomValues(),
  });
  graph.addNode("b", {
    x: 1,
    y: -1,
    size: 40,
    label: "B",
    ...getRandomValues(),
  });
  graph.addNode("c", {
    x: 3,
    y: -2,
    size: 20,
    label: "C",
    ...getRandomValues(),
  });
  graph.addNode("d", {
    x: 1,
    y: -3,
    size: 20,
    label: "D",
    ...getRandomValues(),
  });
  graph.addNode("e", {
    x: 3,
    y: -4,
    size: 40,
    label: "E",
    ...getRandomValues(),
  });
  graph.addNode("f", {
    x: 4,
    y: -5,
    size: 20,
    label: "F",
    ...getRandomValues(),
  });

  graph.addEdge("a", "b", { size: 10 });
  graph.addEdge("b", "c", { size: 10 });
  graph.addEdge("b", "d", { size: 10 });
  graph.addEdge("c", "b", { size: 10 });
  graph.addEdge("c", "e", { size: 10 });
  graph.addEdge("d", "c", { size: 10 });
  graph.addEdge("d", "e", { size: 10 });
  graph.addEdge("e", "d", { size: 10 });
  graph.addEdge("f", "e", { size: 10 });

  const NodePiechartProgram = createNodePiechartProgram({
    defaultColor: "#BCB7C4",
    slices: keyValues.map((e) => ({
      color: { value: e.color },
      value: { attribute: e.attribute },
    })) as NonEmptyArray<any>,
  });

  const renderer = new Sigma(graph, container, {
    defaultNodeType: "piechart",
    nodeProgramClasses: {
      piechart: NodePiechartProgram,
    },
  });

  return () => {
    renderer.kill();
  };
};
