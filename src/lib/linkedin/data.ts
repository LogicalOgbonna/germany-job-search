// Read-only client for the Member Data Portability API (Member). Every call is a GET.
const api = "https://api.linkedin.com/rest";
const version = "202312"; // the only version these endpoints accept
const pageLimit = 200;

export class LinkedinAuthError extends Error {
  name = "LinkedinAuthError";
}

export type SnapshotDomain = "INBOX" | "CONNECTIONS";
export type ChangelogEvent = {
  id?: number;
  resourceName?: string;
  method?: string;
  owner?: string;
  actor?: string;
  processedAt?: number;
  capturedAt?: number;
  activity?: any;
  processedActivity?: any;
};

export function linkedinDataClient(options: {
  token: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}) {
  const send = options.fetch ?? fetch;
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise((done) => setTimeout(done, ms)));
  // null for 404, which LinkedIn uses for "no data (yet)" and for "past the last page".
  async function get(path: string): Promise<any | null> {
    for (let attempt = 0; ; attempt++) {
      const response = await send(`${api}${path}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${options.token}`,
          "LinkedIn-Version": version,
        },
        signal: AbortSignal.timeout(30000),
      });
      if (response.ok) return response.json();
      if (response.status === 404) return null;
      if (response.status === 401 || response.status === 403)
        throw new LinkedinAuthError(
          "Reconnect LinkedIn: run npm run linkedin:connect -- --data",
        );
      if ((response.status === 429 || response.status >= 500) && attempt < 3) {
        await sleep(2000 * 2 ** attempt);
        continue;
      }
      throw new Error(`LinkedIn answered ${response.status}`);
    }
  }
  return {
    // All rows of one domain, or null when LinkedIn has not prepared the domain yet.
    async snapshot(domain: SnapshotDomain): Promise<any[] | null> {
      const rows: any[] = [];
      for (let start = 0; start < pageLimit; start++) {
        const body = await get(
          `/memberSnapshotData?q=criteria&domain=${domain}&start=${start}`,
        );
        if (!body) return start === 0 ? null : rows;
        rows.push(...(body.elements?.[0]?.snapshotData ?? []));
        if (!body.paging?.links?.some((link: any) => link.rel === "next"))
          return rows;
      }
      throw new Error(`LinkedIn ${domain} did not stop paging`);
    },
    // Events processed at or after `since`, oldest first, as LinkedIn recommends paging them.
    async changes(since: Date): Promise<ChangelogEvent[]> {
      const events: ChangelogEvent[] = [];
      let start = since.getTime();
      for (let page = 0; page < pageLimit; page++) {
        const body = await get(
          `/memberChangeLogs?q=memberAndApplication&startTime=${start}&count=10`,
        );
        const batch: ChangelogEvent[] = body?.elements ?? [];
        if (!batch.length) return events;
        events.push(...batch);
        start =
          Math.max(...batch.map((event) => Number(event.processedAt) || 0)) + 1;
      }
      throw new Error("LinkedIn changelog did not stop paging");
    },
  };
}
export type LinkedinDataClient = ReturnType<typeof linkedinDataClient>;
