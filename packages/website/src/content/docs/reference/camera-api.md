---
title: Camera API
sidebar:
  label: Camera API
---

The camera controls what portion of the graph is visible. Access it via `renderer.getCamera()`.

## State

The camera state has four properties:

```typescript
interface CameraState {
  x: number; // Horizontal position (0–1 normalized, 0.5 = center)
  y: number; // Vertical position (0–1 normalized, 0.5 = center)
  angle: number; // Rotation in radians
  ratio: number; // Zoom level (smaller = more zoomed in)
}
```

## State access

| Method               | Returns               | Description                               |
| -------------------- | --------------------- | ----------------------------------------- |
| `getState()`         | `CameraState`         | Get the current camera state              |
| `getPreviousState()` | `CameraState \| null` | Get the state before the last change      |
| `hasState(state)`    | `boolean`             | Check if the camera matches a given state |

## State updates

| Method              | Returns | Description                                                       |
| ------------------- | ------- | ----------------------------------------------------------------- |
| `setState(partial)` | `this`  | Update state immediately. Emits `"updated"` event                 |
| `updateState(fn)`   | `this`  | Update state using a function: `fn(currentState) => partialState` |

## Animation

```typescript
// Promise-based
await camera.animate({ x: 0.5, y: 0.5, ratio: 0.5 });

// With options
await camera.animate({ ratio: 0.2 }, { duration: 1000, easing: "cubicInOut" });

// Callback-based
camera.animate({ x: 0.5 }, { duration: 500 }, () => console.log("done"));
```

### AnimateOptions

| Property   | Type     | Default            | Description                 |
| ---------- | -------- | ------------------ | --------------------------- |
| `duration` | `number` | `150`              | Animation duration in ms    |
| `easing`   | `Easing` | `"quadraticInOut"` | Easing function (see below) |

### Easing options

Named easings: `"linear"`, `"quadraticIn"`, `"quadraticOut"`, `"quadraticInOut"`, `"cubicIn"`, `"cubicOut"`, `"cubicInOut"`

Custom easing: any `(t: number) => number` function where `t` goes from 0 to 1.

## Convenience methods

| Method                    | Returns         | Description                                                                      |
| ------------------------- | --------------- | -------------------------------------------------------------------------------- |
| `animatedZoom(factor?)`   | `Promise<void>` | Zoom in by factor (default: 1.5). Also accepts `{ factor?, duration?, easing? }` |
| `animatedUnzoom(factor?)` | `Promise<void>` | Zoom out by factor (default: 1.5)                                                |
| `animatedReset(opts?)`    | `Promise<void>` | Animate to default state (x=0.5, y=0.5, angle=0, ratio=1)                        |
| `isAnimated()`            | `boolean`       | Check if an animation is currently running                                       |

## Lifecycle

| Method      | Returns  | Description                                    |
| ----------- | -------- | ---------------------------------------------- |
| `enable()`  | `this`   | Enable camera updates                          |
| `disable()` | `this`   | Disable all camera updates                     |
| `copy()`    | `Camera` | Create an independent copy with the same state |

## Bounds

| Property   | Type             | Description                                           |
| ---------- | ---------------- | ----------------------------------------------------- |
| `minRatio` | `number \| null` | Minimum zoom level (set via `minCameraRatio` setting) |
| `maxRatio` | `number \| null` | Maximum zoom level (set via `maxCameraRatio` setting) |

| Method                   | Returns                | Description                           |
| ------------------------ | ---------------------- | ------------------------------------- |
| `getBoundedRatio(ratio)` | `number`               | Constrain a ratio to min/max bounds   |
| `validateState(partial)` | `Partial<CameraState>` | Validate and constrain a state change |

## Events

The camera emits a single event:

```typescript
camera.on("updated", (state: CameraState) => {
  // Camera state changed
});
```
