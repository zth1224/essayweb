import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildLibrarySnapshot, snapshotTextChanged } from "./lib/essay-sync";

const sourceRoot = path.resolve(process.env.ESSAY_ROOT || "D:\\essay");
const outputPath = path.resolve("src/data/generated/library.json");

const snapshot = await buildLibrarySnapshot(sourceRoot);

if (existsSync(outputPath)) {
  const previous = JSON.parse(readFileSync(outputPath, "utf8"));
  if (previous?.meta?.sourceHash === snapshot.meta.sourceHash) {
    snapshot.meta.sourceUpdatedAt = previous.meta.sourceUpdatedAt;
  }
}

const output = `${JSON.stringify(snapshot, null, 2)}\n`;
const previousOutput = existsSync(outputPath) ? readFileSync(outputPath, "utf8") : "";
const changed = snapshotTextChanged(previousOutput, output);
if (changed) {
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, output, "utf8");
}

const { paperCount, topicCount, termCount, damagedPaperCount, readPaperCount } = snapshot.meta;
console.log(`Essay snapshot: ${paperCount} papers, ${topicCount} topics, ${termCount} terms`);
console.log(`Reading state: ${readPaperCount} read, ${paperCount - readPaperCount} unread; ${damagedPaperCount} damaged notes`);
console.log(changed ? `Wrote ${path.relative(process.cwd(), outputPath)}` : "Snapshot unchanged.");
