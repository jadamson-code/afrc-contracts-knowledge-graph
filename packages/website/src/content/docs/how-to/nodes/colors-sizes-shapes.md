---
title: Colors, sizes, and shapes
sidebar:
  label: "Colors, sizes & shapes"
---

Sigma.js reads node colors, sizes, and shapes from graph attributes. You control the mapping between attributes and visual properties through `styles`, and declare available shapes through `primitives`.

## Setting colors and sizes

The simplest approach reads `color` and `size` directly from graph attributes:

```typescript
import Graph from "graphology";
import Sigma from "sigma";

const graph = new Graph();
graph.addNode("a", { x: 0, y: 0, size: 15, color: "#e22653", label: "Node A" });
graph.addNode("b", { x: 1, y: 1, size: 25, color: "#0055ff", label: "Node B" });

new Sigma(graph, container, {
  styles: {
    nodes: [{ color: { attribute: "color" }, size: { attribute: "size" } }],
  },
});
```

You can also set fixed values that apply to all nodes:

```typescript
styles: {
  nodes: [
    { color: "#e22653", size: 10 },
  ],
}
```

Or mix fixed defaults with attribute overrides. Style rules are evaluated in order, and later values override earlier ones:

```typescript
styles: {
  nodes: [
    { color: "#cccccc", size: 10 },
    { color: { attribute: "color" }, size: { attribute: "size" } },
  ],
}
```

## Using different shapes

By default, sigma renders all nodes as circles. To use other shapes, declare them in `primitives.nodes.shapes` and assign shapes to nodes via a style rule:

```typescript
import { sdfCircle, sdfDiamond, sdfSquare, sdfTriangle } from "sigma/rendering";

new Sigma(graph, container, {
  primitives: {
    nodes: {
      shapes: [sdfCircle(), sdfSquare(), sdfTriangle(), sdfDiamond()],
    },
  },
  styles: {
    nodes: [
      {
        color: { attribute: "color" },
        size: { attribute: "size" },
        shape: { attribute: "shape" },
      },
    ],
  },
});
```

Each node's `shape` attribute should be one of the declared shape names:

```typescript
graph.addNode("a", { x: 0, y: 0, size: 15, color: "#e22653", shape: "circle" });
graph.addNode("b", { x: 1, y: 1, size: 20, color: "#0055ff", shape: "square" });
graph.addNode("c", { x: 2, y: 0, size: 15, color: "#33cc33", shape: "triangle" });
graph.addNode("d", { x: 3, y: 1, size: 20, color: "#ff9900", shape: "diamond" });
```

The available built-in shapes are `sdfCircle()`, `sdfSquare()`, `sdfTriangle()`, and `sdfDiamond()`.

## Setting a fixed shape for all nodes

If you want all nodes to use a single non-default shape, declare just that shape and set it as a fixed value in styles:

```typescript
import { sdfSquare } from "sigma/rendering";

new Sigma(graph, container, {
  primitives: {
    nodes: {
      shapes: [sdfSquare()],
    },
  },
  styles: {
    nodes: [{ shape: "square", color: { attribute: "color" }, size: { attribute: "size" } }],
  },
});
```

## Conditional styles

You can change appearance based on node state. For example, grey out nodes that are not active:

```typescript
styles: {
  nodes: [
    { color: { attribute: "color" }, size: { attribute: "size" } },
    {
      when: (attrs, state, graphState) => graphState.hasActiveSubgraph && !state.isActive,
      then: { color: "#f6f6f6" },
    },
  ],
}
```

See [Hover and search highlight](/how-to/interactivity/hover-search/) for a full example of conditional styling.
