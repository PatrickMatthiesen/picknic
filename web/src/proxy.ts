import {
  applyResponseHeaders,
  authkit,
  handleAuthkitHeaders,
  partitionAuthkitHeaders,
} from "@workos-inc/authkit-nextjs";
import type { NextRequest } from "next/server";
import {
  isUnauthenticatedApiRequest,
  isUnauthenticatedProtectedPage,
  unauthorizedApiResponse,
} from "@/lib/proxy-authorization";

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
