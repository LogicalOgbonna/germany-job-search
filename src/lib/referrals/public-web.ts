import https from "node:https";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
const blocked = new BlockList();
for (const [ip, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(ip, prefix, "ipv4");
export const isPublicIPv4 = (ip: string) =>
  isIP(ip) === 4 && !blocked.check(ip, "ipv4");
// Resolve once, validate every address, then pin the socket to that address.
// IPv6-only hosts are skipped; redirects are limited to the same website.
export async function publicPage(
  url: string,
  redirects = 0,
): Promise<{ status: number; text: string; url: string }> {
  const u = new URL(url);
  if (
    u.protocol !== "https:" ||
    u.port ||
    u.username ||
    u.password ||
    isIP(u.hostname)
  )
    throw new Error("Only public HTTPS websites are supported.");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const addresses = await Promise.race([
    lookup(u.hostname, { family: 4, all: true }),
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("Website lookup timed out.")),
        5000,
      );
    }),
  ]).finally(() => clearTimeout(timer));
  if (!addresses.length || addresses.some((a) => !isPublicIPv4(a.address)))
    throw new Error("This website does not resolve to a public address.");
  return new Promise((resolve, reject) => {
    const req = https.get(
      u,
      {
        family: 4,
        headers: {
          "User-Agent": "Jobdesk/0.1 (public professional contact research)",
          Accept: "text/html,text/plain",
        },
        lookup: (_host, _opts, cb) => cb(null, addresses[0].address, 4),
      },
      (res) => {
        if (
          [301, 302, 303, 307, 308].includes(res.statusCode ?? 0) &&
          res.headers.location &&
          redirects < 3
        ) {
          res.resume();
          const next = new URL(res.headers.location, u);
          if (
            next.hostname.replace(/^www\./, "") !==
              u.hostname.replace(/^www\./, "") ||
            next.pathname !== u.pathname ||
            next.search
          ) {
            reject(
              new Error(
                "Website redirected to a different page or domain; use its canonical domain.",
              ),
            );
            return;
          }
          publicPage(next.href, redirects + 1).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          resolve({ status: res.statusCode ?? 500, text: "", url });
          return;
        }
        if (!/text\/(html|plain)/i.test(res.headers["content-type"] ?? "")) {
          res.resume();
          reject(new Error("Website did not return a text page."));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > 1_500_000)
            req.destroy(new Error("Website page is too large."));
          else chunks.push(chunk);
        });
        res.on("end", () =>
          resolve({
            status: 200,
            url,
            text: Buffer.concat(chunks).toString("utf8"),
          }),
        );
        res.on("error", () => reject(new Error("Website response failed.")));
      },
    );
    const timeout = setTimeout(
      () => req.destroy(new Error("Website request timed out.")),
      10000,
    );
    req.on("close", () => clearTimeout(timeout));
    req.on("error", () =>
      reject(new Error("Could not fetch the public website.")),
    );
  });
}
export function robotsAllows(text: string, path: string) {
  type Group = { agents: string[]; rules: { allow: boolean; path: string }[] };
  const groups: Group[] = [];
  let group: Group = { agents: [], rules: [] };
  for (const line of text.split(/\r?\n/)) {
    const match = line
      .replace(/#.*/, "")
      .match(/^\s*(User-agent|Allow|Disallow):\s*(.*?)\s*$/i);
    if (!match) continue;
    if (match[1].toLowerCase() === "user-agent") {
      if (group.rules.length) {
        groups.push(group);
        group = { agents: [], rules: [] };
      }
      group.agents.push(match[2].toLowerCase());
    } else if (match[2])
      group.rules.push({
        allow: match[1].toLowerCase() === "allow",
        path: match[2],
      });
  }
  groups.push(group);
  const specific = groups.filter((g) =>
    g.agents.some((a) => a !== "*" && "jobdesk".includes(a)),
  );
  const relevant = specific.length
    ? specific
    : groups.filter((g) => g.agents.includes("*"));
  const matches = relevant
    .flatMap((g) => g.rules)
    .filter((rule) => {
      const pattern = rule.path
        .split("*")
        .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*")
        .replace(/\\\$$/, "$");
      return new RegExp(`^${pattern}`).test(path);
    })
    .sort(
      (a, b) =>
        b.path.length - a.path.length || Number(b.allow) - Number(a.allow),
    );
  return !matches.length || matches[0].allow;
}
