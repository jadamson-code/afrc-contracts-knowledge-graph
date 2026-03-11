/**
 * Regression test for texture unit corruption in AttachmentManager.
 *
 * When regenerateAtlas() creates a GL texture it must bind it to a dedicated
 * texture unit, not to whichever unit happens to be active. Otherwise, it
 * overwrites unrelated data-texture bindings (e.g. the edge data texture on
 * unit 4), causing edges to vanish until the next full render rebinds them.
 */
import { describe, expect, test } from "vitest";

import { createTestGL } from "../../../_test-helpers";
import { AttachmentManager } from "./attachment-manager";

describe("AttachmentManager", () => {
  test("regenerateAtlas preserves other texture unit bindings", () => {
    const gl = createTestGL();

    // Bind a sentinel texture to unit 4 (simulates the edge data texture)
    const sentinel = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + 4);
    gl.bindTexture(gl.TEXTURE_2D, sentinel);

    const manager = new AttachmentManager(gl, {}, () => {});

    // Populate cache directly so regenerateAtlas actually creates a GL texture
    const canvas = document.createElement("canvas");
    canvas.width = 10;
    canvas.height = 10;
    canvas.getContext("2d")!.fillRect(0, 0, 10, 10);
    (manager as unknown as Record<string, unknown>).cache = new Map([
      ["n:att", { image: canvas, width: 10, height: 10 }],
    ]);
    (manager as unknown as Record<string, unknown>).dirty = true;

    manager.regenerateAtlas();

    // Unit 4 must still hold the sentinel, not the atlas texture
    gl.activeTexture(gl.TEXTURE0 + 4);
    expect(gl.getParameter(gl.TEXTURE_BINDING_2D)).toBe(sentinel);

    gl.deleteTexture(sentinel);
    manager.kill();
  });
});
