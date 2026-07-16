import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DiscoverySnapshot } from "../src/data/discovery-types";
import type { LibrarySnapshot } from "../src/data/types";
import {
  buildDiscoverySnapshot,
  discoverySnapshotMeaningfullyChanged,
} from "./lib/discovery-refresh";

const root = process.cwd();
const libraryPath = path.join(root, "src/data/generated/library.json");
const discoveryPath = path.join(root, "src/data/generated/discovery.json");

const readJson = async <T>(filePath: string): Promise<T> => JSON.parse(await readFile(filePath, "utf8")) as T;

const library = await readJson<LibrarySnapshot>(libraryPath);
const prior = existsSync(discoveryPath) ? await readJson<DiscoverySnapshot>(discoveryPath) : undefined;
const next = await buildDiscoverySnapshot(library, prior, { apiKey: process.env.SEMANTIC_SCHOLAR_API_KEY });

if (!discoverySnapshotMeaningfullyChanged(prior, next)) {
  console.log(`Discovery snapshot unchanged (${next.meta.candidateCount} candidates).`);
  process.exit(0);
}

await writeFile(discoveryPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
console.log(`Updated discovery snapshot: ${next.meta.candidateCount} candidates, ${next.meta.featuredCount} priority, ${next.meta.libraryMatchCount} already collected.`);
for (const [source, sourceStatus] of Object.entries(next.sources)) {
  console.log(`${source}: ${sourceStatus.state}, ${sourceStatus.recordCount} records${sourceStatus.message ? ` (${sourceStatus.message})` : ""}`);
}
