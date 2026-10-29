import type { Server } from "node:http";

// LinkedIn only redirects to a URL listed on the app's Auth tab, matched exactly, so the
// sign-in listener never falls back to a random port the way the Gmail one does.
export const linkedinApps = {
  // "JobDesk": Share on LinkedIn + Sign In with LinkedIn using OpenID Connect.
  share: {
    env: "LINKEDIN_REDIRECT_URI",
    defaultRedirect: "http://127.0.0.1:53682/callback",
  },
  // "JobDesk Data": Member Data Portability API (Member), read-only.
  data: {
    env: "LINKEDIN_DATA_REDIRECT_URI",
    defaultRedirect: "http://127.0.0.1:53683/callback",
  },
} as const;
export type LinkedinApp = keyof typeof linkedinApps;

export type CallbackAddress = {
  uri: string;
  host: string;
  port: number;
  path: string;
};

export function callbackAddress(
  app: LinkedinApp,
  env: Record<string, string | undefined> = process.env,
): CallbackAddress {
  const { env: name, defaultRedirect } = linkedinApps[app];
  const uri = env[name]?.trim() || defaultRedirect;
  const refuse = () =>
    new Error(
      `${name} must be a loopback address with a fixed port, like ${defaultRedirect}, and must match the app's Auth tab on LinkedIn.`,
    );
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    throw refuse();
  }
  const port = Number(url.port);
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    !Number.isInteger(port) ||
    port < 1024 ||
    port > 65535
  )
    throw refuse();
  return { uri, host: url.hostname, port, path: url.pathname };
}

// Listens on exactly the configured port. A busy port is an error, never a reason to move.
export function listenOnCallback(
  server: Server,
  address: CallbackAddress,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const failed = (error: NodeJS.ErrnoException) => {
      server.off("listening", ready);
      reject(
        error.code === "EADDRINUSE"
          ? new Error(
              `Port ${address.port} is already in use, so LinkedIn cannot reach ${address.uri}. Close the program using it (lsof -nP -iTCP:${address.port} -sTCP:LISTEN shows which) and try again.`,
            )
          : error,
      );
    };
    const ready = () => {
      server.off("error", failed);
      resolve();
    };
    server.once("error", failed);
    server.once("listening", ready);
    server.listen(address.port, address.host);
  });
}
