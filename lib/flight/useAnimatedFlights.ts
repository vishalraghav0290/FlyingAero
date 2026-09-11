'use client'

import { useState, useEffect, useRef, useCallback } from 'react';
import type { Flight } from './types';
import { smoothFlightHeadings, createHeadingState } from './angleSmoother';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Metres per degree of latitude (constant at any latitude) */
const M_PER_DEG_LAT = 111_320;
const DEG2RAD = Math.PI / 180;

/**
 * Position correction half-life in seconds.
 * When new API data arrives, the gap between our predicted position
 * and the real API position halves every this-many seconds.
 * Lower value = snappier correction; 1.5s feels natural for slow-moving icons.
 */
const POS_HALFLIFE = 1.5;

/**
 * Heading correction half-life in seconds.
 * Slightly slower so heading turns feel organic, not snappy.
 */
const HDG_HALFLIFE = 0.35;

/** Target render FPS for the animation loop */
const TARGET_FPS = 60;

/** How often (ms) we poll the API */
const POLL_MS = 10_000;

// ─── Internal state per flight ──────────────────────────────────────────────

interface FlightState {
  // Identity + display
  id: string;
  callsign: string;
  altitude: number;
  velocity: number; // m/s from API

  // API-reported anchor — snapped to the real API position on each fetch.
  // NOT advanced between fetches; only renderPos moves each frame.
  // This prevents the "backward glitch" that occurred when stale cached API
  // positions were behind the client's dead-reckoned renderPos.
  targetLat: number;
  targetLon: number;
  targetHeading: number; // continuous (unwrapped) from angle smoother

  // Client-side interpolated values (what gets rendered)
  renderLat: number;
  renderLon: number;
  renderHeading: number; // also continuous — only normalised for display
}

// ─── Hook ───────────────────────────────────────────────────────────────────

/**
 * Custom hook: Flightradar24-quality smooth animation via dead reckoning.
 *
 * HOW IT WORKS (per frame, ~60fps):
 *
 *   1. Dead-reckon renderPos forward along heading at the flight's velocity.
 *      targetPos is NOT advanced — it stays fixed at the last API truth.
 *
 *   2. Rubber-band renderPos toward targetPos with exponential decay.
 *      This creates a gentle "magnetic" correction that prevents drift
 *      from accumulating indefinitely between API updates.
 *
 *   3. When fresh API data arrives, targetPos SNAPS to the new real
 *      position (which should be close to where renderPos already is,
 *      since we've been dead-reckoning).  Any small gap corrects smoothly.
 *
 *   4. Smoothly rotate renderHeading toward targetHeading.
 *
 * WHY WE DON'T ADVANCE targetPos:
 *   The server can return stale cached data (e.g. when OpenSky is offline
 *   and falls back to the mock simulation). If we were also advancing
 *   targetPos on the client, the cached (old) position would arrive and
 *   snap targetPos backward — causing the visible "glitch backward" bug.
 *   Keeping targetPos fixed means the worst case is a gentle correction
 *   forward or backward, never a jarring jump.
 *
 * RESULT: planes glide forward continuously, with small, smooth corrections
 * when real data arrives, and zero backward glitches.
 */
export function useAnimatedFlights() {
  const [displayFlights, setDisplayFlights] = useState<Flight[]>([]);

  // Mutable refs that persist across renders without triggering them
  const statesRef = useRef(new Map() as Map<string, FlightState>);
  const headingRef = useRef(createHeadingState());
  const rafIdRef = useRef(0);
  const lastFrameRef = useRef(0);

  // ── Fetch + merge API data ──────────────────────────────────────────────

  const fetchAndMerge = useCallback(async () => {
    try {
      const res = await fetch('/api/flight');
      if (!res.ok) return;
      const raw: unknown = await res.json();
      if (!Array.isArray(raw)) return;

      // Unwrap headings so 350→10 becomes a +20° delta, not -340°
      const smoothed = smoothFlightHeadings(
        raw as Flight[],
        headingRef.current,
      );

      const states = statesRef.current;
      const seen = new Set<string>();

      for (const f of smoothed) {
        seen.add(f.id);
        const s = states.get(f.id);

        if (s) {
          // ── Existing flight ──────────────────────────────────────
          // Snap targetPos to the new API truth only if it is at least
          // as far forward (in the direction of travel) as the current
          // renderPos.  This guards against stale cached API responses
          // that would otherwise pull the plane backward.
          //
          // We measure "forward progress" as the dot product of the
          // displacement vector with the current heading unit vector.
          // If the API position is behind renderPos we keep the old
          // target so the rubber-band continues correcting gently forward.
          const hdgRad = s.renderHeading * DEG2RAD;
          const ux = Math.sin(hdgRad); // heading unit vector (lon component)
          const uy = Math.cos(hdgRad); // heading unit vector (lat component)

          const dLat = f.lat - s.renderLat;
          const dLon = (f.lon - s.renderLon) * Math.cos(s.renderLat * DEG2RAD);

          // dot > 0 → API pos is ahead of renderPos → safe to snap
          // dot ≤ 0 → API pos is behind → skip snap, keep existing target
          const dot = dLat * uy + dLon * ux;
          if (dot > -0.005) { // tiny tolerance for floating-point noise
            s.targetLat = f.lat;
            s.targetLon = f.lon;
          }

          s.targetHeading = f.heading;
          s.velocity = f.velocity;
          s.altitude = f.altitude;
          s.callsign = f.callsign;
        } else {
          // ── Brand-new flight — snap everything to actual position ──
          states.set(f.id, {
            id: f.id,
            callsign: f.callsign,
            altitude: f.altitude,
            velocity: f.velocity,
            targetLat: f.lat,
            targetLon: f.lon,
            targetHeading: f.heading,
            renderLat: f.lat,
            renderLon: f.lon,
            renderHeading: f.heading,
          });
        }
      }

      // Prune flights that vanished from the API
      for (const id of states.keys()) {
        if (!seen.has(id)) states.delete(id);
      }
    } catch (e) {
      console.error('Flight fetch error:', e);
    }
  }, []);

  // ── Start API polling ───────────────────────────────────────────────────

  useEffect(() => {
    fetchAndMerge();
    const id = setInterval(fetchAndMerge, POLL_MS);
    return () => clearInterval(id);
  }, [fetchAndMerge]);

  // ── Animation loop (dead reckoning + rubber-band correction) ────────────

  useEffect(() => {
    const frameMs = 1000 / TARGET_FPS;

    const tick = (now: number) => {
      rafIdRef.current = requestAnimationFrame(tick);

      // Throttle to TARGET_FPS
      const elapsed = now - lastFrameRef.current;
      if (elapsed < frameMs) return;
      lastFrameRef.current = now - (elapsed % frameMs);

      // dt in seconds, capped to avoid huge jumps on tab-switch
      const dt = Math.min(elapsed / 1000, 0.15);

      const states = statesRef.current;
      if (states.size === 0) return;

      // Exponential-decay blend factor (frame-rate independent)
      const posAlpha = 1 - Math.pow(0.5, dt / POS_HALFLIFE);
      const hdgAlpha = 1 - Math.pow(0.5, dt / HDG_HALFLIFE);

      const out: Flight[] = [];

      for (const s of states.values()) {
        // ─ 1. Dead reckoning: advance renderPos forward ────────────
        //    Only renderPos is dead-reckoned; targetPos stays fixed at
        //    the last API truth.  This prevents stale cached API positions
        //    from causing a "snap backward" glitch.
        const hdgRad = s.renderHeading * DEG2RAD;
        const v = s.velocity; // m/s

        const dLatDeg = (v * Math.cos(hdgRad) * dt) / M_PER_DEG_LAT;
        const cosLat = Math.cos(s.renderLat * DEG2RAD);
        const dLonDeg = cosLat > 1e-6
          ? (v * Math.sin(hdgRad) * dt) / (M_PER_DEG_LAT * cosLat)
          : 0;

        s.renderLat += dLatDeg;
        s.renderLon += dLonDeg;

        // ─ 2. Rubber-band: gently pull renderPos toward API truth ──
        //    Between API updates targetPos stays fixed, so the rubber-band
        //    creates a gentle forward bias correcting accumulated drift.
        //    With POS_HALFLIFE = 1.5s the correction is subtle and smooth.
        s.renderLat += (s.targetLat - s.renderLat) * posAlpha;
        s.renderLon += (s.targetLon - s.renderLon) * posAlpha;

        // ─ 4. Heading: smooth rotation toward target ──────────────
        // Both values are continuous/unwrapped, so simple lerp works.
        s.renderHeading += (s.targetHeading - s.renderHeading) * hdgAlpha;

        out.push({
          id: s.id,
          callsign: s.callsign,
          lat: s.renderLat,
          lon: s.renderLon,
          heading: s.renderHeading,
          altitude: s.altitude,
          velocity: s.velocity,
        });
      }

      setDisplayFlights(out);
    };

    rafIdRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafIdRef.current);
  }, []);

  return displayFlights;
}
