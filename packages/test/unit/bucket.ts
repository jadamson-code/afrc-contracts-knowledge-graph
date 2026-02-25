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
  const STRIDE = 5;

  beforeEach(() => {
    collection = new BucketCollection(MAX_Z_INDEX, STRIDE);
  });

  describe("getBucket", () => {
    test("returns a bucket for valid zIndex", () => {
      expect(collection.getBucket(0)).not.toBeNull();
      expect(collection.getBucket(5)).not.toBeNull();
    });

    test("clamps zIndex to valid range", () => {
      const bucketNegative = collection.getBucket(-5);
      const bucketZero = collection.getBucket(0);
      expect(bucketNegative).toBe(bucketZero);

      const bucketHigh = collection.getBucket(100);
      const bucketMax = collection.getBucket(MAX_Z_INDEX - 1);
      expect(bucketHigh).toBe(bucketMax);
    });
  });

  describe("addItem / removeItem", () => {
    test("adds item to correct bucket", () => {
      collection.addItem(5, "node1");
      expect(collection.getBucket(5)?.hasItem("node1")).toBe(true);
      expect(collection.getBucket(0)?.hasItem("node1")).toBe(false);
    });

    test("removes item from bucket", () => {
      collection.addItem(5, "node1");
      collection.removeItem(5, "node1");
      expect(collection.getBucket(5)?.hasItem("node1")).toBe(false);
    });
  });

  describe("moveItem", () => {
    test("moves item between zIndex levels", () => {
      collection.addItem(0, "node1");

      // Clear dirty flags
      collection.getBucket(0)?.clearDirtyFlag();

      collection.moveItem(0, 10, "node1");

      expect(collection.getBucket(0)?.hasItem("node1")).toBe(false);
      expect(collection.getBucket(10)?.hasItem("node1")).toBe(true);

      // Both buckets should be dirty
      expect(collection.getBucket(0)?.isDirty).toBe(true);
      expect(collection.getBucket(10)?.isDirty).toBe(true);
    });
  });

  describe("updateItem", () => {
    test("marks containing bucket as dirty", () => {
      collection.addItem(5, "node1");
      collection.getBucket(5)?.clearDirtyFlag();

      collection.updateItem(5, "node1");
      expect(collection.getBucket(5)?.isDirty).toBe(true);
    });
  });

  describe("clearAll", () => {
    test("clears all buckets", () => {
      collection.addItem(0, "node1");
      collection.addItem(5, "edge1");

      collection.clearAll();

      expect(collection.getBucket(0)?.count).toBe(0);
      expect(collection.getBucket(5)?.count).toBe(0);
    });
  });

  describe("forEachBucketByZIndex", () => {
    test("iterates buckets in zIndex order (back-to-front)", () => {
      collection.addItem(0, "node1");
      collection.addItem(10, "node2");
      collection.addItem(5, "edge1");

      const order: number[] = [];
      collection.forEachBucketByZIndex((zIndex) => {
        order.push(zIndex);
      });

      // Should be in zIndex order
      expect(order.length).toBe(3);
      expect(order[0]).toBe(0);
      expect(order[1]).toBe(5);
      expect(order[2]).toBe(10);
    });

    test("skips empty buckets", () => {
      collection.addItem(5, "node1");

      let count = 0;
      collection.forEachBucketByZIndex(() => {
        count++;
      });

      expect(count).toBe(1);
    });
  });

  describe("rebuildDirtyBuckets", () => {
    test("rebuilds only dirty buckets", () => {
      collection.addItem(0, "node1");
      collection.addItem(5, "node2");

      // Clear dirty flag for bucket at z=0
      collection.getBucket(0)?.clearDirtyFlag();

      const rebuiltItems: string[] = [];
      collection.rebuildDirtyBuckets((key, _startIndex, _array) => {
        rebuiltItems.push(key);
      });

      // Only bucket at z=5 should have been rebuilt (it was dirty)
      expect(rebuiltItems).toEqual(["node2"]);

      // Both buckets should now be clean
      expect(collection.getBucket(0)?.isDirty).toBe(false);
      expect(collection.getBucket(5)?.isDirty).toBe(false);
    });

    test("does not rebuild clean buckets", () => {
      collection.addItem(0, "node1");
      collection.getBucket(0)?.clearDirtyFlag();

      let processItemCalled = false;
      collection.rebuildDirtyBuckets(() => {
        processItemCalled = true;
      });

      expect(processItemCalled).toBe(false);
    });
  });

  describe("hasDirtyBuckets", () => {
    test("returns true when any bucket is dirty", () => {
      collection.addItem(0, "node1");
      expect(collection.hasDirtyBuckets()).toBe(true);
    });

    test("returns false when no bucket is dirty", () => {
      collection.addItem(0, "node1");
      collection.getBucket(0)?.clearDirtyFlag();
      expect(collection.hasDirtyBuckets()).toBe(false);
    });
  });

  describe("setMaxDepthLevels", () => {
    test("increases depth levels by adding buckets", () => {
      const smallCollection = new BucketCollection(10, 1);
      smallCollection.addItem(5, "item1");

      smallCollection.setMaxDepthLevels(20);

      expect(smallCollection.getMaxDepthLevels()).toBe(20);
      // Old item still exists
      expect(smallCollection.getBucket(5)?.hasItem("item1")).toBe(true);
      // New high bucket accessible
      expect(smallCollection.getBucket(15)).not.toBeNull();
    });

    test("decreases depth levels and moves items to highest bucket", () => {
      const largeCollection = new BucketCollection(20, 1);
      largeCollection.addItem(15, "item1");
      largeCollection.addItem(5, "item2");

      largeCollection.setMaxDepthLevels(10);

      expect(largeCollection.getMaxDepthLevels()).toBe(10);
      // Item that was above limit moved to highest bucket
      expect(largeCollection.getBucket(9)?.hasItem("item1")).toBe(true);
      // Item within range stays put
      expect(largeCollection.getBucket(5)?.hasItem("item2")).toBe(true);
    });

    test("does nothing when setting same value", () => {
      collection.addItem(0, "item1");
      collection.getBucket(0)?.clearDirtyFlag();

      collection.setMaxDepthLevels(MAX_Z_INDEX);

      // Should not mark dirty since nothing changed
      expect(collection.getBucket(0)?.isDirty).toBe(false);
    });

    test("constructor accepts custom maxDepthLevels", () => {
      const customCollection = new BucketCollection(5, 1);
      expect(customCollection.getMaxDepthLevels()).toBe(5);
      // Should clamp to max
      expect(customCollection.getBucket(10)).toBe(customCollection.getBucket(4));
    });
  });
});
