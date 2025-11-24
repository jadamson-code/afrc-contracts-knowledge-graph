import { Bucket, BucketCollection, clampZIndex } from "sigma/rendering";
import { DEFAULT_SETTINGS } from "sigma/settings";
import { beforeEach, describe, expect, test } from "vitest";

const MAX_Z_INDEX = DEFAULT_SETTINGS.maxDepthLevels;

describe("clampZIndex utility", () => {
  test("clamps negative values to 0", () => {
    expect(clampZIndex(-1, MAX_Z_INDEX)).toBe(0);
    expect(clampZIndex(-100, MAX_Z_INDEX)).toBe(0);
  });

  test("clamps values above MAX_Z_INDEX to MAX_Z_INDEX-1", () => {
    expect(clampZIndex(MAX_Z_INDEX, MAX_Z_INDEX)).toBe(MAX_Z_INDEX - 1);
    expect(clampZIndex(100, MAX_Z_INDEX)).toBe(MAX_Z_INDEX - 1);
  });

  test("returns floored values within range", () => {
    expect(clampZIndex(0, MAX_Z_INDEX)).toBe(0);
    expect(clampZIndex(5, MAX_Z_INDEX)).toBe(5);
    expect(clampZIndex(5.7, MAX_Z_INDEX)).toBe(5);
    expect(clampZIndex(MAX_Z_INDEX - 1, MAX_Z_INDEX)).toBe(MAX_Z_INDEX - 1);
  });

  test("works with custom maxDepthLevels", () => {
    expect(clampZIndex(5, 10)).toBe(5);
    expect(clampZIndex(15, 10)).toBe(9);
    expect(clampZIndex(-1, 10)).toBe(0);
    expect(clampZIndex(2.7, 10)).toBe(2);
  });
});

describe("Bucket class", () => {
  let bucket: Bucket;
  const STRIDE = 2;

  beforeEach(() => {
    bucket = new Bucket(STRIDE);
  });

  describe("addItem", () => {
    test("adds an item and marks bucket as dirty", () => {
      expect(bucket.isDirty).toBe(false);
      bucket.addItem("node1");
      expect(bucket.isDirty).toBe(true);
      expect(bucket.count).toBe(1);
      expect(bucket.hasItem("node1")).toBe(true);
    });

    test("does not add duplicate items", () => {
      bucket.addItem("node1");
      bucket.addItem("node1");
      expect(bucket.count).toBe(1);
    });

    test("does not mark dirty when adding existing item", () => {
      bucket.addItem("node1");
      bucket.clearDirtyFlag();
      bucket.addItem("node1");
      expect(bucket.isDirty).toBe(false);
    });
  });

  describe("removeItem", () => {
    test("removes an item and marks bucket as dirty", () => {
      bucket.addItem("node1");
      bucket.clearDirtyFlag();

      bucket.removeItem("node1");
      expect(bucket.isDirty).toBe(true);
      expect(bucket.count).toBe(0);
      expect(bucket.hasItem("node1")).toBe(false);
    });

    test("does not mark dirty when removing non-existent item", () => {
      expect(bucket.isDirty).toBe(false);
      bucket.removeItem("nonexistent");
      expect(bucket.isDirty).toBe(false);
    });
  });

  describe("updateItem", () => {
    test("marks bucket as dirty for existing item", () => {
      bucket.addItem("node1");
      bucket.clearDirtyFlag();

      bucket.updateItem("node1");
      expect(bucket.isDirty).toBe(true);
    });

    test("does not mark dirty for non-existent item", () => {
      expect(bucket.isDirty).toBe(false);
      bucket.updateItem("nonexistent");
      expect(bucket.isDirty).toBe(false);
    });
  });

  describe("clear", () => {
    test("removes all items and marks bucket as dirty", () => {
      bucket.addItem("node1");
      bucket.addItem("node2");
      bucket.clearDirtyFlag();

      bucket.clear();
      expect(bucket.isDirty).toBe(true);
      expect(bucket.count).toBe(0);
    });

    test("does not mark dirty when already empty", () => {
      expect(bucket.isDirty).toBe(false);
      bucket.clear();
      expect(bucket.isDirty).toBe(false);
    });
  });

  describe("rebuild", () => {
    test("rebuilds Float32Array and clears dirty flag", () => {
      bucket.addItem("node1");
      bucket.addItem("node2");

      expect(bucket.getFloatArray().length).toBe(0);

      const processItem = (key: string, startIndex: number, array: Float32Array) => {
        const value = key === "node1" ? 1 : 2;
        for (let i = 0; i < STRIDE; i++) {
          array[startIndex + i] = value * 10 + i;
        }
      };

      bucket.rebuild(processItem);

      expect(bucket.isDirty).toBe(false);
      expect(bucket.getFloatArray().length).toBeGreaterThanOrEqual(2 * STRIDE);
    });

    test("produces compacted array with no holes", () => {
      bucket.addItem("node1");
      bucket.addItem("node2");
      bucket.addItem("node3");
      bucket.removeItem("node2");

      const processItem = (key: string, startIndex: number, array: Float32Array) => {
        const numberKey = +key.replace(/^node/, "");
        for (let i = 0; i < STRIDE; i++) {
          array[startIndex + i] = numberKey;
        }
      };

      bucket.rebuild(processItem);

      // Should start with the expected data (might be larger though, because of capacity management)
      const array = Array.from(bucket.getFloatArray());
      expect(array.slice(0, 2 * STRIDE)).toEqual([1, 1, 3, 3]);
    });

    test("reallocates array when capacity changes significantly", () => {
      // Add many items
      for (let i = 0; i < 100; i++) {
        bucket.addItem(`node${i}`);
      }

      bucket.rebuild((_key, _startIndex, _array) => {});
      const initialLength = bucket.getFloatArray().length;

      // Remove most items
      for (let i = 10; i < 100; i++) {
        bucket.removeItem(`node${i}`);
      }

      bucket.rebuild((_key, _startIndex, _array) => {});
      const finalLength = bucket.getFloatArray().length;

      // Array should have shrunk
      expect(finalLength).toBeLessThan(initialLength);
    });
  });

  describe("getItems", () => {
    test("returns a copy of items", () => {
      bucket.addItem("node1");
      bucket.addItem("node2");

      const items = bucket.getItems();
      expect(items.size).toBe(2);
      expect(items.has("node1")).toBe(true);
      expect(items.has("node2")).toBe(true);

      // Modifying the returned set should not affect the bucket
      items.delete("node1");
      expect(bucket.hasItem("node1")).toBe(true);
    });
  });

  describe("markDirty", () => {
    test("marks bucket as dirty", () => {
      expect(bucket.isDirty).toBe(false);
      bucket.markDirty();
      expect(bucket.isDirty).toBe(true);
    });
  });
});

describe("BucketCollection class", () => {
  let collection: BucketCollection;
  const NODE_STRIDE = 5;
  const EDGE_STRIDE = 6;

  beforeEach(() => {
    collection = new BucketCollection(MAX_Z_INDEX);
    collection.registerProgram("nodeCircle", NODE_STRIDE);
    collection.registerProgram("edgeLine", EDGE_STRIDE);
  });

  describe("registerProgram", () => {
    test("creates buckets for all zIndex levels", () => {
      for (let z = 0; z < MAX_Z_INDEX; z++) {
        const bucket = collection.getBucket("nodeCircle", z);
        expect(bucket).not.toBeNull();
      }
    });

    test("does not overwrite existing program", () => {
      collection.addItem("nodeCircle", 0, "node1");
      collection.registerProgram("nodeCircle", 10); // Different stride
      expect(collection.getBucket("nodeCircle", 0)?.hasItem("node1")).toBe(true);
    });
  });

  describe("getBucket", () => {
    test("returns null for unregistered program", () => {
      expect(collection.getBucket("unknown", 0)).toBeNull();
    });

    test("clamps zIndex to valid range", () => {
      const bucketNegative = collection.getBucket("nodeCircle", -5);
      const bucketZero = collection.getBucket("nodeCircle", 0);
      expect(bucketNegative).toBe(bucketZero);

      const bucketHigh = collection.getBucket("nodeCircle", 100);
      const bucketMax = collection.getBucket("nodeCircle", MAX_Z_INDEX - 1);
      expect(bucketHigh).toBe(bucketMax);
    });
  });

  describe("addItem / removeItem", () => {
    test("adds item to correct bucket", () => {
      collection.addItem("nodeCircle", 5, "node1");
      expect(collection.getBucket("nodeCircle", 5)?.hasItem("node1")).toBe(true);
      expect(collection.getBucket("nodeCircle", 0)?.hasItem("node1")).toBe(false);
    });

    test("removes item from bucket", () => {
      collection.addItem("nodeCircle", 5, "node1");
      collection.removeItem("nodeCircle", 5, "node1");
      expect(collection.getBucket("nodeCircle", 5)?.hasItem("node1")).toBe(false);
    });
  });

  describe("moveItem", () => {
    test("moves item between zIndex levels within same program", () => {
      collection.addItem("nodeCircle", 0, "node1");

      // Clear dirty flags
      collection.getBucket("nodeCircle", 0)?.clearDirtyFlag();

      collection.moveItem("nodeCircle", 0, "nodeCircle", 10, "node1");

      expect(collection.getBucket("nodeCircle", 0)?.hasItem("node1")).toBe(false);
      expect(collection.getBucket("nodeCircle", 10)?.hasItem("node1")).toBe(true);

      // Both buckets should be dirty
      expect(collection.getBucket("nodeCircle", 0)?.isDirty).toBe(true);
      expect(collection.getBucket("nodeCircle", 10)?.isDirty).toBe(true);
    });

    test("moves item between different program types", () => {
      collection.addItem("nodeCircle", 5, "node1");

      // Clear dirty flags
      collection.getBucket("nodeCircle", 5)?.clearDirtyFlag();

      collection.moveItem("nodeCircle", 5, "edgeLine", 3, "node1");

      expect(collection.getBucket("nodeCircle", 5)?.hasItem("node1")).toBe(false);
      expect(collection.getBucket("edgeLine", 3)?.hasItem("node1")).toBe(true);

      // Both buckets should be dirty
      expect(collection.getBucket("nodeCircle", 5)?.isDirty).toBe(true);
      expect(collection.getBucket("edgeLine", 3)?.isDirty).toBe(true);
    });
  });

  describe("updateItem", () => {
    test("marks containing bucket as dirty", () => {
      collection.addItem("nodeCircle", 5, "node1");
      collection.getBucket("nodeCircle", 5)?.clearDirtyFlag();

      collection.updateItem("nodeCircle", 5, "node1");
      expect(collection.getBucket("nodeCircle", 5)?.isDirty).toBe(true);
    });
  });

  describe("clearProgram", () => {
    test("clears all buckets for a program type", () => {
      collection.addItem("nodeCircle", 0, "node1");
      collection.addItem("nodeCircle", 5, "node2");
      collection.addItem("edgeLine", 0, "edge1");

      collection.clearProgram("nodeCircle");

      expect(collection.getBucket("nodeCircle", 0)?.count).toBe(0);
      expect(collection.getBucket("nodeCircle", 5)?.count).toBe(0);
      expect(collection.getBucket("edgeLine", 0)?.count).toBe(1);
    });
  });

  describe("clearAll", () => {
    test("clears all buckets", () => {
      collection.addItem("nodeCircle", 0, "node1");
      collection.addItem("edgeLine", 5, "edge1");

      collection.clearAll();

      expect(collection.getBucket("nodeCircle", 0)?.count).toBe(0);
      expect(collection.getBucket("edgeLine", 5)?.count).toBe(0);
    });
  });

  describe("forEachBucketByZIndex", () => {
    test("iterates buckets in zIndex order (back-to-front)", () => {
      collection.addItem("nodeCircle", 0, "node1");
      collection.addItem("nodeCircle", 10, "node2");
      collection.addItem("edgeLine", 5, "edge1");

      const order: Array<[string, number]> = [];
      collection.forEachBucketByZIndex((programType, zIndex) => {
        order.push([programType, zIndex]);
      });

      // Should be in zIndex order
      expect(order.length).toBe(3);
      expect(order[0][1]).toBe(0); // z=0 first
      expect(order[1][1]).toBe(5); // z=5 second
      expect(order[2][1]).toBe(10); // z=10 third
    });

    test("skips empty buckets", () => {
      collection.addItem("nodeCircle", 5, "node1");

      let count = 0;
      collection.forEachBucketByZIndex(() => {
        count++;
      });

      expect(count).toBe(1);
    });
  });

  describe("rebuildDirtyBuckets", () => {
    test("rebuilds only dirty buckets", () => {
      // Use a fresh collection for this test
      const testCollection = new BucketCollection(MAX_Z_INDEX);
      testCollection.registerProgram("nodeCircle", NODE_STRIDE);

      testCollection.addItem("nodeCircle", 0, "node1");
      testCollection.addItem("nodeCircle", 5, "node2");

      // Clear dirty flag for bucket at z=0
      testCollection.getBucket("nodeCircle", 0)?.clearDirtyFlag();

      const rebuiltItems: string[] = [];
      testCollection.rebuildDirtyBuckets(() => {
        return (key, _startIndex, _array) => {
          rebuiltItems.push(key);
        };
      });

      // Only bucket at z=5 should have been rebuilt (it was dirty)
      expect(rebuiltItems).toEqual(["node2"]);

      // Both buckets should now be clean
      expect(testCollection.getBucket("nodeCircle", 0)?.isDirty).toBe(false);
      expect(testCollection.getBucket("nodeCircle", 5)?.isDirty).toBe(false);
    });

    test("does not rebuild clean buckets", () => {
      // Use a fresh collection for this test
      const testCollection = new BucketCollection(MAX_Z_INDEX);
      testCollection.registerProgram("nodeCircle", NODE_STRIDE);

      testCollection.addItem("nodeCircle", 0, "node1");
      testCollection.getBucket("nodeCircle", 0)?.clearDirtyFlag();

      let processItemCalled = false;
      testCollection.rebuildDirtyBuckets(() => {
        return () => {
          processItemCalled = true;
        };
      });

      expect(processItemCalled).toBe(false);
    });
  });

  describe("hasDirtyBuckets", () => {
    test("returns true when any bucket is dirty", () => {
      collection.addItem("nodeCircle", 0, "node1");
      expect(collection.hasDirtyBuckets()).toBe(true);
    });

    test("returns false when no bucket is dirty", () => {
      collection.addItem("nodeCircle", 0, "node1");
      collection.getBucket("nodeCircle", 0)?.clearDirtyFlag();
      expect(collection.hasDirtyBuckets()).toBe(false);
    });
  });

  describe("getProgramTypes", () => {
    test("returns all registered program types", () => {
      const types = collection.getProgramTypes();
      expect(types).toContain("nodeCircle");
      expect(types).toContain("edgeLine");
      expect(types.length).toBe(2);
    });
  });

  describe("setMaxDepthLevels", () => {
    test("increases depth levels by adding buckets", () => {
      const smallCollection = new BucketCollection(10);
      smallCollection.registerProgram("test", 1);
      smallCollection.addItem("test", 5, "item1");

      smallCollection.setMaxDepthLevels(20);

      expect(smallCollection.getMaxDepthLevels()).toBe(20);
      // Old item still exists
      expect(smallCollection.getBucket("test", 5)?.hasItem("item1")).toBe(true);
      // New high bucket accessible
      expect(smallCollection.getBucket("test", 15)).not.toBeNull();
    });

    test("decreases depth levels and moves items to highest bucket", () => {
      const largeCollection = new BucketCollection(20);
      largeCollection.registerProgram("test", 1);
      largeCollection.addItem("test", 15, "item1");
      largeCollection.addItem("test", 5, "item2");

      largeCollection.setMaxDepthLevels(10);

      expect(largeCollection.getMaxDepthLevels()).toBe(10);
      // Item that was above limit moved to highest bucket
      expect(largeCollection.getBucket("test", 9)?.hasItem("item1")).toBe(true);
      // Item within range stays put
      expect(largeCollection.getBucket("test", 5)?.hasItem("item2")).toBe(true);
    });

    test("does nothing when setting same value", () => {
      collection.addItem("nodeCircle", 0, "item1");
      collection.getBucket("nodeCircle", 0)?.clearDirtyFlag();

      collection.setMaxDepthLevels(MAX_Z_INDEX);

      // Should not mark dirty since nothing changed
      expect(collection.getBucket("nodeCircle", 0)?.isDirty).toBe(false);
    });

    test("constructor accepts custom maxDepthLevels", () => {
      const customCollection = new BucketCollection(5);
      expect(customCollection.getMaxDepthLevels()).toBe(5);
      customCollection.registerProgram("test", 1);
      // Should clamp to max
      expect(customCollection.getBucket("test", 10)).toBe(customCollection.getBucket("test", 4));
    });
  });
});
