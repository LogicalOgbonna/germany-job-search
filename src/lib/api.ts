import { NextRequest, NextResponse } from "next/server";
import { portlessOrigin } from "./local-access";
export function checkMutation(request: NextRequest) {
  const origin = request.headers.get("origin");
  const devOrigin = portlessOrigin();
  // Portless HTTP/2 may rewrite Host to the loopback backend. Compare its
  // forwarded host against our configured origin, never trust it as an origin.
  const fromPortless =
    devOrigin &&
    origin === devOrigin &&
    [
      request.headers.get("host"),
      request.headers.get("x-forwarded-host"),
    ].includes(new URL(devOrigin).host);
  if (!origin || (origin !== request.nextUrl.origin && !fromPortless))
    throw new Error("This action must originate from the dashboard.");
}
export function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Request failed";
  // Do not expose connection strings, database queries, or stack traces.
  const internal =
    /prisma|postgres|database|connect|ECONN|Invalid.*invocation/i.test(message);
  return NextResponse.json(
    {
      error: internal
        ? "The data service is unavailable. Run npm run setup and try again."
        : message.slice(0, 500),
    },
    { status: 400 },
  );
}
