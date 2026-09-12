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
 * 0.5s → visually smooth, fully corrected within ~2 seconds.
 */
const POS_HALFLIFE = 0.5;

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

  // API-reported target — gets RESET to real position on each API fetch,
  // then dead-reckoned forward between fetches so the rubber-band
  // doesn't fight the dead reckoning movement.
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
 *   1. Dead-reckon BOTH renderPos and targetPos forward along heading
 *      at the flight's velocity.  This is critical — if we only
 *      dead-reckon renderPos, the rubber-band correction constantly
 *      pulls it back toward the stale targetPos, killing all movement.
 *
 *   2. Rubber-band renderPos toward targetPos.  Between API updates,
 *      target and render move in lockstep (error ≈ 0, correction ≈ 0).
 *      When fresh API data arrives, targetPos SNAPS to the real position.
 *      The small gap (prediction error) is smoothly corrected.
 *
 *   3. Smoothly rotate renderHeading toward targetHeading.
 *
 * RESULT: planes glide forward continuously in the direction they're
 * facing, with small invisible corrections when real data arrives.
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
          // SNAP target to the real API position.
          // Between the last fetch and now, we've been dead-reckoning
          // targetPos forward.  The new API position is "truth", so we
          // reset targetPos.  The difference between the dead-reckoned
          // renderPos and the new targetPos is the prediction error,
          // which the rubber-band will smoothly correct over ~1 second.
          s.targetLat = f.lat;
          s.targetLon = f.lon;
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
        // ─ 1. Dead reckoning: compute forward movement delta ───────
        const hdgRad = s.renderHeading * DEG2RAD;
        const v = s.velocity; // m/s

        const dLatDeg = (v * Math.cos(hdgRad) * dt) / M_PER_DEG_LAT;
        const cosLat = Math.cos(s.renderLat * DEG2RAD);
        const dLonDeg = cosLat > 1e-6
          ? (v * Math.sin(hdgRad) * dt) / (M_PER_DEG_LAT * cosLat)
          : 0;

        // ─ 2. Advance BOTH render AND target by the same delta ────
        //
        // THIS IS THE KEY INSIGHT:
        // If we only advance renderPos, the rubber-band constantly
        // pulls it back toward the stale targetPos → plane doesn't move.
        // By advancing both, they move in lockstep and the rubber-band
        // error stays ≈ 0 between API updates.
        //
        // When fresh API data arrives, targetPos SNAPS to the real
        // position, creating a small error that the rubber-band
        // smoothly corrects.  Result: perfectly smooth movement.
        //
        s.renderLat += dLatDeg;
        s.renderLon += dLonDeg;
        s.targetLat += dLatDeg;
        s.targetLon += dLonDeg;

        // ─ 3. Rubber-band: correct prediction drift toward truth ──
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
