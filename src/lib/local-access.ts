// Only the URL injected into this dev process is allowed, not every *.localhost host.
export function portlessOrigin(
  env: { NODE_ENV?: string; PORTLESS_URL?: string } = process.env,
): string | null {
  if (env.NODE_ENV !== "development" || !env.PORTLESS_URL) return null;
  try {
    const url = new URL(env.PORTLESS_URL);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      !url.hostname.endsWith(".localhost") ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}
