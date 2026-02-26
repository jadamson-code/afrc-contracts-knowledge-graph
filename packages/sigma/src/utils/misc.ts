import { PlainObject } from "../types";

const FONT_STYLE_KEYWORDS = new Set(["italic", "oblique"]);
const FONT_WEIGHT_KEYWORDS = new Set(["bold", "bolder", "lighter"]);

/**
 * Parses a CSS-like font string into separate family, weight, and style.
 * Handles strings like "bold Arial, sans-serif" or "italic Georgia, serif".
 * Keywords "normal" are consumed but treated as default.
 */
export function parseFontString(font: string): { family: string; weight: string; style: string } {
  let weight = "normal";
  let style = "normal";

  const trimmed = font.trim();
  // Split only on spaces before the first comma or end of first word-run,
  // to avoid splitting font family lists like "Arial, sans-serif"
  const parts = trimmed.split(/\s+/);

  let familyStart = 0;
  for (let i = 0; i < parts.length; i++) {
    const lower = parts[i].toLowerCase();
    if (FONT_STYLE_KEYWORDS.has(lower)) {
      style = lower;
      familyStart = i + 1;
    } else if (FONT_WEIGHT_KEYWORDS.has(lower) || /^\d{3}$/.test(lower)) {
      weight = lower;
      familyStart = i + 1;
    } else if (lower === "normal") {
      familyStart = i + 1;
    } else {
      break;
    }
  }

  const family = parts.slice(familyStart).join(" ");
  return { family: family || trimmed, weight, style };
}

/**
 * Function used to create DOM elements easily.
 */
export function createElement<T extends HTMLElement>(
  tag: string,
  style?: Partial<CSSStyleDeclaration>,
  attributes?: PlainObject<string>,
): T {
  const element: T = document.createElement(tag) as T;

  if (style) {
    for (const k in style) {
      element.style[k] = style[k] as string;
    }
  }

  if (attributes) {
    for (const k in attributes) {
      element.setAttribute(k, attributes[k]);
    }
  }

  return element;
}

/**
 * Function returning the browser's pixel ratio.
 */
export function getPixelRatio(): number {
  if (typeof window.devicePixelRatio !== "undefined") return window.devicePixelRatio;

  return 1;
}
