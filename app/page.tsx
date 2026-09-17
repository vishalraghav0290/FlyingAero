import AeroTrackApp from '@/components/AeroTrackApp';
import { homeGraph, jsonLd } from '@/lib/structuredData';

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(homeGraph) }} />
      <AeroTrackApp />
    </>
  );
}
