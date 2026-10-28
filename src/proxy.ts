import { NextRequest, NextResponse } from "next/server";
import { portlessOrigin } from "./lib/local-access";
import { timingSafeEqual } from "node:crypto";
export function proxy(request: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) {
    const devOrigin = portlessOrigin();
    if (
      ["localhost", "127.0.0.1", "[::1]"].includes(request.nextUrl.hostname) ||
      (devOrigin && request.nextUrl.hostname === new URL(devOrigin).hostname)
    )
      return NextResponse.next();
    return new NextResponse(
      "Set DASHBOARD_PASSWORD before exposing this dashboard beyond localhost.",
      { status: 403 },
    );
  }
  const expected = Buffer.from(
    `Basic ${Buffer.from(`arinze:${password}`).toString("base64")}`,
  );
  const provided = Buffer.from(request.headers.get("authorization") ?? "");
  if (
    provided.length === expected.length &&
    timingSafeEqual(provided, expected)
  )
    return NextResponse.next();
  return new NextResponse("Private dashboard", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Jobdesk", charset="UTF-8"' },
  });
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
