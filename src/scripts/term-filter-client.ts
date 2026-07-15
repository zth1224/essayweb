import { normalizeSearchValue } from "../lib/paper-filter";

export const initializeTermDirectory = () => {
  const directory = document.querySelector<HTMLElement>("[data-term-directory]");
  if (!directory || directory.dataset.initialized) return;
  directory.dataset.initialized = "true";
  const query = directory.querySelector<HTMLInputElement>("[data-term-query]");
  const count = directory.querySelector<HTMLElement>("[data-term-count]");
  const items = [...directory.querySelectorAll<HTMLElement>("[data-term-item]")];

  const apply = () => {
    const needle = normalizeSearchValue(query?.value ?? "");
    let visible = 0;
    for (const item of items) {
      item.hidden = Boolean(needle) && !normalizeSearchValue(item.dataset.search ?? "").includes(needle);
      if (!item.hidden) visible += 1;
    }
    if (count) count.textContent = String(visible);
  };
  query?.addEventListener("input", apply);
  apply();
};
