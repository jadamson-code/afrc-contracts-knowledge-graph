import { DepthRanges, addPositionToDepthRanges, removePositionFromDepthRanges } from "sigma/utils";
import { describe, expect, test } from "vitest";

describe("removePositionFromDepthRanges", () => {
  test("removes a single-item fragment entirely", () => {
    const ranges: DepthRanges = { nodes: [{ offset: 5, count: 1 }] };
    removePositionFromDepthRanges(ranges, "nodes", 5);
    expect(ranges.nodes).toEqual([]);
  });

  test("trims from the start of a fragment", () => {
    const ranges: DepthRanges = { nodes: [{ offset: 3, count: 5 }] };
    removePositionFromDepthRanges(ranges, "nodes", 3);
    expect(ranges.nodes).toEqual([{ offset: 4, count: 4 }]);
  });

  test("trims from the end of a fragment", () => {
    const ranges: DepthRanges = { nodes: [{ offset: 3, count: 5 }] };
    removePositionFromDepthRanges(ranges, "nodes", 7);
    expect(ranges.nodes).toEqual([{ offset: 3, count: 4 }]);
  });

  test("splits a fragment in two", () => {
    const ranges: DepthRanges = { nodes: [{ offset: 0, count: 10 }] };
    removePositionFromDepthRanges(ranges, "nodes", 5);
    expect(ranges.nodes).toEqual([
      { offset: 0, count: 5 },
      { offset: 6, count: 4 },
    ]);
  });

  test("no-ops on missing depth", () => {
    const ranges: DepthRanges = {};
    removePositionFromDepthRanges(ranges, "nodes", 0);
    expect(ranges).toEqual({});
  });

  test("no-ops when position is outside all fragments", () => {
    const ranges: DepthRanges = { nodes: [{ offset: 0, count: 3 }] };
    removePositionFromDepthRanges(ranges, "nodes", 5);
    expect(ranges.nodes).toEqual([{ offset: 0, count: 3 }]);
  });
});

describe("addPositionToDepthRanges", () => {
  test("creates a new depth and fragment", () => {
    const ranges: DepthRanges = {};
    addPositionToDepthRanges(ranges, "topNodes", 5);
    expect(ranges.topNodes).toEqual([{ offset: 5, count: 1 }]);
  });

  test("merges with the end of the previous fragment", () => {
    const ranges: DepthRanges = { nodes: [{ offset: 0, count: 5 }] };
    addPositionToDepthRanges(ranges, "nodes", 5);
    expect(ranges.nodes).toEqual([{ offset: 0, count: 6 }]);
  });

  test("merges with the start of the next fragment", () => {
    const ranges: DepthRanges = { nodes: [{ offset: 5, count: 3 }] };
    addPositionToDepthRanges(ranges, "nodes", 4);
    expect(ranges.nodes).toEqual([{ offset: 4, count: 4 }]);
  });

  test("bridges two adjacent fragments", () => {
    const ranges: DepthRanges = {
      nodes: [
        { offset: 0, count: 3 },
        { offset: 4, count: 3 },
      ],
    };
    addPositionToDepthRanges(ranges, "nodes", 3);
    expect(ranges.nodes).toEqual([{ offset: 0, count: 7 }]);
  });

  test("inserts between non-adjacent fragments", () => {
    const ranges: DepthRanges = {
      nodes: [
        { offset: 0, count: 2 },
        { offset: 8, count: 2 },
      ],
    };
    addPositionToDepthRanges(ranges, "nodes", 5);
    expect(ranges.nodes).toEqual([
      { offset: 0, count: 2 },
      { offset: 5, count: 1 },
      { offset: 8, count: 2 },
    ]);
  });
});

describe("remove then add (round-trip)", () => {
  test("punching a hole and filling it restores the original range", () => {
    const ranges: DepthRanges = { nodes: [{ offset: 0, count: 100 }] };
    removePositionFromDepthRanges(ranges, "nodes", 50);
    expect(ranges.nodes).toEqual([
      { offset: 0, count: 50 },
      { offset: 51, count: 49 },
    ]);
    addPositionToDepthRanges(ranges, "nodes", 50);
    expect(ranges.nodes).toEqual([{ offset: 0, count: 100 }]);
  });

  test("moving a position between depths", () => {
    const ranges: DepthRanges = {
      nodes: [{ offset: 0, count: 10 }],
    };
    // Move position 5 from "nodes" to "topNodes"
    removePositionFromDepthRanges(ranges, "nodes", 5);
    addPositionToDepthRanges(ranges, "topNodes", 5);
    expect(ranges.nodes).toEqual([
      { offset: 0, count: 5 },
      { offset: 6, count: 4 },
    ]);
    expect(ranges.topNodes).toEqual([{ offset: 5, count: 1 }]);

    // Move it back
    removePositionFromDepthRanges(ranges, "topNodes", 5);
    addPositionToDepthRanges(ranges, "nodes", 5);
    expect(ranges.nodes).toEqual([{ offset: 0, count: 10 }]);
    expect(ranges.topNodes).toEqual([]);
  });
});
