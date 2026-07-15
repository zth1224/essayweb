import { defineConfig } from "astro/config";

const repository = process.env.GITHUB_REPOSITORY ?? "";
const [owner = "", repositoryName = ""] = repository.split("/");
const isUserSite = repositoryName === `${owner}.github.io`;
const base = process.env.PUBLIC_BASE_PATH ??
  (repositoryName && !isUserSite ? `/${repositoryName}` : "/");
const site = process.env.PUBLIC_SITE_URL ??
  (owner ? `https://${owner}.github.io` : "http://localhost:4321");

export default defineConfig({
  output: "static",
  site,
  base,
  trailingSlash: "always",
});
