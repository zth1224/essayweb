import { normalizeSearchValue } from "../lib/paper-filter";

export const initializePaperBrowsers = () => {
  document.querySelectorAll<HTMLElement>("[data-paper-browser]").forEach((browser) => {
    if (browser.dataset.initialized) return;
    browser.dataset.initialized = "true";
    const query = browser.querySelector<HTMLInputElement>("[data-paper-query]");
    const status = browser.querySelector<HTMLSelectElement>("[data-paper-status]");
    const topic = browser.querySelector<HTMLSelectElement>("[data-paper-topic]");
    const clear = browser.querySelector<HTMLButtonElement>("[data-filter-clear]");
    const count = browser.querySelector<HTMLElement>("[data-result-count]");
    const empty = browser.querySelector<HTMLElement>("[data-filter-empty]");
    const cards = [...browser.querySelectorAll<HTMLElement>("[data-paper-card]")];
    const loadMore = browser.querySelector<HTMLButtonElement>("[data-load-more]");
    const pageSize = 24;
    let visibleLimit = pageSize;

    const apply = () => {
      const needle = normalizeSearchValue(query?.value ?? "");
      const selectedStatus = status?.value ?? "all";
      const selectedTopic = topic?.value ?? "all";
      let matched = 0;
      for (const card of cards) {
        const matchesText = !needle || normalizeSearchValue(card.dataset.search ?? "").includes(needle);
        const matchesStatus = selectedStatus === "all" || card.dataset.status === selectedStatus;
        const matchesTopic = selectedTopic === "all" || (card.dataset.topics ?? "").split(" ").includes(selectedTopic);
        const matches = matchesText && matchesStatus && matchesTopic;
        card.hidden = !matches || matched >= visibleLimit;
        if (matches) matched += 1;
      }
      if (count) count.textContent = String(matched);
      if (empty) empty.hidden = matched !== 0;
      if (loadMore) loadMore.hidden = matched <= visibleLimit;
    };

    const resetAndApply = () => { visibleLimit = pageSize; apply(); };

    query?.addEventListener("input", resetAndApply);
    status?.addEventListener("change", resetAndApply);
    topic?.addEventListener("change", resetAndApply);
    loadMore?.addEventListener("click", () => { visibleLimit += pageSize; apply(); });
    clear?.addEventListener("click", () => {
      if (query) query.value = "";
      if (status) status.value = "all";
      if (topic) topic.value = "all";
      resetAndApply();
      query?.focus();
    });
    document.addEventListener("reading-status-change", apply);
    document.querySelectorAll<HTMLElement>("[data-topic-shortcut]").forEach((shortcut) => {
      shortcut.addEventListener("click", (event) => {
        const topicId = shortcut.dataset.topicShortcut;
        if (!topic || !topicId) return;
        event.preventDefault();
        topic.value = topicId;
        resetAndApply();
        browser.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      });
    });
    apply();
  });
};
