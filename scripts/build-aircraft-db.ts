/**
 * Downloads OpenSky's public aircraft metadata and builds two compact files in ./data:
 *   aircraft-db.tsv     icao24 -> typecode, registration, operator, model ... (one line each)
 *   aircraft-types.json ICAO Doc 8643 designator -> { desc: "L2J", wtc: "M", name }
 *
 * Usage: npm run setup:aircraft-db
 */
import { mkdirSync, createWriteStream, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { ROOT_DIR } from '../lib/server/config.ts';

const BASE = 'https://s3.opensky-network.org/data-samples/metadata/';
const DATA_DIR = path.join(ROOT_DIR, 'data');

/** One entry of aircraft-types.json. */
interface AircraftType {
  desc: string;
  wtc: string;
  name: string;
  mfr: string;
}

/** Newest "aircraft-database-complete-YYYY-MM.csv" in the public bucket. */
async function findLatestDatabase(): Promise<string> {
  const res = await fetch('https://s3.opensky-network.org/data-samples?prefix=metadata/');
  if (!res.ok) throw new Error(`Bucket listing failed (${res.status})`);
  const keys = [...(await res.text()).matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]);
  const db = keys.filter((k) => /aircraft-database-complete-\d{4}-\d{2}\.csv$/.test(k)).sort().at(-1);
  if (!db) throw new Error('No aircraft database found in bucket listing');
  return 'https://s3.opensky-network.org/data-samples/' + db;
}

/**
 * Streaming CSV parser. OpenSky's file uses single quotes as the quote character
 * and '' for empty strings; doubled quotes inside a quoted value are a literal quote.
 */
async function* parseCsv(stream: AsyncIterable<Uint8Array>, quote: string): AsyncGenerator<string[]> {
  const decoder = new TextDecoder();
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let pendingQuote = false; // saw a quote while inQuotes; decide on next char
  let fieldStart = true;

  for await (const chunk of stream) {
    const text = decoder.decode(chunk, { stream: true });
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (pendingQuote) {
          pendingQuote = false;
          if (ch === quote) {
            field += quote; // escaped quote
            continue;
          }
          inQuotes = false; // closing quote; fall through to normal handling
        } else if (ch === quote) {
          pendingQuote = true;
          continue;
        } else {
          field += ch;
          continue;
        }
      }
      if (ch === quote && fieldStart) {
        inQuotes = true;
        fieldStart = false;
      } else if (ch === ',') {
        row.push(field);
        field = '';
        fieldStart = true;
      } else if (ch === '\n') {
        row.push(field);
        yield row;
        row = [];
        field = '';
        fieldStart = true;
      } else if (ch !== '\r') {
        field += ch;
        fieldStart = false;
      }
    }
  }
  if (field || row.length) {
    row.push(field);
    yield row;
  }
}

const clean = (v: string | undefined, max = 60): string => (v || '').replace(/[\t\r\n]+/g, ' ').trim().slice(0, max);

async function buildAircraftDb() {
  const url = await findLatestDatabase();
  console.log(`Downloading ${url.split('/').pop()} ...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);

  const tmp = path.join(DATA_DIR, 'aircraft-db.tsv.tmp');
  const out = createWriteStream(tmp, { encoding: 'utf8' });
  let header: string[] | null = null;
  let col: Record<string, number> = {};
  let kept = 0;
  let total = 0;

  for await (const row of parseCsv(res.body!, "'")) {
    if (!header) {
      header = row;
      header.forEach((name, i) => (col[name] = i));
      for (const need of ['icao24', 'typecode', 'registration', 'operatorIcao', 'model']) {
        if (col[need] === undefined) throw new Error(`Column ${need} missing; format changed?`);
      }
      continue;
    }
    total++;
    const icao24 = (row[col.icao24] || '').toLowerCase();
    if (!/^[0-9a-f]{6}$/.test(icao24)) continue;
    const typecode = clean(row[col.typecode], 4).toUpperCase();
    const reg = clean(row[col.registration], 12).toUpperCase();
    const model = clean(row[col.model]);
    if (!typecode && !reg && !model) continue;
    const line = [
      icao24,
      typecode,
      reg,
      clean(row[col.operatorIcao], 4).toUpperCase(),
      clean(row[col.operator]) || clean(row[col.owner]),
      model,
      clean(row[col.manufacturerName], 40),
      clean(row[col.icaoAircraftClass], 3).toUpperCase(),
      clean(row[col.built], 4),
    ].join('\t');
    if (!out.write(line + '\n')) await new Promise<void>((r) => out.once('drain', r));
    kept++;
    if (total % 100_000 === 0) process.stdout.write(`  ${total.toLocaleString()} rows\r`);
  }
  await new Promise<void>((r) => out.end(r));
  renameSync(tmp, path.join(DATA_DIR, 'aircraft-db.tsv'));
  console.log(`Aircraft: kept ${kept.toLocaleString()} of ${total.toLocaleString()} rows`);
}

async function buildTypes() {
  const res = await fetch(BASE + 'doc8643AircraftTypes.csv');
  if (!res.ok) throw new Error(`Types download failed (${res.status})`);
  const types: Record<string, AircraftType> = {};
  let col: Record<string, number> | null = null;
  for await (const row of parseCsv(res.body!, '"')) {
    if (!col) {
      col = Object.fromEntries(row.map((n, i) => [n, i]));
      continue;
    }
    const designator = (row[col.Designator] || '').toUpperCase();
    if (!designator || types[designator]) continue;
    types[designator] = {
      desc: (row[col.Description] || '').toUpperCase(), // e.g. L2J = landplane, 2 jets
      wtc: (row[col.WTC] || '').toUpperCase(), // L / M / H / J (super)
      name: clean(row[col.ModelFullName]),
      mfr: clean(row[col.ManufacturerCode], 40),
    };
  }
  writeFileSync(path.join(DATA_DIR, 'aircraft-types.json'), JSON.stringify(types));
  console.log(`Types: ${Object.keys(types).length.toLocaleString()} designators`);
}

mkdirSync(DATA_DIR, { recursive: true });
await buildTypes();
await buildAircraftDb();
