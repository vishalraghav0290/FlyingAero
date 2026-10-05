import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'aerotrack.vishalraghav.dev — Real-Time Global Flight Tracker',
    short_name: 'aerotrack.vishalraghav.live',
    description:
      'Track flights in real-time on an interactive 3D map. View live positions, altitude, speed, heading, and flight trails for thousands of aircraft worldwide. Built by Vishal Raghav.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0c12',
    theme_color: '#0a0c12',
    orientation: 'any',
    categories: ['utilities', 'navigation', 'travel'],
    icons: [
      {
        src: '/favicon.ico',
        sizes: 'any',
        type: 'image/x-icon',
      },
    ],
  };
}
