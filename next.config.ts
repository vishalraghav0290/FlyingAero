import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The API reads ./data at runtime (aircraft database, airports, navaids, borders). Those
  // files aren't imported, so tell the bundler to ship them with the API functions.
  outputFileTracingIncludes: {
    '/api/**': ['./data/**/*'],
  },
  outputFileTracingExcludes: {
    '*': ['./_reference/**', './_legacy-express/**'],
  },
};

export default nextConfig;
