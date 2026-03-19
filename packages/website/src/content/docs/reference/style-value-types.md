---
title: Style value types
sidebar:
  label: Style value types
---

Every [style property](/reference/style-properties/) accepts several value forms. This page documents each one.

## Literal

A fixed value applied to all elements.

```typescript
{ color: "#e22653", size: 10, label: "Hello" }
```

## Attribute binding

Reads a value from the element's graphology attributes.

```typescript
{ color: { attribute: "color", defaultValue: "#666" } }
```

| Field          | Type     | Required | Description                       |
| -------------- | -------- | -------- | --------------------------------- |
| `attribute`    | `string` | Yes      | Graphology attribute name to read |
| `defaultValue` | `T`      | No       | Fallback if attribute is missing  |

## Categorical binding

Maps discrete attribute values to outputs via a dictionary.

```typescript
{
  color: {
    attribute: "community",
    dict: { science: "#e22653", art: "#277da1", tech: "#666" },
    defaultValue: "#ccc",
  },
}
```

| Field          | Type                | Required | Description                                  |
| -------------- | ------------------- | -------- | -------------------------------------------- |
| `attribute`    | `string`            | Yes      | Attribute name to read                       |
| `dict`         | `Record<string, T>` | Yes      | Mapping from attribute values to outputs     |
| `defaultValue` | `T`                 | No       | Fallback if attribute value is not in `dict` |

## Numerical binding

Maps a numeric attribute to a min/max output range.

```typescript
{
  size: {
    attribute: "degree",
    min: 3,
    max: 20,
    minValue: 0,
    maxValue: 100,
    easing: "quadraticOut",
  },
}
```

| Field          | Type     | Required | Description                              |
| -------------- | -------- | -------- | ---------------------------------------- |
| `attribute`    | `string` | Yes      | Numeric attribute to read                |
| `min`          | `number` | No       | Output minimum                           |
| `max`          | `number` | No       | Output maximum                           |
| `minValue`     | `number` | No       | Input minimum (values below are clamped) |
| `maxValue`     | `number` | No       | Input maximum (values above are clamped) |
| `defaultValue` | `number` | No       | Fallback if attribute is missing         |
| `easing`       | `Easing` | No       | Interpolation curve (see below)          |

### Easing functions

Named: `"linear"`, `"quadraticIn"`, `"quadraticOut"`, `"quadraticInOut"`, `"cubicIn"`, `"cubicOut"`, `"cubicInOut"`, `"exponentialIn"`, `"exponentialOut"`, `"exponentialInOut"`

Custom: `(t: number) => number` where `t` is 0–1.

## Function

Full control via a callback. Receives the element's attributes, state, graph state, and the graph instance.

```typescript
{
  color: (attributes, state, graphState, graph) => {
    return state.isHovered ? "#e22653" : attributes.color;
  },
}
```

Signature: `(attributes: A, state: S, graphState: GS, graph: AbstractGraph) => T`

## Inline conditional

A concise conditional within a single property.

```typescript
{
  size: {
    when: "isHovered",
    then: 15,
    else: { attribute: "size", defaultValue: 10 },
  },
}
```

| Field  | Type              | Required | Description                                                                    |
| ------ | ----------------- | -------- | ------------------------------------------------------------------------------ |
| `when` | `StatePredicate`  | Yes      | Condition to test (see below)                                                  |
| `then` | `GraphicValue<T>` | Yes      | Value when condition is true (can be any value type except inline conditional) |
| `else` | `GraphicValue<T>` | No       | Value when condition is false                                                  |

## Rule-level conditionals

When you need to change multiple properties based on the same condition, use a rule-level conditional instead of inline conditionals on each property:

```typescript
styles: {
  nodes: [
    { color: { attribute: "color" }, size: { attribute: "size" } },
    {
      when: "isHovered",
      then: { size: 15, labelVisibility: "visible" },
    },
  ],
}
```

Rules are evaluated in order. Later rules override earlier ones for any properties they set.

## State predicates

The `when` clause in both inline and rule-level conditionals supports several forms:

| Form     | Example                                    | Matches when                     |
| -------- | ------------------------------------------ | -------------------------------- |
| String   | `"isHovered"`                              | The named state flag is `true`   |
| Array    | `["isHovered", "isActive"]`                | ALL named flags are `true` (AND) |
| Object   | `{ isHovered: true, isActive: false }`     | All specified values match       |
| Function | `(attrs, state, graphState, graph) => ...` | The function returns `true`      |
