/**
 * Picks the live data source.
 *
 * DATA_SOURCE=opensky  OpenSky only (works from home / residential connections)
 * DATA_SOURCE=adsb     adsb.lol / adsb.fi only (works from cloud hosts such as Vercel)
 * DATA_SOURCE=auto     default: OpenSky first. If it can't be reached, refuses us, or the
 *                      daily credits run out, use ADS-B for FAILOVER_MS, then try OpenSky again.
 *
 * Browsers can't call OpenSky directly: its CORS policy only allows opensky-network.org.
 */
import { AdsbClient } from './adsb.ts';
import type { OpenSkyClient } from './opensky.ts';
import type { BBox, Credits, StatesResult, Track } from './types.ts';
import { errorMessage, errorStatus } from './types.ts';

const FAILOVER_MS = 15 * 60_000;

export type SourceMode = 'opensky' | 'adsb' | 'auto';
export type SourceKind = 'opensky' | 'adsb';

/** Methods `_call` dispatches by name to either client. */
type StateMethod = 'getStates' | 'getStatesByIcao';
type StateMethods = Record<StateMethod, (...args: unknown[]) => Promise<StatesResult | null>>;

export interface SourceClientOptions {
  opensky: OpenSkyClient;
  mode?: string;
}

export class SourceClient {
  opensky: OpenSkyClient;
  adsb: AdsbClient;
  mode: SourceMode;
  openskyDownUntil: number;
  lastSource: SourceKind;

  constructor({ opensky, mode = 'auto' }: SourceClientOptions) {
    this.opensky = opensky;
    this.adsb = new AdsbClient();
    this.mode = mode === 'opensky' || mode === 'adsb' ? mode : 'auto';
    this.openskyDownUntil = 0;
    this.lastSource = this.mode === 'adsb' ? 'adsb' : 'opensky';
  }

  /** Source the next request will use. */
  get kind(): SourceKind {
    if (this.mode === 'adsb') return 'adsb';
    if (this.mode === 'opensky') return 'opensky';
    return Date.now() < this.openskyDownUntil ? 'adsb' : 'opensky';
  }

  get active(): AdsbClient | OpenSkyClient {
    return this.kind === 'adsb' ? this.adsb : this.opensky;
  }

  get authenticated(): boolean {
    return this.opensky.authenticated;
  }

  get credits(): Credits {
    return this.opensky.credits;
  }

  get sourceName(): string {
    return this.lastSource === 'adsb' ? this.adsb.provider : 'OpenSky';
  }

  async _call(method: StateMethod, args: unknown[]): Promise<StatesResult | null> {
    const useAdsb = this.kind === 'adsb';
    if (!useAdsb) {
      try {
        const data = await (this.opensky as StateMethods)[method](...args);
        this.lastSource = 'opensky';
        return data;
      } catch (err) {
        // 400/404-style errors are about the request, not about OpenSky being unusable
        const status = errorStatus(err);
        const unusable = !status || status === 403 || status === 429 || status >= 500;
        if (this.mode === 'opensky' || !unusable) throw err;
        this.openskyDownUntil = Date.now() + FAILOVER_MS;
        console.warn(`[aerotrack] OpenSky unusable (${errorMessage(err)}); using ADS-B for 15 min`);
      }
    }
    const data = await (this.adsb as StateMethods)[method](...args);
    this.lastSource = 'adsb';
    return data;
  }

  getStates(bbox?: BBox | null): Promise<StatesResult | null> {
    return this._call('getStates', [bbox]);
  }

  getStatesByIcao(list: string[]): Promise<StatesResult | null> {
    return this._call('getStatesByIcao', [list]);
  }

  /** Flight history: OpenSky's track when available, otherwise adsb.lol's trace. */
  async getTrack(icao24: string, time = 0): Promise<Track | null> {
    if (this.kind !== 'adsb') {
      try {
        const t = await this.opensky.getTrack(icao24, time);
        if (t?.path?.length) return t;
      } catch {
        // fall through to adsb.lol
      }
    }
    try {
      return await this.adsb.getTrack(icao24);
    } catch {
      return null;
    }
  }
}
