import type { ReadingStatus } from "../data/types";

export const READING_STATUS_KEY = "paper-index:reading-status:v1";

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const validStatuses = new Set<ReadingStatus>(["unread", "reading", "read"]);

export const createReadingStatusStore = (storage?: StorageLike) => {
  let state: Record<string, ReadingStatus> = {};

  try {
    const saved = storage?.getItem(READING_STATUS_KEY);
    const parsed = saved ? JSON.parse(saved) : {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      state = Object.fromEntries(
        Object.entries(parsed).filter((entry): entry is [string, ReadingStatus] =>
          typeof entry[0] === "string" && validStatuses.has(entry[1] as ReadingStatus)),
      );
    }
  } catch {
    state = {};
  }

  return {
    get(slug: string, fallback: ReadingStatus): ReadingStatus {
      return state[slug] ?? fallback;
    },
    set(slug: string, status: ReadingStatus): void {
      state = { ...state, [slug]: status };
      try {
        storage?.setItem(READING_STATUS_KEY, JSON.stringify(state));
      } catch {
        // In-memory state remains usable when browser storage is unavailable.
      }
    },
  };
};
