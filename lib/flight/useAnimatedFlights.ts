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
 * The gap between dead-reckoned position and the real API position
 * halves every this-many seconds.  0.4 s → fast but smooth convergence.
 */
const POS_HALFLIFE = 0.4;

/**
 * Heading correction half-life in seconds.
 * Slightly slower than position so heading turns feel organic.
 */
const HDG_HALFLIFE = 0.3;

/** Target render FPS for the animation loop */
const TARGET_FPS = 60;

/** How often (ms) we poll the API */
const POLL_MS = 3_000;

// ─── Internal state per flight ──────────────────────────────────────────────

interface FlightState {
  // Identity + display
  id: string;
  callsign: string;
  altitude: number;
  velocity: number;          // m/s from API

  // API-reported target (where the plane *actually* is)
  targetLat: number;
  targetLon: number;
  targetHeading: number;     // continuous (unwrapped) heading from angle smoother

  // Client-side interpolated values (what gets rendered)
  renderLat: number;
  renderLon: number;
  renderHeading: number;     // also continuous — only normalised for display
}

// ─── Hook ───────────────────────────────────────────────────────────────────

/**
 * Custom hook that fetches flights from the API and provides
 * Flightradar24-quality smooth animation via client-side dead reckoning.
 *
 * Instead of relying on Deck.gl transitions (which slide planes in straight
 * lines regardless of heading), we:
 *   1. Move each plane forward along its heading at its velocity every frame
 *   2. Smoothly rubber-band the rendered position toward the real API position
 *   3. Smoothly interpolate heading toward the API heading
 *
 * This means planes always travel in the direction they're facing.
 */
export function useAnimatedFlights() {
  const [displayFlights, setDisplayFlights] = useState<Flight[]>([]);

  // Mutable refs that persist across renders
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
          // Existing flight — update targets, keep render position as-is
          s.targetLat = f.lat;
          s.targetLon = f.lon;
          s.targetHeading = f.heading;
          s.velocity = f.velocity;
          s.altitude = f.altitude;
          s.callsign = f.callsign;
        } else {
          // Brand-new flight — snap render to actual position
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
        // ─ 1. Dead reckoning: push forward along heading ─────────────
        const hdgRad = s.renderHeading * DEG2RAD;
        const v = s.velocity; // m/s

        const dLatDeg = (v * Math.cos(hdgRad) * dt) / M_PER_DEG_LAT;
        const cosLat = Math.cos(s.renderLat * DEG2RAD);
        const dLonDeg = cosLat > 1e-6
          ? (v * Math.sin(hdgRad) * dt) / (M_PER_DEG_LAT * cosLat)
          : 0;

        s.renderLat += dLatDeg;
        s.renderLon += dLonDeg;

        // ─ 2. Rubber-band: smoothly correct toward API truth ─────────
        s.renderLat += (s.targetLat - s.renderLat) * posAlpha;
        s.renderLon += (s.targetLon - s.renderLon) * posAlpha;

        // ─ 3. Heading: smooth rotation toward target ─────────────────
        // Both renderHeading and targetHeading are continuous/unwrapped,
        // so a simple lerp always takes the shortest path.
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
