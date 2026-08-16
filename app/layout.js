import '@fontsource/open-sans/400.css';
import '@fontsource/open-sans/500.css';
import '@fontsource/open-sans/600.css';
import '@fontsource/roboto-condensed/400.css';
import '@fontsource/roboto-condensed/700.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import './globals.css';

export const metadata = {
  title: 'SkyRadar · Live flight tracker',
  description: 'Live flight tracking map powered by the OpenSky Network.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#222121',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      {/* the map engine sets data-theme / has-panel on <body> at runtime */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
