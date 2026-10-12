import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  // Bootstrap 5.3's SCSS still uses @import and legacy color functions; silence dependency deprecation noise.
  sassOptions: {
    quietDeps: true,
    silenceDeprecations: ["import", "global-builtin", "color-functions", "legacy-js-api"],
  },
};

export default nextConfig;
