import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://aerotrack.vishalraghav.dev';

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'always',
      priority: 1,
    },
    // Add the API docs / about endpoint if you ever create them
    // Future pages can be added here for expanded coverage
  ];
}
