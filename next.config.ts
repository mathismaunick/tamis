import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Le badge de développement de Next masquerait le bas de la barre latérale sur les captures.
  devIndicators: false,
  // Tamis s'ouvre sur la première étape de l'énoncé : ce que demandent les clients.
  async redirects() {
    return [{ source: "/", destination: "/inbox", permanent: false }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
