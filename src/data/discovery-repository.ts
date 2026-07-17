import discoveryJson from "./generated/discovery.json";
import discoveryAiJson from "./generated/discovery-cs-ai.json";
import discoveryClJson from "./generated/discovery-cs-cl.json";
import discoveryCvJson from "./generated/discovery-cs-cv.json";
import discoveryLgJson from "./generated/discovery-cs-lg.json";
import discoveryIndexJson from "./generated/discovery-index.json";
import type { DiscoveryIndex, DiscoverySnapshot } from "./discovery-types";
import type { FieldId } from "./types";
import { selectDiscoveryFeatured } from "../lib/discovery";

const snapshots: Record<FieldId, DiscoverySnapshot> = {
  "embodied-intelligence": discoveryJson as unknown as DiscoverySnapshot,
  "cs-ai": discoveryAiJson as DiscoverySnapshot,
  "cs-cl": discoveryClJson as DiscoverySnapshot,
  "cs-cv": discoveryCvJson as DiscoverySnapshot,
  "cs-lg": discoveryLgJson as DiscoverySnapshot,
};
const index = discoveryIndexJson as DiscoveryIndex;

export const getDiscoveryIndex = () => index;
export const getDiscoverySnapshot = (fieldId: FieldId = "embodied-intelligence") => snapshots[fieldId];
export const getDiscoveryPapers = (fieldId: FieldId = "embodied-intelligence") => snapshots[fieldId].papers;
export const getDiscoveryFeatured = (limit = 3, fieldId: FieldId = "embodied-intelligence") => {
  const snapshot = snapshots[fieldId];
  return selectDiscoveryFeatured(
  snapshot.papers.filter((paper) => !paper.librarySlug && paper.score.tier === "priority"),
  new Date(snapshot.generatedAt),
  ).slice(0, limit);
};
