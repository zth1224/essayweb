export const sitePath = (path: string, base = import.meta.env.BASE_URL): string => {
  const normalizedBase = `/${base}`.replace(/\/{2,}/g, "/").replace(/\/?$/, "/");
  const normalizedPath = path.replace(/^\/+/, "");
  return `${normalizedBase}${normalizedPath}`.replace(/\/{2,}/g, "/");
};
