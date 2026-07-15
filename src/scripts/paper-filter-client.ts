import { normalizeSearchValue } from "../lib/paper-filter";

export const initializePaperBrowsers = () => {
  document.querySelectorAll<HTMLElement>("[data-paper-browser]").forEach((browser) => {
    if (browser.dataset.initialized) return;
    browser.dataset.initialized = "true";
    const query = browser.querySelector<HTMLInputElement>("[data-paper-query]");
    const status = browser.querySelector<HTMLSelectElement>("[data-paper-status]");
    const clear = browser.querySelector<HTMLButtonElement>("[data-filter-clear]");
    const count = browser.querySelector<HTMLElement>("[data-result-count]");
    const empty = browser.querySelector<HTMLElement>("[data-filter-empty]");
    const cards = [...browser.querySelectorAll<HTMLElement>("[data-paper-card]")];

    const apply = () => {
      const needle = normalizeSearchValue(query?.value ?? "");
      const selectedStatus = status?.value ?? "all";
      let visible = 0;
      for (const card of cards) {
        const matchesText = !needle || normalizeSearchValue(card.dataset.search ?? "").includes(needle);
        const matchesStatus = selectedStatus === "all" || card.dataset.status === selectedStatus;
        card.hidden = !(matchesText && matchesStatus);
        if (!card.hidden) visible += 1;
      }
      if (count) count.textContent = String(visible);
      if (empty) empty.hidden = visible !== 0;
    };

    query?.addEventListener("input", apply);
    status?.addEventListener("change", apply);
    clear?.addEventListener("click", () => {
      if (query) query.value = "";
      if (status) status.value = "all";
      apply();
      query?.focus();
    });
    document.addEventListener("reading-status-change", apply);
    apply();
  });
};
