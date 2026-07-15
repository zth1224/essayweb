import { beforeEach, describe, expect, test } from "vitest";
import {
  READING_STATUS_KEY,
  createReadingStatusStore,
  safelyGetStorage,
} from "../../src/lib/reading-status";

describe("reading status store", () => {
  beforeEach(() => localStorage.clear());

  test("falls back when the browser blocks access to the localStorage getter", () => {
    expect(safelyGetStorage(() => { throw new DOMException("Blocked", "SecurityError"); })).toBeUndefined();
  });

  test("persists status changes in browser storage", () => {
    const store = createReadingStatusStore(localStorage);
    store.set("demo-ai-01", "read");

    expect(localStorage.getItem(READING_STATUS_KEY)).toContain('"demo-ai-01":"read"');
    expect(createReadingStatusStore(localStorage).get("demo-ai-01", "unread")).toBe("read");
  });

  test("ignores malformed saved data", () => {
    localStorage.setItem(READING_STATUS_KEY, "not-json");
    const store = createReadingStatusStore(localStorage);

    expect(store.get("demo-ai-01", "reading")).toBe("reading");
  });

  test("falls back to memory when storage throws", () => {
    const unavailableStorage = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    };
    const store = createReadingStatusStore(unavailableStorage);

    store.set("demo-ai-01", "read");
    expect(store.get("demo-ai-01", "unread")).toBe("read");
  });
});
