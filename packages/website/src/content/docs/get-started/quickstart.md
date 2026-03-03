---
title: Quickstart
description: Install sigma.js and render your first graph.
---

## Installation

Sigma.js requires [graphology](https://graphology.github.io/) as its graph data structure. Install both packages:

```bash
npm install graphology sigma
```

## Minimal example

### HTML

Create an HTML file with a container element for the graph. The container must have a defined width and height:

```html
<!doctype html>
<html>
  <head>
    <style>
      #container {
        width: 800px;
        height: 600px;
      }
    </style>
  </head>
  <body>
    <div id="container"></div>
    <script type="module" src="./index.ts"></script>
  </body>
</html>
```

### TypeScript

Create a `index.ts` file that builds a graph and renders it with sigma:

```typescript
import Graph from "graphology";
import Sigma from "sigma";

// Create a graph with graphology
const graph = new Graph();

// Add nodes with positions, sizes, colors, and labels
graph.addNode("1", {
  label: "Node 1",
  x: 0,
  y: 0,
  size: 10,
  color: "#e22653",
});
graph.addNode("2", {
  label: "Node 2",
  x: 1,
  y: 1,
  size: 10,
  color: "#666",
});
graph.addNode("3", {
  label: "Node 3",
  x: 1,
  y: 0,
  size: 10,
  color: "#277da1",
});

// Add edges between nodes
graph.addEdge("1", "2", { size: 2 });
graph.addEdge("2", "3", { size: 2 });
graph.addEdge("3", "1", { size: 2 });

// Render the graph in the container
const renderer = new Sigma(graph, document.getElementById("container"));
```

This creates a graph with three nodes and three edges. Each node has `x` and `y` attributes that set its position in graph space, and sigma automatically adjusts the viewport to fit all nodes.

## How it works

Sigma reads node and edge attributes from the graphology graph instance. By default, it looks for:

- **Nodes**: `x`, `y` (position), `size`, `color`, `label`
- **Edges**: `size`, `color`, `label`

These defaults come from sigma's built-in **styles** declaration, which maps graph attributes to visual properties. You can customize this mapping entirely through the [styles and primitives](/concepts/styles-and-primitives/) system.

## Cleaning up

When you no longer need the renderer (for example, when unmounting a component), call `kill()` to release WebGL resources:

```typescript
renderer.kill();
```

## Next steps

- [Loading data from files](/get-started/loading-data/) -- GEXF, CSV, and JSON
- [Styles and primitives](/concepts/styles-and-primitives/) -- the v4 system for controlling how nodes and edges look
- [Node appearance](/how-to/nodes/colors-sizes-shapes/) -- colors, sizes, and shapes
- [Interactivity](/how-to/interactivity/events/) -- mouse events and hover effects
