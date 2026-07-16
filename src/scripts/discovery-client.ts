import type { DiscoveryPaper, DiscoverySnapshot, DiscoveryTier, DiscoveryTopicId, StoredDiscoveryDecision } from "../data/discovery-types";
import { safelyGetStorage } from "../lib/reading-status";
import { DISCOVERY_PAGE_SIZE, balanceDiscoveryAgeBands, createDiscoveryDecisionStore, discoveryPersonalizationAdjustment, discoveryTopicLabel, isFormalDiscoveryVenue, normalizeDiscoveryText } from "../lib/discovery";

let initialized = false;
const tierLabels: Record<DiscoveryTier, string> = { priority: "优先精读", skim: "快速浏览", track: "持续关注", archive: "搜索收录" };
const sourceLabels = { arxiv: "arXiv", "semantic-scholar": "Semantic Scholar", openreview: "OpenReview" } as const;

const relevance = (paper: DiscoveryPaper, query: string) => {
  const normalized = normalizeDiscoveryText(query);
  if (!normalized) return 0;
  const title = normalizeDiscoveryText(paper.title);
  const haystack = normalizeDiscoveryText([paper.title, paper.authors.join(" "), paper.abstract, paper.venue ?? "", paper.topicIds.map(discoveryTopicLabel).join(" ")].join(" "));
  const tokens = normalized.split(" ").filter(Boolean);
  if (!tokens.every((token) => haystack.includes(token))) return -1;
  return tokens.reduce((score, token) => score + (title.includes(token) ? 8 : 1), title.includes(normalized) ? 16 : 0);
};

const setText = (root: ParentNode, selector: string, value: string | number) => {
  const element = root.querySelector<HTMLElement>(selector);
  if (element) element.textContent = String(value);
};

export const initializeDiscoveryDesk = async () => {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  const root = document.querySelector<HTMLElement>("[data-discovery-root]");
  if (!root) return;
  const shelf = root.querySelector<HTMLElement>("[data-discovery-shelf]");
  const template = root.querySelector<HTMLTemplateElement>("[data-discovery-card-template]");
  const empty = root.querySelector<HTMLElement>("[data-discovery-empty]");
  const loadMore = root.querySelector<HTMLButtonElement>("[data-discovery-more]");
  if (!shelf || !template || !empty || !loadMore) return;

  const store = createDiscoveryDecisionStore(safelyGetStorage(() => window.localStorage));
  const query = root.querySelector<HTMLInputElement>("[data-discovery-query]");
  const topic = root.querySelector<HTMLSelectElement>("[data-discovery-topic]");
  const age = root.querySelector<HTMLSelectElement>("[data-discovery-age]");
  const dateFrom = root.querySelector<HTMLInputElement>("[data-discovery-date-from]");
  const dateTo = root.querySelector<HTMLInputElement>("[data-discovery-date-to]");
  const venue = root.querySelector<HTMLSelectElement>("[data-discovery-venue]");
  const source = root.querySelector<HTMLSelectElement>("[data-discovery-source]");
  const tier = root.querySelector<HTMLSelectElement>("[data-discovery-tier]");
  const library = root.querySelector<HTMLSelectElement>("[data-discovery-library]");
  const showDismissed = root.querySelector<HTMLInputElement>("[data-show-dismissed]");
  const resultCount = root.querySelector<HTMLElement>("[data-discovery-count]");
  const queueList = root.querySelector<HTMLElement>("[data-queue-list]");
  const queueCount = root.querySelector<HTMLElement>("[data-queue-count]");
  const base = root.dataset.siteBase ?? "/";
  const generatedAt = new Date(root.dataset.generatedAt ?? Date.now());
  let papers: DiscoveryPaper[] = [];
  let visibleLimit = DISCOVERY_PAGE_SIZE;

  const renderCard = (paper: DiscoveryPaper, index: number) => {
    const element = template.content.firstElementChild?.cloneNode(true) as HTMLElement;
    element.dataset.paperId = paper.id;
    element.dataset.title = paper.title;
    element.dataset.sourceUrl = paper.sourceUrl;
    element.dataset.topics = paper.topicIds.join(" ");
    element.dataset.published = paper.publishedAt;
    element.dataset.score = String(paper.score.total);
    element.dataset.reasons = paper.score.reasons.join("；");
    element.style.setProperty("--score", String(paper.score.total));
    if (paper.librarySlug) element.classList.add("discovery-card--collected");
    setText(element, "[data-card-index]", String(index + 1).padStart(3, "0"));
    setText(element, "[data-card-score]", paper.score.total);
    const tierElement = element.querySelector<HTMLElement>("[data-card-tier]");
    if (tierElement) { tierElement.textContent = tierLabels[paper.score.tier]; tierElement.classList.add(`tier--${paper.score.tier}`); }
    setText(element, "[data-card-date]", new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(paper.publishedAt)));
    setText(element, "[data-card-venue]", paper.venue || paper.categories[0] || "Preprint");
    setText(element, "[data-card-title]", paper.title);
    setText(element, "[data-card-authors]", paper.authors.slice(0, 8).join(" · ") || "作者信息待来源补充");
    setText(element, "[data-card-abstract]", paper.abstract || "当前来源未提供摘要，可通过原文页面继续判断。");
    element.querySelectorAll<HTMLAnchorElement>("[data-source-link]").forEach((link) => { link.href = paper.sourceUrl; });
    const topicsElement = element.querySelector<HTMLElement>("[data-card-topics]");
    for (const label of [...paper.topicIds.map(discoveryTopicLabel), ...paper.sources.map((item) => sourceLabels[item])]) {
      const chip = document.createElement("span"); chip.textContent = label; topicsElement?.append(chip);
    }
    setText(element, "[data-score-interest]", paper.score.interest);
    setText(element, "[data-score-evidence]", paper.score.evidence);
    setText(element, "[data-score-freshness]", paper.score.freshness);
    setText(element, "[data-score-completeness]", paper.score.completeness);
    const reasons = element.querySelector<HTMLElement>("[data-card-reasons]");
    for (const reason of paper.score.reasons) { const item = document.createElement("li"); item.textContent = reason; reasons?.append(item); }
    const queueButton = element.querySelector<HTMLElement>("[data-decision-action='queued']");
    const collectedLink = element.querySelector<HTMLAnchorElement>("[data-collected-link]");
    if (paper.librarySlug) {
      if (queueButton) queueButton.hidden = true;
      if (collectedLink) { collectedLink.hidden = false; collectedLink.href = `${base}papers/${paper.librarySlug}/`; }
    }
    return element;
  };

  const updateButtons = () => {
    root.querySelectorAll<HTMLElement>("[data-paper-id]").forEach((element) => {
      const decision = store.get(element.dataset.paperId ?? "");
      element.dataset.decision = decision ?? "";
      element.querySelectorAll<HTMLButtonElement>("[data-decision-action]").forEach((button) => {
        const active = decision === button.dataset.decisionAction;
        button.setAttribute("aria-pressed", String(active));
        if (button.dataset.decisionAction === "queued") button.textContent = active ? "已加入精读" : "加入精读";
        if (button.dataset.decisionAction === "dismissed") button.textContent = active ? "恢复关注" : "暂不关注";
      });
    });
  };

  const renderQueue = () => {
    if (!queueList || !queueCount) return;
    const byId = new Map(papers.map((paper) => [paper.id, paper]));
    const queued = Object.entries(store.all()).filter(([, value]) => value.decision === "queued");
    queueCount.textContent = String(queued.length);
    queueList.replaceChildren();
    if (queued.length === 0) {
      const paragraph = document.createElement("p"); paragraph.className = "queue-empty"; paragraph.textContent = "还没有候选。遇到真正想读的论文，再把它留在这里。"; queueList.append(paragraph); return;
    }
    for (const [id] of queued) {
      const paper = byId.get(id); if (!paper) continue;
      const item = document.createElement("article"); const link = document.createElement("a"); const remove = document.createElement("button");
      link.href = paper.sourceUrl; link.target = "_blank"; link.rel = "noreferrer"; link.textContent = paper.title;
      remove.type = "button"; remove.dataset.queueRemove = id; remove.textContent = "移除"; item.append(link, remove); queueList.append(item);
    }
  };

  const apply = () => {
    const decisions = store.all();
    const topicMap = new Map(papers.map((paper) => [paper.id, { topicIds: paper.topicIds }]));
    const queryValue = query?.value ?? "";
    const ageLimit = age?.value && age.value !== "all" ? Number(age.value) : undefined;
    const now = generatedAt.getTime();
    const matches = papers.map((paper) => ({
      paper,
      relevance: relevance(paper, queryValue),
      score: paper.score.total + discoveryPersonalizationAdjustment({ id: paper.id, topicIds: paper.topicIds }, topicMap, decisions as Record<string, StoredDiscoveryDecision>),
    })).filter(({ paper, relevance: match }) => {
      if (queryValue && match < 0) return false;
      if (topic?.value && topic.value !== "all" && !paper.topicIds.includes(topic.value as DiscoveryTopicId)) return false;
      if (ageLimit && (now - new Date(paper.publishedAt).getTime()) / 86_400_000 > ageLimit) return false;
      const publishedDate = paper.publishedAt.slice(0, 10);
      if (dateFrom?.value && publishedDate < dateFrom.value) return false;
      if (dateTo?.value && publishedDate > dateTo.value) return false;
      if (venue?.value === "formal" && !isFormalDiscoveryVenue(paper.venue)) return false;
      if (venue?.value === "preprint" && isFormalDiscoveryVenue(paper.venue)) return false;
      if (source?.value && source.value !== "all" && !paper.sources.includes(source.value as "arxiv" | "semantic-scholar" | "openreview")) return false;
      if (tier?.value && tier.value !== "all" && paper.score.tier !== tier.value) return false;
      if (library?.value === "new" && paper.librarySlug) return false;
      if (library?.value === "collected" && !paper.librarySlug) return false;
      if (!showDismissed?.checked && decisions[paper.id]?.decision === "dismissed") return false;
      return true;
    }).sort((left, right) => queryValue ? right.relevance - left.relevance || right.score - left.score : right.score - left.score || right.paper.publishedAt.localeCompare(left.paper.publishedAt));
    const orderedPapers = queryValue
      ? matches.map(({ paper }) => paper)
      : balanceDiscoveryAgeBands(matches.map(({ paper }) => paper), generatedAt);

    shelf.replaceChildren(...orderedPapers.slice(0, visibleLimit).map((paper, index) => renderCard(paper, index)), empty, loadMore);
    empty.hidden = matches.length > 0;
    loadMore.hidden = matches.length <= visibleLimit;
    if (resultCount) resultCount.textContent = String(matches.length);
    updateButtons();
  };

  const refresh = () => { renderQueue(); apply(); };

  root.addEventListener("click", async (event) => {
    const target = event.target as HTMLElement;
    const paperElement = target.closest<HTMLElement>("[data-paper-id]");
    const decisionButton = target.closest<HTMLButtonElement>("[data-decision-action]");
    if (decisionButton && paperElement?.dataset.paperId) {
      const id = paperElement.dataset.paperId; const decision = decisionButton.dataset.decisionAction as "queued" | "dismissed";
      if (store.get(id) === decision) store.remove(id); else store.set(id, decision); refresh(); return;
    }
    const remove = target.closest<HTMLButtonElement>("[data-queue-remove]");
    if (remove?.dataset.queueRemove) { store.remove(remove.dataset.queueRemove); refresh(); return; }
    if (target.closest("[data-source-link]") && paperElement?.dataset.paperId && !store.get(paperElement.dataset.paperId)) { store.set(paperElement.dataset.paperId, "seen"); updateButtons(); }
    if (target.closest("[data-filter-clear]")) {
      if (query) query.value = ""; [topic, age, venue, source, tier, library].forEach((select) => { if (select) select.value = "all"; }); [dateFrom, dateTo].forEach((input) => { if (input) input.value = ""; }); if (showDismissed) showDismissed.checked = false; visibleLimit = DISCOVERY_PAGE_SIZE; apply();
    }
    if (target.closest("[data-discovery-more]")) { visibleLimit += DISCOVERY_PAGE_SIZE; apply(); }
    const exportButton = target.closest<HTMLButtonElement>("[data-queue-export]");
    const copyButton = target.closest<HTMLButtonElement>("[data-queue-copy]");
    if (exportButton || copyButton) {
      const byId = new Map(papers.map((paper) => [paper.id, paper]));
      const queued = Object.entries(store.all()).filter(([, value]) => value.decision === "queued").map(([id]) => byId.get(id)).filter((paper): paper is DiscoveryPaper => Boolean(paper));
      const markdown = ["# 待精读论文", "", ...queued.flatMap((paper) => [`- [${paper.title}](${paper.sourceUrl})`, `  - 推荐理由：${paper.score.reasons.join("；") || "来自论文发现工作台"}`])].join("\n");
      if (copyButton) { await navigator.clipboard.writeText(queued.map((paper) => paper.sourceUrl).join("\n")); copyButton.textContent = "已复制"; }
      else { const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "paper-reading-queue.md"; anchor.click(); URL.revokeObjectURL(url); }
    }
  });

  [query, topic, age, dateFrom, dateTo, venue, source, tier, library, showDismissed].forEach((control) => control?.addEventListener("input", () => { visibleLimit = DISCOVERY_PAGE_SIZE; apply(); }));

  try {
    const response = await fetch(root.dataset.discoveryUrl ?? "");
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    papers = (await response.json() as DiscoverySnapshot).papers;
    refresh();
    root.dataset.discoveryReady = "true";
  } catch (error) {
    console.error("Discovery index could not be loaded; keeping the server-rendered first page.", error);
    updateButtons(); renderQueue();
  }
};
