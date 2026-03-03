---
title: Camera controls
sidebar:
  label: "Controls"
---

Sigma's camera controls what portion of the graph is visible on screen. You can enable or disable user interactions, set zoom and pan boundaries, and animate the camera programmatically.

## Enabling and disabling interactions

Three settings control how users can manipulate the camera:

```typescript
new Sigma(graph, container, {
  settings: {
    enableCameraZooming: true,   // Scroll to zoom (default: true)
    enableCameraPanning: true,   // Drag to pan (default: true)
    enableCameraRotation: true,  // Rotate gesture (default: true)
  },
});
```

Set any of these to `false` to lock that interaction. For example, to create a fixed-viewport display with no user controls:

```typescript
new Sigma(graph, container, {
  settings: {
    enableCameraZooming: false,
    enableCameraPanning: false,
    enableCameraRotation: false,
  },
});
```

## Zoom boundaries

Constrain how far users can zoom in or out with `minCameraRatio` and `maxCameraRatio`. The camera ratio represents the visible fraction of the graph -- smaller values mean more zoomed in:

```typescript
new Sigma(graph, container, {
  settings: {
    minCameraRatio: 0.1,  // Maximum zoom in (10x)
    maxCameraRatio: 2,    // Maximum zoom out (0.5x)
  },
});
```

Both default to `null` (no limit).

## Pan boundaries

Prevent users from panning the camera too far away from the graph with `cameraPanBoundaries`:

```typescript
new Sigma(graph, container, {
  settings: {
    cameraPanBoundaries: { tolerance: 0.2 },
  },
});
```

The `tolerance` value controls how far past the graph bounding box the user can pan, as a fraction of the viewport. A value of `0.2` allows panning 20% beyond the graph edges.

Set `cameraPanBoundaries: true` to use the default tolerance. Set it to `null` (default) to disable pan boundaries entirely.

You can also specify explicit boundaries:

```typescript
new Sigma(graph, container, {
  settings: {
    cameraPanBoundaries: {
      boundaries: { x: [0, 1], y: [0, 1] },
    },
  },
});
```

## Programmatic camera control

### Animated transitions

Use `renderer.getCamera().animate()` to smoothly transition the camera to a new state:

```typescript
const camera = renderer.getCamera();

// Pan and zoom to a specific position
camera.animate({ x: 0.5, y: 0.5, ratio: 0.5 });

// Rotate 45 degrees
camera.animate({ angle: Math.PI / 4 });

// With custom animation options
camera.animate(
  { x: 0.3, y: 0.7, ratio: 0.2 },
  { duration: 1000 },
);
```

The `animate()` method returns a `Promise` that resolves when the animation completes. Camera coordinates use the normalized coordinate system where `(0.5, 0.5)` is the center of the graph.

### Quick actions

The camera also provides shorthand methods:

```typescript
const camera = renderer.getCamera();

// Reset to default view (center, no zoom, no rotation)
camera.animatedReset();

// Zoom in / out by a factor
camera.animatedZoom(2);    // 2x zoom in
camera.animatedUnzoom(2);  // 2x zoom out
```

### Instant updates

For immediate (non-animated) changes, use `setState`:

```typescript
camera.setState({ x: 0.5, y: 0.5, ratio: 1, angle: 0 });
```

## Updating settings at runtime

Use `renderer.setSettings()` to change camera settings after initialization. This is useful for toggling user controls based on application state:

```typescript
// Disable zooming temporarily
renderer.setSettings({ enableCameraZooming: false });

// Re-enable it later
renderer.setSettings({ enableCameraZooming: true });

// Update zoom limits dynamically
renderer.setSettings({ minCameraRatio: 0.5, maxCameraRatio: 3 });
```

Only the settings you pass are updated; all others remain unchanged.
