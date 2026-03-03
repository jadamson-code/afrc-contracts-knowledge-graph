---
title: Quickstart
description: Install sigma.js and render your first graph.
---

:::caution[Work in progress]
This page is being rewritten for sigma.js v4. The content below is a placeholder.
:::

## Installation

```bash
npm install graphology sigma
```

## Minimal example

```typescript
import Graph from "graphology";
import Sigma from "sigma";

const graph = new Graph();
graph.addNode("1", { label: "Node 1", x: 0, y: 0, size: 10, color: "#e22653" });
graph.addNode("2", { label: "Node 2", x: 1, y: 1, size: 10, color: "#666" });
graph.addEdge("1", "2", { size: 2 });

const renderer = new Sigma(graph, document.getElementById("container"));
```

This creates a minimal graph with two nodes and one edge. The `x` and `y` attributes position the nodes, and sigma automatically adjusts the viewport to fit.

## Next steps

- [Loading data from files](/get-started/loading-data/) — GEXF, CSV, and JSON
- [Node appearance](/how-to/nodes/colors-sizes-shapes/) — colors, sizes, and shapes
- [Interactivity](/how-to/interactivity/events/) — mouse events and hover effects
