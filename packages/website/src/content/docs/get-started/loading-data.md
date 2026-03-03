---
title: Loading data
description: How to load graph data from GEXF, CSV, and JSON files.
---

:::caution[Work in progress]
This page is being written for sigma.js v4.
:::

## Loading a GEXF file

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

## Loading from JSON

```typescript
import Graph from "graphology";
import Sigma from "sigma";
import data from "./data.json";

const graph = new Graph();
graph.import(data);
new Sigma(graph, document.getElementById("container"));
```

## Loading from CSV

For CSV data, you typically need to parse the file and build the graph manually using graphology's API. See the [layouts example](/examples/layouts/) for a complete walkthrough.
