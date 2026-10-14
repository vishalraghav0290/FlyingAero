/**
 * Picks the live data source.
 *
 * DATA_SOURCE=opensky  OpenSky only (works from home / residential connections)
 * DATA_SOURCE=adsb     adsb.lol / adsb.fi only (works from cloud hosts such as Vercel)
 * DATA_SOURCE=auto     OpenSky first. If it can't be reached (relay down, 403/429/5xx), ADS-B is
 *                      used until a retry succeeds. The retry waits 1 min after the first failure
 *                      and doubles up to 10 min; before retrying, the relay is pinged so a dead
 *                      tunnel doesn't stall a request.
 *
 * Every answer is tagged with the source that produced it (`kind`). Callers must never mix
 * answers, caches, histories or tracks of different kinds: the two sources have different
 * clocks, ids, fields and coverage.
 *
 * Browsers can't call OpenSky directly: its CORS policy only allows opensky-network.org.
 */
import { AdsbClient } from './adsb.ts';
import type { OpenSkyClient } from './opensky.ts';
import type { BBox, Credits, StatesResult, Track } from './types.ts';
import { errorMessage, errorRetryAfter, errorStatus } from './types.ts';

const FAILOVER_MIN_MS = 60_000;
const FAILOVER_MAX_MS = 10 * 60_000;
const RATE_LIMIT_MAX_MS = 30 * 60_000;

export type SourceMode = 'opensky' | 'adsb' | 'auto';
export type SourceKind = 'opensky' | 'adsb';

/** Methods `_call` dispatches by name to either client. */
type StateMethod = 'getStates' | 'getStatesByIcao';
type StateMethods = Record<StateMethod, (...args: unknown[]) => Promise<StatesResult | null>>;

/** A states answer and the source that really produced it. */
export interface SourceStates {
  data: StatesResult | null;
  kind: SourceKind;
  /** "OpenSky" or the ADS-B provider(s), e.g. "adsb.lol + adsb.fi". */
  name: string;
}

/** A flight track and the source it came from. */
export interface SourceTrack {
  track: Track | null;
  kind: SourceKind;
}

/** The last time the active source changed, and why. */
export interface SourceSwitch {
  at: number;
  to: SourceKind;
  reason: string;
}

/** One-line, human-readable reason for an OpenSky error (Cloudflare's JSON error pages are boiled down). */
function shortReason(err: unknown, viaRelay: boolean): string {
  const status = errorStatus(err);
  let msg = errorMessage(err).replace(/\s+/g, ' ');
  const title = msg.match(/\"title\":\"([^\"]+)\"/)?.[1]; // e.g. "Error 502: Bad gateway"
  if (title) msg = `HTTP ${status ?? '?'} ${title}`;
  msg = msg.slice(0, 140);
  if (viaRelay && status !== undefined && status >= 500) msg += ' (the home relay or its tunnel is down or restarting)';
  else if (viaRelay && !status) msg += ' (the home relay is unreachable)';
  else if (status === 403) msg += ' (OpenSky refused the request)';
  return msg;
}

export interface SourceClientOptions {
  opensky: OpenSkyClient;
  mode?: string;
}

export class SourceClient {
  opensky: OpenSkyClient;
  adsb: AdsbClient;
  mode: SourceMode;
  /** Auto mode: OpenSky is skipped until this time (0 = not failed over). */
  openskyDownUntil: number;
  /** Consecutive OpenSky failures, for the retry back-off. */
  downCount: number;
  lastSource: SourceKind;
  /** Why OpenSky was skipped most recently (auto mode). */
  lastReason: string | null;
  lastSwitch: SourceSwitch | null;

  constructor({ opensky, mode = 'auto' }: SourceClientOptions) {
    this.opensky = opensky;
    this.adsb = new AdsbClient();
    this.mode = mode === 'opensky' || mode === 'adsb' ? mode : 'auto';
    this.openskyDownUntil = 0;
    this.downCount = 0;
    this.lastSource = this.mode === 'adsb' ? 'adsb' : 'opensky';
    this.lastReason = null;
    this.lastSwitch = null;
  }

  /** While ADS-B is standing in for OpenSky: why, and when OpenSky is tried again. */
  get fallbackNote(): string | null {
    if (this.mode !== 'auto' || Date.now() >= this.openskyDownUntil) return null;
    const secs = Math.max(1, Math.round((this.openskyDownUntil - Date.now()) / 1000));
    return `OpenSky skipped: ${this.lastReason ?? 'unavailable'}. Retrying in ${secs} s.`;
  }

  /** Source the next request will try first. */
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

  _markDown(err: unknown): void {
    const wasUp = this.openskyDownUntil === 0;
    this.downCount += 1;
    const backoff = Math.min(FAILOVER_MAX_MS, FAILOVER_MIN_MS * 2 ** (this.downCount - 1));
    // a 429 says when credits come back; no point asking sooner (capped, in case it's hours)
    const retryAfter = Math.min(RATE_LIMIT_MAX_MS, (errorRetryAfter(err) ?? 0) * 1000);
    const wait = Math.max(backoff, retryAfter);
    this.openskyDownUntil = Date.now() + wait;
    const reason = shortReason(err, this.opensky.relay);
    this.lastReason = reason;
    const secs = Math.round(wait / 1000);
    if (wasUp) {
      this.lastSwitch = { at: Date.now(), to: 'adsb', reason };
      console.warn(`[aerotrack] Source: OpenSky -> ADS-B (adsb.lol / adsb.fi). Reason: ${reason}. Trying OpenSky again in ${secs} s.`);
    } else {
      console.warn(`[aerotrack] Source: still ADS-B, OpenSky retry failed. Reason: ${reason}. Next try in ${secs} s (failure #${this.downCount}).`);
    }
  }

  _markUp(): void {
    if (this.openskyDownUntil !== 0) {
      this.lastSwitch = { at: Date.now(), to: 'opensky', reason: 'OpenSky answered again' };
      console.log(`[aerotrack] Source: ADS-B -> OpenSky. OpenSky answered again after ${this.downCount} failed attempt(s).`);
    }
    this.downCount = 0;
    this.openskyDownUntil = 0;
    this.lastSource = 'opensky';
  }

  /** Auto mode: switch to ADS-B after an error about OpenSky itself. Returns true if switched. */
  _failover(err: unknown): boolean {
    // 400/404-style errors are about the request, not about OpenSky being unusable
    const status = errorStatus(err);
    const unusable = !status || status === 403 || status === 429 || status >= 500;
    if (this.mode !== 'auto' || !unusable) return false;
    // several requests can fail together; only the first one counts as a failure
    if (Date.now() >= this.openskyDownUntil) this._markDown(err);
    return true;
  }

  /**
   * Whether OpenSky should be tried now. After a failover, the first request once the
   * retry time has passed pings the relay first (3 s) instead of waiting out a full timeout.
   */
  async _useOpensky(): Promise<boolean> {
    if (this.kind !== 'opensky') return false;
    if (this.mode === 'auto' && this.openskyDownUntil && !(await this.opensky.ping())) {
      // concurrent requests ping together; the first to fail extends the wait for everyone
      if (Date.now() >= this.openskyDownUntil) this._markDown(new Error('relay did not answer'));
      return false;
    }
    return true;
  }

  async _call(method: StateMethod, args: unknown[]): Promise<SourceStates> {
    if (await this._useOpensky()) {
      try {
        const data = await (this.opensky as StateMethods)[method](...args);
        this._markUp();
        return { data, kind: 'opensky', name: 'OpenSky' };
      } catch (err) {
        if (!this._failover(err)) throw err;
      }
    }
    const data = await (this.adsb as StateMethods)[method](...args);
    this.lastSource = 'adsb';
    const name = data?.provider ?? data?.sources?.join(' + ') ?? this.adsb.provider;
    return { data, kind: 'adsb', name };
  }

  getStates(bbox?: BBox | null): Promise<SourceStates> {
    return this._call('getStates', [bbox]);
  }

  getStatesByIcao(list: string[]): Promise<SourceStates> {
    return this._call('getStatesByIcao', [list]);
  }

  /**
   * Flight track from the active source only: OpenSky's /tracks, or adsb.lol's trace.
   * There is no fallback to the other source, so a trail never joins two data sets.
   */
  async getTrack(icao24: string, time = 0): Promise<SourceTrack> {
    if (await this._useOpensky()) {
      try {
        return { track: await this.opensky.getTrack(icao24, time), kind: 'opensky' };
      } catch (err) {
        if (!this._failover(err)) return { track: null, kind: 'opensky' };
        // switched to ADS-B: the trace below belongs to the new source
      }
    }
    try {
      return { track: await this.adsb.getTrack(icao24), kind: 'adsb' };
    } catch {
      return { track: null, kind: 'adsb' };
    }
  }
}
