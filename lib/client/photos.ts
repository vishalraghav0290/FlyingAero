/**
 * Up to 3 aircraft photos from free sources, best quality first:
 *  1. Planespotters.net public API: 1 photo (420x280). Terms followed: browser request
 *     with our Origin, image straight from their CDN, URLs unchanged, photographer credited,
 *     image links to the photo page, JSON cached <= 24 h.
 *  2. Wikimedia Commons, "Category:<REG> (aircraft)": CC-licensed, credited with
 *     author + licence and linked to the file page.
 *  3. airport-data.com free API (looked up by our server, it has no CORS): small 150x100
 *     thumbnails, so only used when neither of the above has a photo.
 * FR24 shows JetPhotos, but JetPhotos belongs to FR24 and has no public API, so we only link to it.
 */
import type { Photo } from '../server/types.ts';

/** A photo as the panel shows it. */
export interface PanelPhoto {
  /** Image URL. */
  src: string;
  /** Photo page the image links to. */
  link: string;
  credit: string;
  /** Site name, e.g. "Planespotters.net". */
  source: string;
  /** Low-resolution thumbnail (airport-data.com). */
  small?: boolean;
}

/** Photo from a source before filtering: Planespotters may have no thumbnail URL. */
type FoundPhoto = Omit<PanelPhoto, 'src'> & { src: string | undefined };

/** Planespotters /pub/photos response (only the fields we use). */
interface PlanespottersResponse {
  photos?: {
    thumbnail?: { src?: string };
    thumbnail_large?: { src?: string };
    link: string;
    photographer?: string;
  }[];
}

/** Commons imageinfo entry (only the fields we use). */
interface CommonsImageInfo {
  url: string;
  thumburl?: string;
  descriptionurl: string;
  extmetadata?: {
    Artist?: { value?: string };
    LicenseShortName?: { value?: string };
  };
}

/** Commons query response (only the fields we use). */
interface CommonsResponse {
  query?: { pages?: Record<string, { imageinfo?: CommonsImageInfo[] }> };
}

interface CacheEntry {
  at: number;
  value: unknown;
}

const MAX_PHOTOS = 3;
const TTL_MS = 24 * 3600_000;
const KEY = 'aerotrack.photos.v3';
const MAX_CACHED = 200;

let cache: Record<string, CacheEntry> = {};
try {
  cache = JSON.parse(sessionStorage.getItem(KEY) || '{}') as Record<string, CacheEntry>;
} catch {
  cache = {};
}
function save(): void {
  const keys = Object.keys(cache);
  if (keys.length > MAX_CACHED) {
    keys.sort((a, b) => cache[a].at - cache[b].at).slice(0, keys.length - MAX_CACHED).forEach((k) => delete cache[k]);
  }
  try {
    sessionStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // storage full or disabled
  }
}
async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache[key];
  // entries under a key are only ever written by the same fn
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
  const value = await fn();
  cache[key] = { at: Date.now(), value };
  save();
  return value;
}

async function planespotters(path: string): Promise<FoundPhoto[]> {
  const res = await fetch(`https://api.planespotters.net/pub/photos/${path}`, { referrerPolicy: 'origin' });
  if (!res.ok) throw new Error(`Planespotters ${res.status}`);
  const p = ((await res.json()) as PlanespottersResponse | null)?.photos?.[0];
  if (!p) return [];
  return [{
    src: p.thumbnail_large?.src || p.thumbnail?.src,
    link: p.link,
    credit: `© ${p.photographer || 'Unknown'}`,
    source: 'Planespotters.net',
  }];
}

// Commons author fields contain HTML. DOMParser documents are inert (no scripts, no image
// loads), and only the text is kept.
const stripHtml = (s: string | undefined): string =>
  new DOMParser().parseFromString(s || '', 'text/html').body.textContent!.trim();

async function commons(reg: string): Promise<FoundPhoto[]> {
  const params = new URLSearchParams({
    action: 'query', format: 'json', origin: '*', generator: 'categorymembers', gcmtype: 'file',
    gcmlimit: '6', gcmtitle: `Category:${reg} (aircraft)`, prop: 'imageinfo', iiprop: 'url|extmetadata',
    iiurlwidth: '960', iiextmetadatafilter: 'Artist|LicenseShortName',
  });
  const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`);
  if (!res.ok) return [];
  const pages = Object.values(((await res.json()) as CommonsResponse | null)?.query?.pages ?? {});
  return pages
    .map((p) => p.imageinfo?.[0])
    .filter((i): i is CommonsImageInfo => Boolean(i?.thumburl && /\.(jpe?g|png|webp)$/i.test(i.url)))
    .map((i) => ({
      src: i.thumburl,
      link: i.descriptionurl,
      credit: `© ${stripHtml(i.extmetadata?.Artist?.value).slice(0, 50) || 'Unknown'} · ${i.extmetadata?.LicenseShortName?.value || 'CC'}`,
      source: 'Wikimedia Commons',
    }));
}

async function airportData(icao24: string): Promise<PanelPhoto[]> {
  const res = await fetch(`/api/photos/${icao24}`);
  if (!res.ok) return [];
  return (((await res.json()) as { photos?: Photo[] }).photos ?? []).map((p) => ({ ...p, credit: `© ${p.photographer}`, small: true }));
}

/** Resolves with up to 3 photos; onProgress gets the list as sources answer. */
export async function findPhotos(
  icao24: string,
  reg: string | null | undefined,
  onProgress?: (photos: PanelPhoto[]) => void,
): Promise<PanelPhoto[]> {
  const lookups: Promise<FoundPhoto[]>[] = [
    cached(`ps:${icao24}`, async () => {
      const byHex = await planespotters(`hex/${encodeURIComponent(icao24)}`);
      return byHex.length || !reg ? byHex : planespotters(`reg/${encodeURIComponent(reg)}`);
    }),
    reg ? cached(`wc:${reg}`, () => commons(reg)) : Promise.resolve([]),
    cached(`ad:${icao24}`, () => airportData(icao24)),
  ];
  const sources = lookups.map((p) => p.catch((): FoundPhoto[] => []));

  const results: FoundPhoto[][] = [[], [], []];
  const merged = (): PanelPhoto[] => {
    const seen = new Set<string>();
    const good = results
      .slice(0, 2)
      .flat()
      .filter((p): p is PanelPhoto => Boolean(p.src && !seen.has(p.src) && seen.add(p.src)));
    // airport-data thumbnails are 150x100: only shown when there's nothing better
    // (results[2] comes from airportData, whose photos always have a src)
    return (good.length ? good : (results[2] as PanelPhoto[])).slice(0, MAX_PHOTOS);
  };
  sources.forEach((p, i) =>
    p.then((list) => {
      results[i] = list;
      onProgress?.(merged());
    }),
  );
  await Promise.all(sources);
  return merged();
}

export const jetPhotosUrl = (reg: string): string => `https://www.jetphotos.com/registration/${encodeURIComponent(reg)}`;
