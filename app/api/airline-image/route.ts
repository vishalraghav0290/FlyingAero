import { NextRequest, NextResponse } from 'next/server';

// ─── Server-side image cache (24h TTL) ────────────────────────────────────────
const imageCache = new Map<string, { url: string | null; ts: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Hardcoded overrides for airlines where Wikipedia's thumbnail is the logo
// (We prefer these over random Wikipedia images)
const AIRLINE_WIKI_PAGES: Record<string, string> = {
  'american airlines':    'American_Airlines',
  'delta air lines':      'Delta_Air_Lines',
  'united airlines':      'United_Airlines',
  'southwest airlines':   'Southwest_Airlines',
  'jetblue airways':      'JetBlue_Airways',
  'fedex express':        'FedEx_Express',
  'ups airlines':         'United_Parcel_Service',
  'british airways':      'British_Airways',
  'air france':           'Air_France',
  'lufthansa':            'Lufthansa',
  'emirates':             'Emirates_(airline)',
  'etihad airways':       'Etihad_Airways',
  'qatar airways':        'Qatar_Airways',
  'turkish airlines':     'Turkish_Airlines',
  'singapore airlines':   'Singapore_Airlines',
  'qantas':               'Qantas',
  'all nippon airways':   'All_Nippon_Airways',
  'japan airlines':       'Japan_Airlines',
  'cathay pacific':       'Cathay_Pacific',
  'air china':            'Air_China',
  'china southern':       'China_Southern_Airlines',
  'china eastern':        'China_Eastern_Airlines',
  'korean air':           'Korean_Air',
  'asiana airlines':      'Asiana_Airlines',
  'air india':            'Air_India',
  'indigo':               'IndiGo',
  'iberia':               'Iberia_(airline)',
  'ryanair':              'Ryanair',
  'easyjet':              'EasyJet',
  'klm royal dutch':      'KLM',
  'thai airways':         'Thai_Airways',
  'aeroflot':             'Aeroflot',
  'saudia':               'Saudia',
  'ethiopian airlines':   'Ethiopian_Airlines',
  'kenya airways':        'Kenya_Airways',
  'latam airlines':       'LATAM_Airlines_Group',
  'avianca':              'Avianca',
};

export async function GET(req: NextRequest) {
  const airline = req.nextUrl.searchParams.get('airline')?.trim().toLowerCase();
  if (!airline) {
    return NextResponse.json({ imageUrl: null }, { status: 400 });
  }

  // Check cache
  const cached = imageCache.get(airline);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json({ imageUrl: cached.url });
  }

  // Resolve Wikipedia page title
  const wikiTitle = AIRLINE_WIKI_PAGES[airline]
    ?? airline.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('_');

  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiTitle)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'AeroTrack/1.0 (flight-tracker-educational-project)',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) throw new Error(`Wikipedia ${res.status}`);

    const data = await res.json();
    const imageUrl: string | null = data?.thumbnail?.source ?? null;

    imageCache.set(airline, { url: imageUrl, ts: Date.now() });
    return NextResponse.json({ imageUrl });

  } catch (err) {
    console.warn(`[AeroTrack] airline-image fetch failed for "${airline}":`, err);
    imageCache.set(airline, { url: null, ts: Date.now() });
    return NextResponse.json({ imageUrl: null });
  }
}
