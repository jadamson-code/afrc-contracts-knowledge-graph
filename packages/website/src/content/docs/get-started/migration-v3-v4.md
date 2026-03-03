---
title: Migrating from v3 to v4
description: What changed between sigma.js v3 and v4, and how to migrate.
---

:::caution[Work in progress]
This migration guide is being written as v4 development continues. It covers the major changes but may not be exhaustive yet.
:::

## What's removed

- **`nodeProgramClasses` / `edgeProgramClasses` settings** — replaced by the [primitives system](/concepts/styles-and-primitives/)
- **`defaultNodeType` / `defaultEdgeType` settings** — node and edge rendering is now configured through primitives and layers
- **`zIndex` attribute** — replaced by depth layers in the styles system
- **`hidden` / `forceLabel` attributes** — replaced by style rules with `when` predicates
- **Standalone node/edge packages** (like `@sigma/node-square`) — these are now integrated as layer factories in the primitives system

## What's added

- **[Styles system](/concepts/styles-and-primitives/)** — declarative visual rules based on state, replacing most reducer use cases
- **[State management](/how-to/interactivity/hover-search/)** — `setNodeState`, `setEdgeState`, `setGraphState` for UI state without touching graph data
- **Primitives and layers** — composable node rendering with shapes, borders, images, piecharts as layers
- **Depth layers** — control rendering order of highlighted vs. background elements
- **Custom shapes** — built-in support for circle, square, triangle, diamond shapes

## Migration steps

1. Replace `nodeProgramClasses` with the `primitives` configuration
2. Replace `nodeReducer` / `edgeReducer` with `styles` rules where possible (keep reducers only for complex logic)
3. Replace external state management with `setNodeState` / `setGraphState`
4. Replace `zIndex` with depth layers
5. Update imports from removed packages
