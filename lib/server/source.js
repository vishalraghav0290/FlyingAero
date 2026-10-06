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
import { AdsbClient } from './adsb.js';

const FAILOVER_MS = 15 * 60_000;

export class SourceClient {
  constructor({ opensky, mode = 'auto' }) {
    this.opensky = opensky;
    this.adsb = new AdsbClient();
    this.mode = ['opensky', 'adsb'].includes(mode) ? mode : 'auto';
    this.openskyDownUntil = 0;
    this.lastSource = this.mode === 'adsb' ? 'adsb' : 'opensky';
  }

  /** Source the next request will use. */
  get kind() {
    if (this.mode === 'adsb') return 'adsb';
    if (this.mode === 'opensky') return 'opensky';
    return Date.now() < this.openskyDownUntil ? 'adsb' : 'opensky';
  }

  get active() {
    return this.kind === 'adsb' ? this.adsb : this.opensky;
  }

  get authenticated() {
    return this.opensky.authenticated;
  }

  get credits() {
    return this.opensky.credits;
  }

  get sourceName() {
    return this.lastSource === 'adsb' ? this.adsb.provider : 'OpenSky';
  }

  async _call(method, args) {
    const useAdsb = this.kind === 'adsb';
    if (!useAdsb) {
      try {
        const data = await this.opensky[method](...args);
        this.lastSource = 'opensky';
        return data;
      } catch (err) {
        // 400/404-style errors are about the request, not about OpenSky being unusable
        const unusable = !err.status || err.status === 403 || err.status === 429 || err.status >= 500;
        if (this.mode === 'opensky' || !unusable) throw err;
        this.openskyDownUntil = Date.now() + FAILOVER_MS;
        console.warn(`[skyradar] OpenSky unusable (${err.message}); using ADS-B for 15 min`);
      }
    }
    const data = await this.adsb[method](...args);
    this.lastSource = 'adsb';
    return data;
  }

  getStates(bbox) {
    return this._call('getStates', [bbox]);
  }

  getStatesByIcao(list) {
    return this._call('getStatesByIcao', [list]);
  }

  /** Flight history: OpenSky's track when available, otherwise adsb.lol's trace. */
  async getTrack(icao24, time = 0) {
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
