import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function isUnauthenticatedApiRequest(request: NextRequest, user: unknown): boolean {
  return request.nextUrl.pathname.startsWith("/api/") && !user;
}

const protectedPagePrefixes = ["/recipes", "/planner", "/cook", "/shopping-list", "/pantry", "/profile"];

export function isUnauthenticatedProtectedPage(request: NextRequest, user: unknown): boolean {
  return (
    !user &&
    protectedPagePrefixes.some(
      (prefix) =>
        request.nextUrl.pathname === prefix || request.nextUrl.pathname.startsWith(`${prefix}/`),
    )
  );
}

export function unauthorizedApiResponse(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
