import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { LinkedinApp } from "./callback";

const authEndpoint = "https://www.linkedin.com/oauth/v2/authorization";
const tokenEndpoint = "https://www.linkedin.com/oauth/v2/accessToken";

// Only these scopes are ever requested. w_member_social can publish, so posting code
// must always show the post and wait for an explicit approval first.
export const linkedinScopes = {
  share: ["openid", "profile", "email", "w_member_social"],
  data: ["r_dma_portability_self_serve"],
} as const satisfies Record<LinkedinApp, readonly string[]>;

export const linkedinTokenPath = (app: LinkedinApp) =>
  join(
    process.cwd(),
    ".data",
    app === "share" ? "linkedin-token.json" : "linkedin-data-token.json",
  );

export type LinkedinToken = {
  accessToken: string;
  expiresAt: string;
  scopes: string[];
  connectedAt: string;
  // From the OpenID userinfo call (share app only); `sub` is the person id posts are authored as.
  sub?: string;
  name?: string;
  email?: string;
};

export function authorizationUrl(input: {
  app: LinkedinApp;
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  return `${authEndpoint}?${new URLSearchParams({
    response_type: "code",
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    state: input.state,
    scope: linkedinScopes[input.app].join(" "),
  })}`;
}

export async function exchangeCode(input: {
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
  fetch?: typeof fetch;
  now?: Date;
}): Promise<LinkedinToken> {
  const response = await (input.fetch ?? fetch)(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: input.redirectUri,
      client_id: input.clientId,
      client_secret: input.clientSecret,
    }),
    signal: AbortSignal.timeout(30000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body?.access_token !== "string")
    throw new Error(
      `LinkedIn refused the sign-in (${response.status}): ${body?.error_description ?? body?.error ?? "no reason given"}`,
    );
  const now = input.now ?? new Date();
  return {
    accessToken: body.access_token,
    expiresAt: new Date(
      now.getTime() + (Number(body.expires_in) || 0) * 1000,
    ).toISOString(),
    scopes: String(body.scope ?? "")
      .split(/[\s,]+/)
      .filter(Boolean),
    connectedAt: now.toISOString(),
  };
}

export async function readLinkedinToken(
  path: string,
): Promise<LinkedinToken | null> {
  try {
    const token = JSON.parse(await readFile(path, "utf8"));
    return typeof token?.accessToken === "string" ? token : null;
  } catch {
    return null;
  }
}

// Same as the Gmail token: a fresh 0600 file renamed into place, outside git and the database.
export async function writeLinkedinToken(
  path: string,
  token: LinkedinToken,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const draft = `${path}.${process.pid}.tmp`;
  await rm(draft, { force: true });
  await writeFile(draft, `${JSON.stringify(token, null, 2)}\n`, {
    mode: 0o600,
    flag: "wx",
  });
  await rename(draft, path);
}
