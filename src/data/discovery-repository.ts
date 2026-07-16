import discoveryJson from "./generated/discovery.json";
import type { DiscoverySnapshot } from "./discovery-types";

const snapshot = discoveryJson as DiscoverySnapshot;

export const getDiscoverySnapshot = () => snapshot;
export const getDiscoveryPapers = () => snapshot.papers;
export const getDiscoveryFeatured = (limit = 3) => snapshot.papers
  .filter((paper) => !paper.librarySlug && paper.score.tier !== "archive")
  .slice(0, limit);
