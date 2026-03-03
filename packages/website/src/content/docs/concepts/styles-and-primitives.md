---
title: Styles and primitives
description: The v4 declarative system for controlling how nodes and edges look.
---

:::caution[Work in progress]
This is the most important new concept in sigma.js v4 and this page is being written.
:::

The styles and primitives system is sigma v4's primary mechanism for controlling visual appearance. It replaces the old `nodeProgramClasses` / `edgeProgramClasses` approach with a declarative, composable system.

## Styles

Styles are ordered rules that determine how nodes and edges look based on their attributes and state:

```typescript
styles: {
  nodes: [
    // Base style: read from graph attributes
    { color: { attribute: "color" }, size: { attribute: "size" } },
    // Conditional: highlight hovered nodes
    { when: "isHovered", then: { labelVisibility: "visible" } },
  ],
}
```

## Primitives

Primitives define the rendering pipeline — what shapes are available and what layers compose a node's appearance:

```typescript
primitives: {
  nodes: {
    shapes: ["circle", "square", "triangle", "diamond"],
    layers: [
      { type: "fill", color: { attribute: "backgroundColor" } },
      { type: "border", borders: [{ size: 0.1, color: "#333" }] },
      { type: "image", imageAttribute: "image" },
    ],
  },
}
```

## Key concepts

- **Layers** compose a node's visual appearance (fill, border, image, piechart)
- **Shapes** define the geometric outline (circle, square, triangle, diamond)
- **State** is managed separately from graph data via `setNodeState` / `setGraphState`
- **Conditional rules** use `when` predicates to apply styles based on state
- **Depth layers** control rendering order for highlighted vs. background elements

See the [hover and search highlight](/how-to/interactivity/hover-search/) guide for a practical example.
