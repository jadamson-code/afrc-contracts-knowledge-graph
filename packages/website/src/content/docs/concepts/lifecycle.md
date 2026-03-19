---
title: Lifecycle
description: How a sigma instance is created, renders, and is destroyed.
---

This page explains what happens from the moment you create a sigma instance to the moment you destroy it, and how the rendering pipeline works.

## Instantiation

A sigma instance requires three things:

- **A graphology graph** — the data source. Sigma listens to graphology events and re-renders when the graph changes.
- **A DOM container** — must have explicit dimensions (width and height). Sigma creates its WebGL canvas and interaction layer inside it.
- **Options (optional)** — `primitives`, `styles`, `settings`, `nodeReducer`, `edgeReducer`.

The graph can be replaced later with `setGraph()`.

## The rendering pipeline

Rendering happens in two phases:

1. **Process** — Sigma evaluates style rules against graph attributes and element state, runs reducers, computes display data for every node and edge, and uploads the results to the GPU via data textures.
2. **Render** — Sigma issues WebGL draw calls for each depth layer, sorted by z-index. Labels, backdrops, and extremities are all drawn in the same pass.

Processing is expensive (it touches every element). Rendering is cheap (it reuses the GPU buffers from the last process). Sigma only re-processes when data or state changes — camera movements only trigger a render.

## Automatic triggers

Sigma re-renders automatically when:

- **The graph changes** — graphology emits events for node/edge additions, removals, and attribute changes.
- **State changes** — `setNodeState`, `setEdgeState`, or `setGraphState` schedule a render.
- **Settings change** — `setSetting` or `setSettings` schedule a full refresh.
- **The user interacts** — mouse and touch events update the camera, which triggers a render.
- **The container resizes** — sigma detects size changes and re-renders.

## Manual triggers

Three methods let you trigger rendering manually:

| Method              | What it does                                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `refresh()`         | Process + render immediately. Accepts `{ skipIndexation }` to skip spatial index recomputation, and `{ partialGraph }` to process only specific nodes/edges. |
| `scheduleRefresh()` | Debounced: schedules a `refresh()` for the next animation frame. Multiple calls in the same frame are coalesced.                                             |
| `scheduleRender()`  | Debounced: schedules a render-only (no re-processing) for the next frame.                                                                                    |

Use `scheduleRefresh()` when updating state in a loop (e.g., animation). Use `refresh({ skipIndexation: true })` after state changes that don't affect positions. Use `scheduleRender()` when only the camera changed.

## Termination

Call `kill()` to destroy the instance. This releases all WebGL resources, removes event listeners, and cleans up DOM elements. After `kill()`, the instance cannot be reused.
