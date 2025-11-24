import { PlainObject } from "../types";

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
