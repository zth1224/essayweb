import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DiscoveryIndex, DiscoverySnapshot } from "../src/data/discovery-types";
import type { FieldId, LibrarySnapshot } from "../src/data/types";
import { classifyDiscoveryFields, scoreDiscoveryPaper } from "../src/lib/discovery";
import {
  buildDiscoverySnapshots,
  DISCOVERY_FIELD_IDS,
  discoverySnapshotMeaningfullyChanged,
} from "./lib/discovery-refresh";

const root = process.cwd();
const libraryPath = path.join(root, "src/data/generated/library.json");
const generatedDirectory = path.join(root, "src/data/generated");
const discoveryFiles: Record<FieldId, string> = {
  "embodied-intelligence": "discovery.json",
  "cs-ai": "discovery-cs-ai.json",
  "cs-cl": "discovery-cs-cl.json",
  "cs-cv": "discovery-cs-cv.json",
  "cs-lg": "discovery-cs-lg.json",
};
const indexPath = path.join(generatedDirectory, "discovery-index.json");

const readJson = async <T>(filePath: string): Promise<T> => JSON.parse(await readFile(filePath, "utf8")) as T;

const library = await readJson<LibrarySnapshot>(libraryPath);
const upgradeSnapshot = (snapshot: DiscoverySnapshot, fieldId: FieldId): DiscoverySnapshot => {
  const legacy = snapshot.schemaVersion !== 2 || !snapshot.fieldId || snapshot.papers.some((paper) => !paper.fieldIds?.length);
  const papers = snapshot.papers.map((paper) => {
    const upgraded = {
      ...paper,
      fieldIds: paper.fieldIds?.length ? paper.fieldIds : classifyDiscoveryFields(paper.categories, paper.topicIds),
    };
    if (!legacy) return upgraded;
    const { score: _score, ...candidate } = upgraded;
    return { ...candidate, score: scoreDiscoveryPaper(candidate, new Date(snapshot.generatedAt), fieldId) };
  });
  return {
    ...snapshot,
    schemaVersion: 2,
    fieldId,
    papers,
    meta: {
      ...snapshot.meta,
      featuredCount: papers.filter((paper) => !paper.librarySlug && paper.score.tier === "priority").length,
    },
  };
};
const priors: Partial<Record<FieldId, DiscoverySnapshot>> = {};
const upgradeRequired = new Set<FieldId>();
for (const fieldId of DISCOVERY_FIELD_IDS) {
  const filePath = path.join(generatedDirectory, discoveryFiles[fieldId]);
  if (existsSync(filePath)) {
    const raw = await readJson<DiscoverySnapshot>(filePath);
    if (raw.schemaVersion !== 2 || !raw.fieldId || raw.papers.some((paper) => !paper.fieldIds?.length)) upgradeRequired.add(fieldId);
    priors[fieldId] = upgradeSnapshot(raw, fieldId);
  }
}
const next = await buildDiscoverySnapshots(library, priors, { apiKey: process.env.SEMANTIC_SCHOLAR_API_KEY });
let changed = 0;

for (const fieldId of DISCOVERY_FIELD_IDS) {
  const snapshot = next[fieldId];
  if (!snapshot) throw new Error(`Missing generated snapshot for ${fieldId}`);
  const prior = priors[fieldId];
  const filePath = path.join(generatedDirectory, discoveryFiles[fieldId]);
  if (upgradeRequired.has(fieldId) || discoverySnapshotMeaningfullyChanged(prior, snapshot)) {
    await writeFile(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    changed += 1;
    console.log(`Updated ${fieldId}: ${snapshot.meta.candidateCount} candidates, ${snapshot.meta.featuredCount} priority, ${snapshot.meta.libraryMatchCount} collected.`);
  } else {
    console.log(`Unchanged ${fieldId}: ${snapshot.meta.candidateCount} candidates.`);
  }
  for (const [source, sourceStatus] of Object.entries(snapshot.sources)) {
    console.log(`  ${source}: ${sourceStatus.state}, ${sourceStatus.recordCount} records${sourceStatus.message ? ` (${sourceStatus.message})` : ""}`);
  }
}

const snapshots = DISCOVERY_FIELD_IDS.map((fieldId) => next[fieldId]).filter((snapshot): snapshot is DiscoverySnapshot => Boolean(snapshot));
const index: DiscoveryIndex = {
  schemaVersion: 1,
  generatedAt: snapshots.map((snapshot) => snapshot.generatedAt).sort().at(-1) ?? new Date().toISOString(),
  fields: snapshots.map((snapshot) => ({
    fieldId: snapshot.fieldId,
    generatedAt: snapshot.generatedAt,
    retainedDays: snapshot.retainedDays,
    candidateCount: snapshot.meta.candidateCount,
    featuredCount: snapshot.meta.featuredCount,
    libraryMatchCount: snapshot.meta.libraryMatchCount,
    seedCount: snapshot.meta.seedCount,
    sources: snapshot.sources,
  })),
};
const priorIndex = existsSync(indexPath) ? await readJson<DiscoveryIndex>(indexPath) : undefined;
if (JSON.stringify(priorIndex) !== JSON.stringify(index)) {
  await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  changed += 1;
}
console.log(changed === 0 ? "All discovery snapshots are unchanged." : `Wrote ${changed} discovery data file(s).`);
