import "@sigma/node-piechart";
import Graph from "graphology";
import Sigma from "sigma";

export default () => {
  const container = document.getElementById("sigma-container") as HTMLElement;

  const graph = new Graph();

  const COLOR_1 = "#956b5e";
  const COLOR_2 = "#ff44de";
  const COLOR_3 = "#71db97";
  const COLOR_4 = "#ff813b";

  // Each node has up to 4 slice values. Slices with value 0 are hidden.
  graph.addNode("a", {
    x: 0,
    y: 0,
    size: 20,
    label: "A",
    slice1: 1,
    slice2: 0,
    slice3: 0,
    slice4: 0,
  });
  graph.addNode("b", {
    x: 1,
    y: -1,
    size: 40,
    label: "B",
    slice1: 1,
    slice2: 1,
    slice3: 1,
    slice4: 0,
  });
  graph.addNode("c", {
    x: 3,
    y: -2,
    size: 20,
    label: "C",
    slice1: 0,
    slice2: 1,
    slice3: 0,
    slice4: 0,
  });
  graph.addNode("d", {
    x: 1,
    y: -3,
    size: 20,
    label: "D",
    slice1: 0,
    slice2: 1,
    slice3: 1,
    slice4: 0,
  });
  graph.addNode("e", {
    x: 3,
    y: -4,
    size: 40,
    label: "E",
    slice1: 0,
    slice2: 1,
    slice3: 1,
    slice4: 1,
  });
  graph.addNode("f", {
    x: 4,
    y: -5,
    size: 20,
    label: "F",
    slice1: 0,
    slice2: 0,
    slice3: 0,
    slice4: 1,
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

  const renderer = new Sigma(graph, container, {
    primitives: {
      nodes: {
        layers: [
          {
            type: "piechart",
            slices: [
              { color: COLOR_1, value: { attribute: "slice1" } },
              { color: COLOR_2, value: { attribute: "slice2" } },
              { color: COLOR_3, value: { attribute: "slice3" } },
              { color: COLOR_4, value: { attribute: "slice4" } },
            ],
          },
        ],
      },
    },
  });

  return () => {
    renderer.kill();
  };
};
