import AeroTrackApp from '@/components/AeroTrackApp';
import { loadConfig } from '@/lib/server/config';
import { homeGraph, jsonLd } from '@/lib/structuredData';

export default function Home() {
  // The loading screen is only for the ADS-B sources. With OpenSky (or auto, which starts on
  // OpenSky) the map opens straight away.
  const showLoader = loadConfig().feed.source === 'adsb';
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(homeGraph) }} />
      <AeroTrackApp showLoader={showLoader} />
    </>
  );
}
