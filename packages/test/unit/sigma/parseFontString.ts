import { parseFontString } from "sigma/utils";
import { describe, expect, test } from "vitest";

describe("parseFontString", () => {
  test("it should return a plain family string as-is", () => {
    expect(parseFontString("Arial")).toEqual({ family: "Arial", weight: "normal", style: "normal" });
    expect(parseFontString("sans-serif")).toEqual({ family: "sans-serif", weight: "normal", style: "normal" });
  });

  test("it should handle comma-separated font family lists", () => {
    expect(parseFontString("Arial, sans-serif")).toEqual({
      family: "Arial, sans-serif",
      weight: "normal",
      style: "normal",
    });
    expect(parseFontString("'Courier New', monospace")).toEqual({
      family: "'Courier New', monospace",
      weight: "normal",
      style: "normal",
    });
  });

  test("it should extract bold weight", () => {
    expect(parseFontString("bold Arial, sans-serif")).toEqual({
      family: "Arial, sans-serif",
      weight: "bold",
      style: "normal",
    });
  });

  test("it should extract italic style", () => {
    expect(parseFontString("italic Georgia, serif")).toEqual({
      family: "Georgia, serif",
      weight: "normal",
      style: "italic",
    });
  });

  test("it should extract both weight and style", () => {
    expect(parseFontString("italic bold Arial")).toEqual({
      family: "Arial",
      weight: "bold",
      style: "italic",
    });
    expect(parseFontString("bold italic Arial")).toEqual({
      family: "Arial",
      weight: "bold",
      style: "italic",
    });
  });

  test("it should handle numeric font weights", () => {
    expect(parseFontString("700 Arial")).toEqual({ family: "Arial", weight: "700", style: "normal" });
    expect(parseFontString("300 Georgia, serif")).toEqual({
      family: "Georgia, serif",
      weight: "300",
      style: "normal",
    });
  });

  test("it should handle 'normal' keyword as a no-op prefix", () => {
    expect(parseFontString("normal Arial")).toEqual({ family: "Arial", weight: "normal", style: "normal" });
    expect(parseFontString("normal normal Arial")).toEqual({ family: "Arial", weight: "normal", style: "normal" });
  });

  test("it should handle oblique style", () => {
    expect(parseFontString("oblique Verdana")).toEqual({ family: "Verdana", weight: "normal", style: "oblique" });
  });

  test("it should handle bolder and lighter weights", () => {
    expect(parseFontString("bolder Arial")).toEqual({ family: "Arial", weight: "bolder", style: "normal" });
    expect(parseFontString("lighter Arial")).toEqual({ family: "Arial", weight: "lighter", style: "normal" });
  });

  test("it should trim whitespace", () => {
    expect(parseFontString("  bold Arial  ")).toEqual({ family: "Arial", weight: "bold", style: "normal" });
  });

  test("it should fall back to the full string when only keywords are present", () => {
    expect(parseFontString("bold")).toEqual({ family: "bold", weight: "bold", style: "normal" });
  });
});
