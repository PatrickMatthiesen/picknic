import type { NextConfig } from "next";
import { MAX_RECIPE_PHOTOS_BYTES } from "./src/lib/recipe-photo-limits";

const nextConfig: NextConfig = {
  experimental: {
    // The AuthKit proxy buffers the multipart upload before handing it to the route.
    proxyClientMaxBodySize: MAX_RECIPE_PHOTOS_BYTES + 1024 * 1024,
  },
  output: "standalone",
};

export default nextConfig;
