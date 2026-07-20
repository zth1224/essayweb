import type {
  DiscoveryPaper,
  DiscoverySnapshot,
  DiscoveryTier,
  DiscoveryTopicId,
  StoredDiscoveryDecision,
} from "../data/discovery-types";
import { fields } from "../data/fields";
import type { FieldId } from "../data/types";
import { safelyGetStorage } from "../lib/reading-status";
import {
  DISCOVERY_PAGE_SIZE,
  balanceDiscoveryAgeBands,
  createDiscoveryDecisionStore,
  discoveryPersonalizationAdjustment,
  discoveryPublicationLabel,
  discoveryTopicLabel,
  discoveryTopicsForField,
  normalizeDiscoveryText,
  selectDiscoveryFeatured,
} from "../lib/discovery";

let initialized = false;
const queuePaperKey = "paper-index:discovery-queue-papers:v1";
const tierLabels: Record<DiscoveryTier, string> = { priority: "优先精读", skim: "快速浏览", track: "持续关注", archive: "搜索收录" };
const tierWeight: Record<DiscoveryTier, number> = { priority: 3, skim: 2, track: 1, archive: 0 };
const sourceLabels = { arxiv: "arXiv", "semantic-scholar": "Semantic Scholar", openreview: "OpenReview" } as const;
const fieldById = new Map(fields.map((field) => [field.id, field]));

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

const formatDate = (value: string, withTime = false) => new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: withTime ? "long" : "2-digit",
  day: "2-digit",
  ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
}).format(new Date(value));

export const initializeDiscoveryDesk = async () => {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  const root = document.querySelector<HTMLElement>("[data-discovery-root]");
  if (!root) return;
  const shelf = root.querySelector<HTMLElement>("[data-discovery-shelf]");
  const template = root.querySelector<HTMLTemplateElement>("[data-discovery-card-template]");
  const empty = root.querySelector<HTMLElement>("[data-discovery-empty]");
  const loadMore = root.querySelector<HTMLButtonElement>("[data-discovery-more]");
  const featuredShelf = root.querySelector<HTMLElement>("[data-featured-shelf]");
  const featuredEmpty = root.querySelector<HTMLElement>("[data-featured-empty]");
  if (!shelf || !template || !empty || !loadMore || !featuredShelf || !featuredEmpty) return;

  const storage = safelyGetStorage(() => window.localStorage);
  const store = createDiscoveryDecisionStore(storage);
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
  const warning = root.querySelector<HTMLElement>("[data-source-warning]");
  const warningList = root.querySelector<HTMLElement>("[data-warning-list]");
  const fieldButtons = [...root.querySelectorAll<HTMLButtonElement>("[data-discovery-field]")];
  const base = root.dataset.siteBase ?? "/";
  let currentField = (root.dataset.currentField ?? "embodied-intelligence") as FieldId;
  let generatedAt = new Date(root.dataset.generatedAt ?? Date.now());
  let currentSeedCount = 0;
  let papers: DiscoveryPaper[] = [];
  let visibleLimit = DISCOVERY_PAGE_SIZE;
  const snapshots = new Map<FieldId, DiscoverySnapshot>();
  const knownPapers = new Map<string, DiscoveryPaper>();
  let queuePaperCache: Record<string, DiscoveryPaper> = {};
  try {
    const saved = storage?.getItem(queuePaperKey);
    const parsed = saved ? JSON.parse(saved) : {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) queuePaperCache = parsed as Record<string, DiscoveryPaper>;
  } catch { queuePaperCache = {}; }

  const persistQueuePapers = () => {
    try { storage?.setItem(queuePaperKey, JSON.stringify(queuePaperCache)); } catch { /* local decisions still work */ }
  };

  const personalizationTopicMap = () => new Map(
    [...knownPapers.values(), ...Object.values(queuePaperCache)]
      .map((paper) => [paper.id, { topicIds: paper.topicIds }] as const),
  );

  const localAdjustmentFor = (paper: DiscoveryPaper) => discoveryPersonalizationAdjustment(
    { id: paper.id, topicIds: paper.topicIds },
    personalizationTopicMap(),
    store.all() as Record<string, StoredDiscoveryDecision>,
  );

  const renderCard = (paper: DiscoveryPaper, index: number, featured = false) => {
    const element = template.content.firstElementChild?.cloneNode(true) as HTMLElement;
    element.dataset.paperId = paper.id;
    element.dataset.title = paper.title;
    element.dataset.sourceUrl = paper.sourceUrl;
    element.dataset.topics = paper.topicIds.join(" ");
    element.dataset.published = paper.publishedAt;
    element.dataset.score = String(paper.score.baseTotal);
    element.dataset.evidence = String(paper.score.evidence);
    element.dataset.venue = paper.publicationStatus;
    element.dataset.reasons = paper.score.reasons.join("；");
    element.style.setProperty("--score", String(paper.score.baseTotal));
    element.style.setProperty("--rank", String(index + 1));
    if (featured) { element.classList.add("discovery-card--featured"); element.dataset.discoveryFeature = ""; }
    if (paper.librarySlug) element.classList.add("discovery-card--collected");
    setText(element, "[data-card-index]", String(index + 1).padStart(3, "0"));
    setText(element, "[data-card-score]", paper.score.baseTotal);
    const tierElement = element.querySelector<HTMLElement>("[data-card-tier]");
    if (tierElement) { tierElement.textContent = tierLabels[paper.score.tier]; tierElement.classList.add(`tier--${paper.score.tier}`); }
    setText(element, "[data-card-date]", formatDate(paper.publishedAt));
    setText(element, "[data-card-venue]", paper.venue || paper.categories[0] || "Preprint");
    const publicationElement = element.querySelector<HTMLElement>("[data-card-publication]");
    if (publicationElement) {
      publicationElement.textContent = discoveryPublicationLabel(paper.publicationStatus);
      publicationElement.classList.add(`publication--${paper.publicationStatus}`);
    }
    setText(element, "[data-card-title]", paper.title);
    setText(element, "[data-card-authors]", paper.authors.slice(0, featured ? 5 : 8).join(" · ") || "作者信息待来源补充");
    setText(element, "[data-card-abstract]", paper.abstract || "当前来源未提供摘要，可通过原文页面继续判断。");
    element.querySelectorAll<HTMLAnchorElement>("[data-source-link]").forEach((link) => { link.href = paper.sourceUrl; });
    const topicsElement = element.querySelector<HTMLElement>("[data-card-topics]");
    for (const label of [...paper.topicIds.map(discoveryTopicLabel), ...paper.sources.map((item) => sourceLabels[item])]) {
      const chip = document.createElement("span"); chip.textContent = label; topicsElement?.append(chip);
    }
    setText(element, "[data-score-relevance]", paper.score.relevance);
    setText(element, "[data-score-evidence]", paper.score.evidence);
    setText(element, "[data-score-freshness]", paper.score.freshness);
    setText(element, "[data-score-completeness]", paper.score.completeness);
    setText(element, "[data-evidence-publication]", paper.score.evidenceBreakdown.publication);
    setText(element, "[data-evidence-citations]", paper.score.evidenceBreakdown.citations);
    setText(element, "[data-evidence-reproducibility]", paper.score.evidenceBreakdown.reproducibility);
    setText(element, "[data-evidence-empirical]", paper.score.evidenceBreakdown.empirical);
    setText(element, "[data-evidence-corroboration]", paper.score.evidenceBreakdown.corroboration);
    setText(element, "[data-semantic-personalization]", paper.personalization.semanticBoost
      ? `个性匹配 +${paper.personalization.semanticBoost}`
      : currentSeedCount < 5 ? "个性推荐尚未启用" : "当前未命中相似推荐");
    const localAdjustment = localAdjustmentFor(paper);
    const localElement = element.querySelector<HTMLElement>("[data-local-adjustment]");
    if (localElement && localAdjustment !== 0) {
      localElement.hidden = false;
      localElement.textContent = `本地偏好 ${localAdjustment > 0 ? "+" : ""}${localAdjustment}`;
    }
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

  const queuedPapers = () => Object.entries(store.all())
    .filter(([, value]) => value.decision === "queued")
    .map(([id]) => knownPapers.get(id) ?? queuePaperCache[id])
    .filter((paper): paper is DiscoveryPaper => Boolean(paper));

  const renderQueue = () => {
    if (!queueList || !queueCount) return;
    const queuedIds = Object.entries(store.all()).filter(([, value]) => value.decision === "queued");
    queueCount.textContent = String(queuedIds.length);
    queueList.replaceChildren();
    if (queuedIds.length === 0) {
      const paragraph = document.createElement("p"); paragraph.className = "queue-empty"; paragraph.textContent = "还没有候选。遇到真正想读的论文，再把它留在这里。"; queueList.append(paragraph); return;
    }
    for (const [id] of queuedIds) {
      const paper = knownPapers.get(id) ?? queuePaperCache[id];
      if (!paper) continue;
      const item = document.createElement("article"); const link = document.createElement("a"); const remove = document.createElement("button");
      link.href = paper.sourceUrl; link.target = "_blank"; link.rel = "noreferrer"; link.textContent = paper.title;
      remove.type = "button"; remove.dataset.queueRemove = id; remove.textContent = "移除"; item.append(link, remove); queueList.append(item);
    }
  };

  const apply = () => {
    const decisions = store.all();
    const topicMap = personalizationTopicMap();
    const queryValue = query?.value ?? "";
    const ageLimit = age?.value && age.value !== "all" ? Number(age.value) : undefined;
    const now = generatedAt.getTime();
    const matches = papers.map((paper) => ({
      paper,
      relevance: relevance(paper, queryValue),
      adjustedScore: paper.score.baseTotal
        + (paper.personalization.semanticBoost ?? 0)
        + discoveryPersonalizationAdjustment({ id: paper.id, topicIds: paper.topicIds }, topicMap, decisions as Record<string, StoredDiscoveryDecision>),
    })).filter(({ paper, relevance: match }) => {
      if (queryValue && match < 0) return false;
      if (topic?.value && topic.value !== "all" && !paper.topicIds.includes(topic.value as DiscoveryTopicId)) return false;
      if (ageLimit && (now - new Date(paper.publishedAt).getTime()) / 86_400_000 > ageLimit) return false;
      const publishedDate = paper.publishedAt.slice(0, 10);
      if (dateFrom?.value && publishedDate < dateFrom.value) return false;
      if (dateTo?.value && publishedDate > dateTo.value) return false;
      if (venue?.value === "core" && paper.publicationStatus !== "core") return false;
      if (venue?.value === "formal" && paper.publicationStatus !== "core" && paper.publicationStatus !== "formal") return false;
      if (venue?.value === "unverified" && paper.publicationStatus !== "unverified") return false;
      if (venue?.value === "preprint" && paper.publicationStatus !== "preprint") return false;
      if (source?.value && source.value !== "all" && !paper.sources.includes(source.value as "arxiv" | "semantic-scholar" | "openreview")) return false;
      if (tier?.value && tier.value !== "all" && paper.score.tier !== tier.value) return false;
      if (library?.value === "new" && paper.librarySlug) return false;
      if (library?.value === "collected" && !paper.librarySlug) return false;
      if (!showDismissed?.checked && decisions[paper.id]?.decision === "dismissed") return false;
      return true;
    }).sort((left, right) => {
      if (queryValue && right.relevance !== left.relevance) return right.relevance - left.relevance;
      return tierWeight[right.paper.score.tier] - tierWeight[left.paper.score.tier]
        || right.adjustedScore - left.adjustedScore
        || right.paper.score.baseTotal - left.paper.score.baseTotal
        || right.paper.publishedAt.localeCompare(left.paper.publishedAt);
    });
    const orderedPapers = queryValue ? matches.map(({ paper }) => paper) : balanceDiscoveryAgeBands(matches.map(({ paper }) => paper), generatedAt);
    shelf.replaceChildren(...orderedPapers.slice(0, visibleLimit).map((paper, index) => renderCard(paper, index)), empty, loadMore);
    empty.hidden = matches.length > 0;
    loadMore.hidden = matches.length <= visibleLimit;
    if (resultCount) resultCount.textContent = String(matches.length);
    updateButtons();
  };

  const renderFeatured = () => {
    const decisions = store.all();
    const priority = papers
      .filter((paper) => paper.score.tier === "priority" && !paper.librarySlug && decisions[paper.id]?.decision !== "dismissed")
      .sort((left, right) => {
        const rightAdjusted = right.score.baseTotal + (right.personalization.semanticBoost ?? 0) + localAdjustmentFor(right);
        const leftAdjusted = left.score.baseTotal + (left.personalization.semanticBoost ?? 0) + localAdjustmentFor(left);
        return rightAdjusted - leftAdjusted || right.score.baseTotal - left.score.baseTotal || right.publishedAt.localeCompare(left.publishedAt);
      });
    const featured = selectDiscoveryFeatured(priority, generatedAt);
    featuredShelf.replaceChildren(...featured.map((paper, index) => renderCard(paper, index, true)));
    featuredShelf.hidden = featured.length === 0;
    featuredEmpty.hidden = featured.length > 0;
    updateButtons();
  };

  const renderSnapshotMeta = (snapshot: DiscoverySnapshot) => {
    setText(root, "[data-candidate-count]", snapshot.meta.candidateCount);
    setText(root, "[data-priority-count]", snapshot.meta.featuredCount);
    setText(root, "[data-retained-days]", snapshot.retainedDays);
    setText(root, "[data-snapshot-updated]", formatDate(snapshot.generatedAt, true));
    const field = fieldById.get(snapshot.fieldId);
    setText(root, "[data-current-field-code]", field?.code ?? snapshot.fieldId);
    root.style.setProperty("--signal", field?.accent ?? "#d9f99d");
    root.style.setProperty("--signal-soft", field?.accentSoft ?? "#334327");
    fieldButtons.forEach((button) => {
      const active = button.dataset.discoveryField === snapshot.fieldId;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    if (topic) {
      topic.replaceChildren(new Option("全部主题", "all"), ...discoveryTopicsForField(snapshot.fieldId).map((item) => new Option(item.label, item.id)));
      topic.value = "all";
    }
    const maximum = generatedAt.toISOString().slice(0, 10);
    const minimum = new Date(generatedAt.getTime() - snapshot.retainedDays * 86_400_000).toISOString().slice(0, 10);
    for (const input of [dateFrom, dateTo]) { if (input) { input.min = minimum; input.max = maximum; } }
    const degraded = Object.entries(snapshot.sources).filter(([, item]) => item.state !== "ok");
    const stale = Date.now() - generatedAt.getTime() > 72 * 60 * 60 * 1000;
    if (warning && warningList) {
      warning.hidden = degraded.length === 0 && !stale;
      setText(warning, "[data-warning-title]", stale ? "发现数据已经超过 72 小时未更新" : "部分来源更新延迟");
      warningList.replaceChildren(...degraded.map(([name, item]) => { const li = document.createElement("li"); li.textContent = `${name}: ${item.message || item.state}`; return li; }));
    }
  };

  const refresh = () => { renderQueue(); renderFeatured(); apply(); };

  const loadField = async (fieldId: FieldId, updateHistory = true) => {
    if (!fieldById.has(fieldId)) fieldId = "embodied-intelligence";
    root.dataset.loading = "true";
    try {
      let snapshot = snapshots.get(fieldId);
      if (!snapshot) {
        const templateUrl = root.dataset.discoveryUrlTemplate ?? root.dataset.discoveryUrl ?? "";
        const response = await fetch(templateUrl.replace("__FIELD__", fieldId));
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        snapshot = await response.json() as DiscoverySnapshot;
        snapshots.set(fieldId, snapshot);
      }
      currentField = fieldId;
      currentSeedCount = snapshot.meta.seedCount;
      root.dataset.currentField = fieldId;
      root.dataset.generatedAt = snapshot.generatedAt;
      generatedAt = new Date(snapshot.generatedAt);
      papers = snapshot.papers.map((paper) => ({ ...paper, fieldIds: paper.fieldIds?.length ? paper.fieldIds : [fieldId] }));
      for (const paper of papers) knownPapers.set(paper.id, paper);
      visibleLimit = DISCOVERY_PAGE_SIZE;
      renderSnapshotMeta(snapshot);
      refresh();
      if (updateHistory) {
        const url = new URL(window.location.href);
        if (fieldId === "embodied-intelligence") url.searchParams.delete("field"); else url.searchParams.set("field", fieldId);
        window.history.pushState({ fieldId }, "", url);
      }
      root.dataset.discoveryReady = "true";
    } catch (error) {
      console.error(`Discovery field ${fieldId} could not be loaded.`, error);
      if (warning) { warning.hidden = false; setText(warning, "[data-warning-title]", "当前方向加载失败"); }
    } finally {
      root.dataset.loading = "false";
    }
  };

  root.addEventListener("click", async (event) => {
    const target = event.target as HTMLElement;
    const fieldButton = target.closest<HTMLButtonElement>("[data-discovery-field]");
    if (fieldButton?.dataset.discoveryField && fieldButton.dataset.discoveryField !== currentField) {
      await loadField(fieldButton.dataset.discoveryField as FieldId);
      return;
    }
    const paperElement = target.closest<HTMLElement>("[data-paper-id]");
    const decisionButton = target.closest<HTMLButtonElement>("[data-decision-action]");
    if (decisionButton && paperElement?.dataset.paperId) {
      const id = paperElement.dataset.paperId; const decision = decisionButton.dataset.decisionAction as "queued" | "dismissed";
      if (store.get(id) === decision) {
        store.remove(id);
        if (decision === "queued") { delete queuePaperCache[id]; persistQueuePapers(); }
      } else {
        store.set(id, decision);
        if (decision === "queued") { const paper = knownPapers.get(id); if (paper) { queuePaperCache[id] = paper; persistQueuePapers(); } }
      }
      refresh(); return;
    }
    const remove = target.closest<HTMLButtonElement>("[data-queue-remove]");
    if (remove?.dataset.queueRemove) { store.remove(remove.dataset.queueRemove); delete queuePaperCache[remove.dataset.queueRemove]; persistQueuePapers(); refresh(); return; }
    if (target.closest("[data-source-link]") && paperElement?.dataset.paperId && !store.get(paperElement.dataset.paperId)) { store.set(paperElement.dataset.paperId, "seen"); updateButtons(); }
    if (target.closest("[data-filter-clear]")) {
      if (query) query.value = ""; [topic, age, venue, source, tier, library].forEach((select) => { if (select) select.value = "all"; }); [dateFrom, dateTo].forEach((input) => { if (input) input.value = ""; }); if (showDismissed) showDismissed.checked = false; visibleLimit = DISCOVERY_PAGE_SIZE; apply();
    }
    if (target.closest("[data-discovery-more]")) { visibleLimit += DISCOVERY_PAGE_SIZE; apply(); }
    const exportButton = target.closest<HTMLButtonElement>("[data-queue-export]");
    const copyButton = target.closest<HTMLButtonElement>("[data-queue-copy]");
    if (exportButton || copyButton) {
      const queued = queuedPapers();
      const markdown = ["# 待精读论文", "", ...queued.flatMap((paper) => [
        `- [${paper.title}](${paper.sourceUrl})`,
        `  - 方向：${(paper.fieldIds ?? []).map((id) => fieldById.get(id)?.titleZh ?? id).join("、") || "待确认"}`,
        `  - 主题：${paper.topicIds.map(discoveryTopicLabel).join("、") || "待确认"}`,
        `  - 基础阅读分：${paper.score.baseTotal ?? (paper.score as unknown as { total?: number }).total ?? "待更新"}`,
        `  - 研究证据：${paper.score.evidence ?? "待更新"}`,
        `  - 发表状态：${paper.publicationStatus ? discoveryPublicationLabel(paper.publicationStatus) : "待更新"}`,
        `  - 个性化匹配：${paper.personalization?.semanticBoost ? `+${paper.personalization.semanticBoost}` : "未启用或未命中"}`,
        `  - 推荐理由：${paper.score.reasons.join("；") || "来自论文发现工作台"}`,
      ])].join("\n");
      if (copyButton) { await navigator.clipboard.writeText(queued.map((paper) => paper.sourceUrl).join("\n")); copyButton.textContent = "已复制"; }
      else { const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "paper-reading-queue.md"; anchor.click(); URL.revokeObjectURL(url); }
    }
  });

  [query, topic, age, dateFrom, dateTo, venue, source, tier, library, showDismissed].forEach((control) => control?.addEventListener("input", () => { visibleLimit = DISCOVERY_PAGE_SIZE; apply(); }));
  window.addEventListener("popstate", () => {
    const fieldId = new URL(window.location.href).searchParams.get("field") as FieldId | null;
    void loadField(fieldId && fieldById.has(fieldId) ? fieldId : "embodied-intelligence", false);
  });

  const requestedField = new URL(window.location.href).searchParams.get("field") as FieldId | null;
  await loadField(requestedField && fieldById.has(requestedField) ? requestedField : "embodied-intelligence", false);
};
