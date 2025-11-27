import { colorToGLSLString, parseColor } from "sigma/utils";
import { describe, expect, test } from "vitest";

describe("parseColor", () => {
  test("it should parse 6-digit hex colors", () => {
    expect(parseColor("#ff0000")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColor("#00ff00")).toEqual({ r: 0, g: 255, b: 0, a: 1 });
    expect(parseColor("#0000ff")).toEqual({ r: 0, g: 0, b: 255, a: 1 });
    expect(parseColor("#ffffff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor("#000000")).toEqual({ r: 0, g: 0, b: 0, a: 1 });
  });

  test("it should parse 3-digit hex colors", () => {
    expect(parseColor("#f00")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColor("#0f0")).toEqual({ r: 0, g: 255, b: 0, a: 1 });
    expect(parseColor("#00f")).toEqual({ r: 0, g: 0, b: 255, a: 1 });
    expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor("#000")).toEqual({ r: 0, g: 0, b: 0, a: 1 });
  });

  test("it should parse 8-digit hex colors with alpha", () => {
    expect(parseColor("#ff0000ff")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColor("#ff000080")).toEqual({ r: 255, g: 0, b: 0, a: 128 / 255 });
    expect(parseColor("#ff000000")).toEqual({ r: 255, g: 0, b: 0, a: 0 });
  });

  test("it should parse rgb() notation", () => {
    expect(parseColor("rgb(255, 0, 0)")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColor("rgb(0, 255, 0)")).toEqual({ r: 0, g: 255, b: 0, a: 1 });
    expect(parseColor("rgb(0, 0, 255)")).toEqual({ r: 0, g: 0, b: 255, a: 1 });
    expect(parseColor("rgb(128, 64, 32)")).toEqual({ r: 128, g: 64, b: 32, a: 1 });
  });

  test("it should parse rgba() notation", () => {
    expect(parseColor("rgba(255, 0, 0, 1)")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColor("rgba(255, 0, 0, 0.5)")).toEqual({ r: 255, g: 0, b: 0, a: 0.5 });
    expect(parseColor("rgba(255, 0, 0, 0)")).toEqual({ r: 255, g: 0, b: 0, a: 0 });
    expect(parseColor("rgba(128, 64, 32, 0.75)")).toEqual({ r: 128, g: 64, b: 32, a: 0.75 });
  });
});

describe("colorToGLSLString", () => {
  test("it should convert hex colors to GLSL vec4", () => {
    expect(colorToGLSLString("#ff0000")).toBe("vec4(1.000000, 0.000000, 0.000000, 1.000000)");
    expect(colorToGLSLString("#00ff00")).toBe("vec4(0.000000, 1.000000, 0.000000, 1.000000)");
    expect(colorToGLSLString("#0000ff")).toBe("vec4(0.000000, 0.000000, 1.000000, 1.000000)");
    expect(colorToGLSLString("#ffffff")).toBe("vec4(1.000000, 1.000000, 1.000000, 1.000000)");
    expect(colorToGLSLString("#000000")).toBe("vec4(0.000000, 0.000000, 0.000000, 1.000000)");
  });

  test("it should convert 3-digit hex colors to GLSL vec4", () => {
    expect(colorToGLSLString("#f00")).toBe("vec4(1.000000, 0.000000, 0.000000, 1.000000)");
    expect(colorToGLSLString("#0f0")).toBe("vec4(0.000000, 1.000000, 0.000000, 1.000000)");
    expect(colorToGLSLString("#00f")).toBe("vec4(0.000000, 0.000000, 1.000000, 1.000000)");
  });

  test("it should convert 8-digit hex colors with alpha to GLSL vec4", () => {
    expect(colorToGLSLString("#ff0000ff")).toBe("vec4(1.000000, 0.000000, 0.000000, 1.000000)");
    expect(colorToGLSLString("#ff000080")).toBe("vec4(1.000000, 0.000000, 0.000000, 0.501961)");
    expect(colorToGLSLString("#ff000000")).toBe("vec4(1.000000, 0.000000, 0.000000, 0.000000)");
  });

  test("it should convert HTML color names to GLSL vec4", () => {
    expect(colorToGLSLString("red")).toBe("vec4(1.000000, 0.000000, 0.000000, 1.000000)");
    expect(colorToGLSLString("green")).toBe("vec4(0.000000, 0.501961, 0.000000, 1.000000)"); // #008000
    expect(colorToGLSLString("blue")).toBe("vec4(0.000000, 0.000000, 1.000000, 1.000000)");
    expect(colorToGLSLString("white")).toBe("vec4(1.000000, 1.000000, 1.000000, 1.000000)");
    expect(colorToGLSLString("black")).toBe("vec4(0.000000, 0.000000, 0.000000, 1.000000)");
  });

  test("it should be case-insensitive for HTML color names", () => {
    expect(colorToGLSLString("RED")).toBe("vec4(1.000000, 0.000000, 0.000000, 1.000000)");
    expect(colorToGLSLString("Red")).toBe("vec4(1.000000, 0.000000, 0.000000, 1.000000)");
    expect(colorToGLSLString("BLUE")).toBe("vec4(0.000000, 0.000000, 1.000000, 1.000000)");
  });

  test("it should convert rgb() notation to GLSL vec4", () => {
    expect(colorToGLSLString("rgb(255, 0, 0)")).toBe("vec4(1.000000, 0.000000, 0.000000, 1.000000)");
    expect(colorToGLSLString("rgb(0, 255, 0)")).toBe("vec4(0.000000, 1.000000, 0.000000, 1.000000)");
    expect(colorToGLSLString("rgb(128, 128, 128)")).toBe("vec4(0.501961, 0.501961, 0.501961, 1.000000)");
  });

  test("it should convert rgba() notation to GLSL vec4", () => {
    expect(colorToGLSLString("rgba(255, 0, 0, 1)")).toBe("vec4(1.000000, 0.000000, 0.000000, 1.000000)");
    expect(colorToGLSLString("rgba(255, 0, 0, 0.5)")).toBe("vec4(1.000000, 0.000000, 0.000000, 0.500000)");
    expect(colorToGLSLString("rgba(255, 0, 0, 0)")).toBe("vec4(1.000000, 0.000000, 0.000000, 0.000000)");
  });

  test("it should handle mixed-case hex values", () => {
    expect(colorToGLSLString("#FF0000")).toBe("vec4(1.000000, 0.000000, 0.000000, 1.000000)");
    expect(colorToGLSLString("#Ff0000")).toBe("vec4(1.000000, 0.000000, 0.000000, 1.000000)");
    expect(colorToGLSLString("#aAbBcC")).toBe("vec4(0.666667, 0.733333, 0.800000, 1.000000)");
  });

  test("it should produce valid GLSL float format with decimal points", () => {
    const result = colorToGLSLString("#808080");
    // Should contain decimal points for valid GLSL floats
    expect(result).toMatch(/vec4\(\d+\.\d+, \d+\.\d+, \d+\.\d+, \d+\.\d+\)/);
    // Gray (128) should be approximately 0.5
    expect(result).toBe("vec4(0.501961, 0.501961, 0.501961, 1.000000)");
  });
});
