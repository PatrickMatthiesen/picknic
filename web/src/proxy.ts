import {
  applyResponseHeaders,
  authkit,
  handleAuthkitHeaders,
  partitionAuthkitHeaders,
} from "@workos-inc/authkit-nextjs";
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

export default async function proxy(request: NextRequest) {
  const { session, headers, authorizationUrl } = await authkit(request);

  if (isUnauthenticatedApiRequest(request, session.user)) {
    const { responseHeaders } = partitionAuthkitHeaders(request, headers);
    return applyResponseHeaders(unauthorizedApiResponse(), responseHeaders);
  }

  if (isUnauthenticatedProtectedPage(request, session.user) && authorizationUrl) {
    return handleAuthkitHeaders(request, headers, { redirect: authorizationUrl });
  }

  return handleAuthkitHeaders(request, headers);
}

export const config = {
  matcher: [
    "/",
    "/home/:path*",
    "/sign-in",
    "/sign-up",
    "/api/:path*",
    "/recipes/:path*",
    "/planner/:path*",
    "/cook/:path*",
    "/shopping-list/:path*",
    "/pantry/:path*",
    "/profile/:path*",
  ],
};
