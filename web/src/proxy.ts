import { authkitMiddleware } from "@workos-inc/authkit-nextjs";

export default authkitMiddleware();

export const config = {
  matcher: [
    "/",
    // "/home/:path*",
    "/api/:path*",
    "/recipes/:path*",
    "/planner/:path*",
    "/shopping-list/:path*",
    "/pantry/:path*",
    "/profile/:path*",
  ],
};
