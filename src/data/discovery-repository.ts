import discoveryJson from "./generated/discovery.json";
import type { DiscoverySnapshot } from "./discovery-types";
import { balanceDiscoveryAgeBands } from "../lib/discovery";

const snapshot = discoveryJson as DiscoverySnapshot;

export const getDiscoverySnapshot = () => snapshot;
export const getDiscoveryPapers = () => snapshot.papers;
export const getDiscoveryFeatured = (limit = 3) => balanceDiscoveryAgeBands(
  snapshot.papers.filter((paper) => !paper.librarySlug),
  new Date(snapshot.generatedAt),
).slice(0, limit);
