import type { ReadingStatus } from "../data/types";
import { createReadingStatusStore } from "../lib/reading-status";

let initialized = false;

export const initializeReadingStatusControls = () => {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  const store = createReadingStatusStore(window.localStorage);

  document.querySelectorAll<HTMLSelectElement>("[data-reading-status]").forEach((select) => {
    const slug = select.dataset.paperSlug;
    const fallback = select.dataset.defaultStatus as ReadingStatus | undefined;
    if (!slug || !fallback) return;

    const applyStatus = (status: ReadingStatus) => {
      select.value = status;
      const card = select.closest<HTMLElement>("[data-paper-card]");
      if (card) card.dataset.status = status;
    };

    applyStatus(store.get(slug, fallback));
    select.addEventListener("change", () => {
      const status = select.value as ReadingStatus;
      store.set(slug, status);
      applyStatus(status);
      document.dispatchEvent(new CustomEvent("reading-status-change", { detail: { slug, status } }));
    });
  });
};
