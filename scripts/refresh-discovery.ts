import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DiscoveryIndex, DiscoverySnapshot } from "../src/data/discovery-types";
import type { FieldId, LibrarySnapshot } from "../src/data/types";
import { DISCOVERY_SCORE_VERSION } from "../src/lib/discovery";
import {
  buildDiscoverySnapshots,
  DISCOVERY_FIELD_IDS,
  discoverySnapshotMeaningfullyChanged,
  type LegacyDiscoverySnapshot,
  upgradeDiscoverySnapshot,
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
const priors: Partial<Record<FieldId, DiscoverySnapshot>> = {};
const upgradeRequired = new Set<FieldId>();
for (const fieldId of DISCOVERY_FIELD_IDS) {
  const filePath = path.join(generatedDirectory, discoveryFiles[fieldId]);
  if (existsSync(filePath)) {
    const raw = await readJson<LegacyDiscoverySnapshot>(filePath);
    if (raw.schemaVersion !== 3 || raw.meta.scoreVersion !== DISCOVERY_SCORE_VERSION || !raw.fieldId || raw.papers.some((paper) => !paper.fieldIds?.length)) upgradeRequired.add(fieldId);
    priors[fieldId] = upgradeDiscoverySnapshot(raw, fieldId);
  }
}
let next: Partial<Record<FieldId, DiscoverySnapshot>>;
if (process.env.DISCOVERY_RESCORE_ONLY === "1") {
  console.log("Rescore-only mode: using existing candidates without live API requests.");
  next = priors;
} else try {
  next = await buildDiscoverySnapshots(library, priors, { apiKey: process.env.SEMANTIC_SCHOLAR_API_KEY });
} catch (error) {
  if (upgradeRequired.size === 0) throw error;
  console.warn(`Live refresh failed during schema migration; writing deterministic v3 rescoring from prior candidates: ${error instanceof Error ? error.message : String(error)}`);
  next = priors;
}
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
  const median = (values: number[]) => [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)] ?? 0;
  const formalCount = snapshot.papers.filter((paper) => paper.publicationStatus === "core" || paper.publicationStatus === "formal").length;
  const rankLeaks = snapshot.papers.filter((paper) => Object.keys(paper.recommendationRanks ?? {}).some((rankField) => rankField !== fieldId)).length;
  console.log(`  audit: base median ${median(snapshot.papers.map((paper) => paper.score.baseTotal))}, evidence median ${median(snapshot.papers.map((paper) => paper.score.evidence))}, formal ${formalCount}, seeds ${snapshot.meta.seedCount}, rank leaks ${rankLeaks}`);
}

const snapshots = DISCOVERY_FIELD_IDS.map((fieldId) => next[fieldId]).filter((snapshot): snapshot is DiscoverySnapshot => Boolean(snapshot));
const index: DiscoveryIndex = {
  schemaVersion: 2,
  generatedAt: snapshots.map((snapshot) => snapshot.generatedAt).sort().at(-1) ?? new Date().toISOString(),
  fields: snapshots.map((snapshot) => ({
    fieldId: snapshot.fieldId,
    generatedAt: snapshot.generatedAt,
    retainedDays: snapshot.retainedDays,
    candidateCount: snapshot.meta.candidateCount,
    featuredCount: snapshot.meta.featuredCount,
    libraryMatchCount: snapshot.meta.libraryMatchCount,
    seedCount: snapshot.meta.seedCount,
    scoreVersion: snapshot.meta.scoreVersion,
    sources: snapshot.sources,
  })),
};
const priorIndex = existsSync(indexPath) ? await readJson<DiscoveryIndex>(indexPath) : undefined;
if (JSON.stringify(priorIndex) !== JSON.stringify(index)) {
  await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  changed += 1;
}
console.log(changed === 0 ? "All discovery snapshots are unchanged." : `Wrote ${changed} discovery data file(s).`);
