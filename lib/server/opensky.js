/**
 * OpenSky Network REST client.
 *
 * - OAuth2 client-credentials auth (the only method OpenSky accepts since March 2026).
 *   Tokens are reused until ~30 s before expiry and refreshed once on a 401.
 * - Tracks the credit balance OpenSky reports in `X-Rate-Limit-Remaining`
 *   (states, tracks and flights each have their own daily bucket).
 */

const TOKEN_URL =
  'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
const API_BASE = 'https://opensky-network.org/api';
const REQUEST_TIMEOUT_MS = 20_000;

export class OpenSkyError extends Error {
  constructor(message, { status = 0, retryAfterSec = null } = {}) {
    super(message);
    this.name = 'OpenSkyError';
    this.status = status;
    this.retryAfterSec = retryAfterSec;
  }
}

export class OpenSkyClient {
  /**
   * relayUrl / relayKey: optional relay (relay/server.js on Koyeb or Render) for hosts whose
   * IPs OpenSky blocks. When set, the token and API calls go through it.
   */
  constructor({ clientId, clientSecret, relayUrl, relayKey } = {}) {
    this.clientId = clientId || '';
    this.clientSecret = clientSecret || '';
    const relay = (relayUrl || '').replace(/\/+$/, '');
    this.relay = Boolean(relay);
    this.tokenUrl = relay ? `${relay}/token` : TOKEN_URL;
    this.apiBase = relay ? `${relay}/api` : API_BASE;
    this.extraHeaders = relay ? { 'X-Relay-Key': relayKey || '' } : {};
    this._token = null;
    this._tokenExpiry = 0;
    this._tokenPromise = null;
    /** Last known remaining credits per bucket: { states, tracks, flights } */
    this.credits = { states: null, tracks: null, flights: null };
  }

  get authenticated() {
    return Boolean(this.clientId && this.clientSecret);
  }

  async _getToken({ force = false } = {}) {
    if (!this.authenticated) return null;
    if (!force && this._token && Date.now() < this._tokenExpiry - 30_000) return this._token;
    if (this._tokenPromise) return this._tokenPromise;

    this._tokenPromise = (async () => {
      const res = await fetch(this.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...this.extraHeaders },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.clientId,
          client_secret: this.clientSecret,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) {
        // Never include the secret in errors; the body is Keycloak's error JSON.
        const text = await res.text().catch(() => '');
        throw new OpenSkyError(`Token request failed (${res.status}) ${text.slice(0, 160)}`, {
          status: res.status,
        });
      }
      const json = await res.json();
      this._token = json.access_token;
      this._tokenExpiry = Date.now() + (json.expires_in || 1800) * 1000;
      return this._token;
    })();

    try {
      return await this._tokenPromise;
    } finally {
      this._tokenPromise = null;
    }
  }

  async _get(path, params, bucket) {
    const url = new URL(this.apiBase + path);
    for (const [k, v] of Object.entries(params || {})) {
      if (v === undefined || v === null || v === '') continue;
      if (Array.isArray(v)) v.forEach((item) => url.searchParams.append(k, item));
      else url.searchParams.set(k, String(v));
    }

    const doFetch = async (token) => {
      const headers = { Accept: 'application/json', ...this.extraHeaders };
      if (token) headers.Authorization = `Bearer ${token}`;
      return fetch(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    };

    let res = await doFetch(await this._getToken());
    if (res.status === 401 && this.authenticated) {
      res = await doFetch(await this._getToken({ force: true }));
    }

    const remaining = res.headers.get('x-rate-limit-remaining');
    if (remaining !== null && bucket) this.credits[bucket] = Number(remaining);

    if (res.status === 429) {
      const retryAfterSec = Number(res.headers.get('x-rate-limit-retry-after-seconds')) || 60;
      if (bucket) this.credits[bucket] = 0;
      throw new OpenSkyError('OpenSky credit limit reached', { status: 429, retryAfterSec });
    }
    if (res.status === 404) return null; // e.g. no track for this aircraft
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new OpenSkyError(`OpenSky ${path} failed (${res.status}) ${text.slice(0, 160)}`, {
        status: res.status,
      });
    }
    return res.json();
  }

  /**
   * Live state vectors. `bbox` omitted = whole world.
   * extended=1 adds the ADS-B emitter category (used to pick the aircraft silhouette).
   */
  getStates(bbox) {
    const params = { extended: 1 };
    if (bbox) Object.assign(params, bbox);
    return this._get('/states/all', params, 'states');
  }

  /** States for specific aircraft (used to keep the selected flight even when off-screen). */
  getStatesByIcao(icao24List) {
    return this._get('/states/all', { extended: 1, icao24: icao24List }, 'states');
  }

  /** Track (waypoints) of an aircraft. time=0 is the live track. */
  getTrack(icao24, time = 0) {
    return this._get('/tracks/all', { icao24, time }, 'tracks');
  }
}
