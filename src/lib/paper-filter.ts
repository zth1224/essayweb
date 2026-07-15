import type { FieldId, PaperRecord, ReadingStatus } from "../data/types";

export interface PaperFilters {
  query?: string;
  fieldId?: FieldId;
  status?: ReadingStatus | "all";
  topicId?: string | "all";
}

export const normalizeSearchValue = (value: string) =>
  value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();

export const filterPapers = (items: PaperRecord[], filters: PaperFilters) => {
  const query = normalizeSearchValue(filters.query ?? "");

  return items.filter((paper) => {
    const matchesField = !filters.fieldId || paper.fieldIds.includes(filters.fieldId);
    const matchesStatus = !filters.status || filters.status === "all" || paper.status === filters.status;
    const matchesTopic = !filters.topicId || filters.topicId === "all" || paper.topicIds.includes(filters.topicId);
    const haystack = normalizeSearchValue([
      paper.title,
      paper.authorsText,
      paper.topicIds.join(" "),
    ].join(" "));
    const matchesQuery = !query || haystack.includes(query);
    return matchesField && matchesStatus && matchesTopic && matchesQuery;
  });
};
