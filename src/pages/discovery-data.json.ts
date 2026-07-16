import { getDiscoverySnapshot } from "../data/discovery-repository";

export const prerender = true;

export const GET = () => new Response(JSON.stringify(getDiscoverySnapshot()), {
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "public, max-age=900",
  },
});
