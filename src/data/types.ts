export type FieldId =
  | "cs-ai"
  | "cs-cl"
  | "cs-cv"
  | "cs-lg"
  | "embodied-intelligence";

export type ReadingStatus = "unread" | "reading" | "read";

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
  title: string;
  authors: string[];
  year: number;
  summary: string;
  status: ReadingStatus;
  featured: boolean;
  fieldIds: FieldId[];
  termIds: string[];
  tags: string[];
  sections: {
    background: string;
    method: string;
    experiments: string;
    contributions: string;
    limitations: string;
  };
}

export interface TermRecord {
  id: string;
  slug: string;
  name: string;
  sortKey: string;
  definition: string;
  fieldId: FieldId;
  relatedPaperIds: string[];
}
