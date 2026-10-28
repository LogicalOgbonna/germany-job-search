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

export type Snapshot = {
  rows: any[];
  // False when paging was cut short (a later page went missing, or the page limit was
  // reached): the rows are then not the whole domain.
  complete: boolean;
};

// Retried as the Gmail client retries: rate limits, 5xx, network failures and timeouts get
// four more attempts, waiting as long as Retry-After asks (at most a minute).
const backoff = [2000, 4000, 8000, 16000];
// The changelog keeps 28 days of events.
const changelogDays = 28;

function retryAfter(response: Response): number | undefined {
  const value = response.headers.get("retry-after");
  if (!value) return undefined;
  const seconds = /^\d+$/.test(value.trim())
    ? Number(value)
    : (Date.parse(value) - Date.now()) / 1000;
  return Number.isFinite(seconds) ? Math.max(0, seconds) : undefined;
}

// One key per event: LinkedIn's id, or the whole event when it carries none.
const eventKey = (event: ChangelogEvent) =>
  event.id !== undefined ? `id:${event.id}` : `event:${JSON.stringify(event)}`;
const atTime = (events: ChangelogEvent[], time: number) =>
  events.filter((event) => (Number(event.processedAt) || 0) === time).length;

export function linkedinDataClient(options: {
  token: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
}) {
  const send = options.fetch ?? fetch;
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise((done) => setTimeout(done, ms)));
  const now = options.now ?? (() => new Date());
  // null for 404, which LinkedIn uses for "no data (yet)" and for "past the last page".
  async function get(path: string): Promise<any | null> {
    for (let attempt = 0; ; attempt++) {
      let response: Response | null = null;
      let error: unknown;
      try {
        response = await send(`${api}${path}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${options.token}`,
            "LinkedIn-Version": version,
          },
          signal: AbortSignal.timeout(30000),
          redirect: "error",
          cache: "no-store",
        });
        if (response.ok) return await response.json();
      } catch (thrown) {
        // A network failure or a timeout.
        error = thrown;
      }
      if (response && !response.ok) {
        if (response.status === 404) return null;
        if (response.status === 401 || response.status === 403)
          throw new LinkedinAuthError(
            "Reconnect LinkedIn: run npm run linkedin:connect -- --data",
          );
        error = new Error(`LinkedIn answered ${response.status}`);
        if (response.status !== 429 && response.status < 500) throw error;
      }
      if (attempt >= backoff.length) throw error;
      const asked = response && !response.ok ? retryAfter(response) : undefined;
      await sleep(
        asked === undefined ? backoff[attempt] : Math.min(asked, 60) * 1000,
      );
    }
  }
  return {
    // All rows of one domain, or null when LinkedIn has not prepared the domain yet.
    async snapshot(domain: SnapshotDomain): Promise<Snapshot | null> {
      const rows: any[] = [];
      for (let start = 0; start < pageLimit; start++) {
        const body = await get(
          `/memberSnapshotData?q=criteria&domain=${domain}&start=${start}`,
        );
        if (!body) return start === 0 ? null : { rows, complete: false };
        rows.push(...(body.elements?.[0]?.snapshotData ?? []));
        if (!body.paging?.links?.some((link: any) => link.rel === "next"))
          return { rows, complete: true };
      }
      return { rows, complete: false };
    },
    // Events processed at or after `since` (at most 28 days back), oldest first, as LinkedIn
    // recommends paging them. Each page starts at the last page's final processedAt, inclusive,
    // so events sharing that millisecond are not skipped; `start` steps past the ones already
    // read there, and events are kept once each by id.
    async changes(since: Date): Promise<ChangelogEvent[]> {
      const events: ChangelogEvent[] = [];
      const seen = new Set<string>();
      let startTime = Math.max(
        since.getTime(),
        now().getTime() - changelogDays * 86_400_000,
      );
      let skip = 0;
      for (let page = 0; page < pageLimit; page++) {
        const body = await get(
          `/memberChangeLogs?q=memberAndApplication&startTime=${startTime}${skip ? `&start=${skip}` : ""}&count=10`,
        );
        const batch: ChangelogEvent[] = body?.elements ?? [];
        const fresh = batch.filter((event) => {
          const key = eventKey(event);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        // Empty, or only events already read: the changelog has nothing later.
        if (!fresh.length) return events;
        events.push(...fresh);
        const last = Math.max(
          startTime,
          ...batch.map((event) => Number(event.processedAt) || 0),
        );
        skip = atTime(events, last);
        startTime = last;
      }
      throw new Error("LinkedIn changelog did not stop paging");
    },
  };
}
export type LinkedinDataClient = ReturnType<typeof linkedinDataClient>;
