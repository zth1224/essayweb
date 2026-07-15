export type FieldId =
  | "cs-ai"
  | "cs-cl"
  | "cs-cv"
  | "cs-lg"
  | "embodied-intelligence";

export type ReadingStatus = "unread" | "reading" | "read";
export type ContentState = "complete" | "source-damaged";

export interface FieldDefinition {
  id: FieldId;
  slug: string;
  code: string;
  titleZh: string;
  titleEn: string;
  accent: string;
  accentSoft: string;
}

export interface PaperRecord {
  id: string;
  slug: string;
  sourceNumber: number;
  title: string;
  authorsText: string;
  year?: number;
  month?: number;
  summaryMarkdown: string;
  status: ReadingStatus;
  fieldIds: FieldId[];
  topicIds: string[];
  termIds: string[];
  sourceUrl: string;
  pdfUrl?: string;
  contentState: ContentState;
  recentRank?: number;
  sections: PaperSection[];
}

export interface PaperSection { id: string; title: string; markdown: string }

export interface TopicRecord {
  id: string;
  slug: string;
  fieldId: FieldId;
  title: string;
  descriptionMarkdown: string;
  readingRouteMarkdown: string;
  paperIds: string[];
}

export interface TermRecord {
  id: string;
  slug: string;
  name: string;
  sortKey: string;
  definitionMarkdown: string;
  contextMarkdown: string;
  fieldId: FieldId;
  relatedPaperIds: string[];
}

export interface LibraryMeta {
  sourceHash: string;
  sourceUpdatedAt: string;
  paperCount: number;
  topicCount: number;
  termCount: number;
  damagedPaperCount: number;
  readPaperCount: number;
  sourceFiles: { csvRows: number; paperNotes: number; topicPages: number; termBlocks: number; recentEntries: number };
}

export interface SyncIssue { level: "warning" | "error"; code: string; sourcePath: string; message: string }

export interface LibrarySnapshot {
  schemaVersion: number;
  meta: LibraryMeta;
  papers: PaperRecord[];
  topics: TopicRecord[];
  terms: TermRecord[];
  issues: SyncIssue[];
}
