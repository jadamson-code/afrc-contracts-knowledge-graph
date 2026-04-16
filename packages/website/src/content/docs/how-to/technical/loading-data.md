---
title: Load graph data
sidebar:
  label: "Load graph data"
description: How to load graph data from GEXF, CSV, and JSON files.
---

Sigma.js renders a [graphology](https://graphology.github.io/) graph instance. Graphology provides utilities for loading
data from several formats, and you can always build graphs programmatically.

## Loading a GEXF file

[GEXF](https://gexf.net/) is an XML-based graph format commonly used with [Gephi](https://gephi.org/). Use the
`graphology-gexf` package to parse GEXF files:

```bash
npm install graphology-gexf
```

```typescript
import Graph from "graphology";
import { parse } from "graphology-gexf/browser";
import Sigma from "sigma";

fetch("./my-graph.gexf")
  .then((res) => res.text())
  .then((gexf) => {
    const graph = parse(Graph, gexf);
    new Sigma(graph, document.getElementById("container"));
  });
```

The GEXF parser reads node positions, colors, sizes, labels, and any other attributes stored in the file. If your GEXF
file does not contain positions, you will need to apply a
[layout algorithm](https://graphology.github.io/standard-library/layout-forceatlas2.html) before rendering.

## Loading from JSON

Graphology has a built-in serialization format. You can import JSON data that matches this structure using `graph.import()`:

```typescript
import Graph from "graphology";
import Sigma from "sigma";

import data from "./data.json";

const graph = new Graph();
graph.import(data);

new Sigma(graph, document.getElementById("container"));
```

The expected JSON structure looks like this:

```json
{
  "nodes": [
    { "key": "n1", "attributes": { "x": 0, "y": 0, "size": 10, "label": "Node 1", "color": "#e22653" } },
    { "key": "n2", "attributes": { "x": 100, "y": 100, "size": 10, "label": "Node 2", "color": "#666" } }
  ],
  "edges": [{ "source": "n1", "target": "n2", "attributes": { "size": 2 } }]
}
```

You can also export a graph to this format with `graph.export()`.

## Loading from CSV

For CSV data, parse the file with your preferred CSV library (such as [Papa Parse](https://www.papaparse.com/) or
[d3-dsv](https://github.com/d3/d3-dsv)) and build the graph manually:

```typescript
import Graph from "graphology";
import Papa from "papaparse";
import Sigma from "sigma";

// Parse a nodes CSV file and an edges CSV file
const nodesCSV = await fetch("./nodes.csv").then((r) => r.text());
const edgesCSV = await fetch("./edges.csv").then((r) => r.text());

const nodes = Papa.parse(nodesCSV, { header: true }).data;
const edges = Papa.parse(edgesCSV, { header: true }).data;

const graph = new Graph();

for (const node of nodes) {
  graph.addNode(node.id, {
    label: node.label,
    x: parseFloat(node.x),
    y: parseFloat(node.y),
    size: parseFloat(node.size) || 10,
    color: node.color || "#666",
  });
}

for (const edge of edges) {
  graph.addEdge(edge.source, edge.target, {
    size: parseFloat(edge.weight) || 1,
  });
}

new Sigma(graph, document.getElementById("container"));
```

## Building graphs programmatically

You can always build a graph from scratch using graphology's API:

```typescript
import Graph from "graphology";

const graph = new Graph();

graph.addNode("alice", { label: "Alice", x: 0, y: 0, size: 15, color: "#e22653" });
graph.addNode("bob", { label: "Bob", x: 100, y: 100, size: 10, color: "#277da1" });
graph.addEdge("alice", "bob");
```

Refer to the [graphology documentation](https://graphology.github.io/) for the full API.
