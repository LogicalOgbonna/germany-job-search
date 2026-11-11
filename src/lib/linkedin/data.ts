// Read-only client for the Member Data Portability API (Member). Every call is a GET, except
// the one POST checkDataAccess may make at connect time to start the changelog archive.
const api = "https://api.linkedin.com/rest";
const version = "202312"; // the only version these endpoints accept
const pageLimit = 200;
const changeCount = 10; // events asked for per changelog page

export class LinkedinAuthError extends Error {
  name = "LinkedinAuthError";
}

export type SnapshotDomain = "INBOX" | "CONNECTIONS" | "PROFILE";
// Runs after every page is read; the sync renews its lease here and throws once it is lost,
// which stops the paging.
export type PageOptions = { onPage?: () => Promise<void> };
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
    async snapshot(
      domain: SnapshotDomain,
      options: PageOptions = {},
    ): Promise<Snapshot | null> {
      const rows: any[] = [];
      for (let start = 0; start < pageLimit; start++) {
        const body = await get(
          `/memberSnapshotData?q=criteria&domain=${domain}&start=${start}`,
        );
        await options.onPage?.();
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
    async changes(
      since: Date,
      options: PageOptions = {},
    ): Promise<ChangelogEvent[]> {
      const events: ChangelogEvent[] = [];
      const seen = new Set<string>();
      let startTime = Math.max(
        since.getTime(),
        now().getTime() - changelogDays * 86_400_000,
      );
      let skip = 0;
      let full = false; // the previous page held as many events as were asked for
      for (let page = 0; page < pageLimit; page++) {
        const body = await get(
          `/memberChangeLogs?q=memberAndApplication&startTime=${startTime}${skip ? `&start=${skip}` : ""}&count=${changeCount}`,
        );
        await options.onPage?.();
        const batch: ChangelogEvent[] = body?.elements ?? [];
        const fresh = batch.filter((event) => {
          const key = eventKey(event);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        // Empty, or only events already read: after a page that was not full, the changelog
        // has nothing later. After a full page there is more, so paging is stuck, and the
        // check fails rather than leave the rest unread.
        if (!fresh.length) {
          if (full)
            throw new Error("LinkedIn changelog paging did not advance");
          return events;
        }
        full = batch.length >= changeCount;
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

// Run once by npm run linkedin:connect -- --data. The changelog archive normally starts by
// itself after consent; LinkedIn documents an empty POST to start it when it has not. Then one
// snapshot read, retried as the sync retries, proves the token works. A 404 there means
// LinkedIn is still collecting the history, which takes a while after a first consent.
export async function checkDataAccess(
  token: string,
  options: {
    fetch?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<string> {
  const send = options.fetch ?? fetch;
  const headers = {
    Authorization: `Bearer ${token}`,
    "LinkedIn-Version": version,
    "Content-Type": "application/json",
  };
  const opts = { signal: AbortSignal.timeout(30000) };
  const archive = await send(
    `${api}/memberAuthorizations?q=memberAndApplication`,
    { headers, ...opts },
  );
  let feed = archive.ok ? "already on" : "";
  if (!archive.ok) {
    const started = await send(`${api}/memberAuthorizations`, {
      method: "POST",
      headers,
      body: "{}",
      ...opts,
    });
    feed = started.ok
      ? "switched on now"
      : `could not be switched on (${started.status})`;
  }
  // Throws LinkedinAuthError on 401/403; 429, 5xx, network failures and timeouts are retried.
  const profile = await linkedinDataClient({
    token,
    fetch: send,
    sleep: options.sleep,
  }).snapshot("PROFILE");
  return `Activity feed ${feed}; ${
    profile
      ? "profile snapshot readable"
      : "profile snapshot not ready yet (LinkedIn is still collecting your history; try again later)"
  }.`;
}

// After a failed data check: null when LinkedIn refused the token (it is removed again), or
// the line to report when the failure was LinkedIn's or the network's (the token is kept).
export function keptAfterDataCheck(error: unknown): string | null {
  if (error instanceof LinkedinAuthError) return null;
  const reason = (
    error instanceof Error ? error.message : "unknown error"
  ).replace(/\.+$/, "");
  return `Connected, but LinkedIn's data check failed: ${reason}. Jobdesk will retry on the next hourly check.`;
}
