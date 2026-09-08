'use client'

import { useState, useEffect, useRef, useCallback } from 'react';
import type { Flight, AircraftType } from './types';
import { smoothFlightHeadings, createHeadingState } from './angleSmoother';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Metres per degree of latitude (constant at any latitude) */
const M_PER_DEG_LAT = 111_320;
const DEG2RAD = Math.PI / 180;

/**
 * Position correction half-life in seconds.
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

/**
 * Trail ring-buffer: max points stored per flight.
 * At 1 point per second → ~3 min of visible history.
 */
const TRAIL_MAX_POINTS = 180;

/** Append a trail point every this many frames (at 60fps = ~4pts/sec for quick visibility) */
const TRAIL_FRAME_INTERVAL = 15;

// ─── Internal state per flight ──────────────────────────────────────────────

interface FlightState {
  // Identity + display
  id: string;
  callsign: string;
  altitude: number;
  velocity: number; // m/s from API
  aircraftType: AircraftType;
  airline: string;
  country: string;
  countryFlag: string;

  // API-reported anchor — snapped to the real API position on each fetch.
  // NOT advanced between fetches; only renderPos moves each frame.
  targetLat: number;
  targetLon: number;
  targetHeading: number; // continuous (unwrapped) from angle smoother

  // Client-side interpolated values (what gets rendered)
  renderLat: number;
  renderLon: number;
  renderHeading: number; // also continuous — only normalised for display

  // Trail ring-buffer: list of [lon, lat] points (oldest first)
  trail: [number, number][];
  trailFrameCounter: number;
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export interface AnimatedFlightsResult {
  flights: Flight[];
  trailMap: Map<string, [number, number][]>;
}

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
 *   5. Append [lon, lat] to trail ring-buffer every TRAIL_FRAME_INTERVAL frames.
 *
 * WHY WE DON'T ADVANCE targetPos:
 *   The server can return stale cached data. If we were also advancing
 *   targetPos on the client, the cached (old) position would arrive and
 *   snap targetPos backward — causing the visible "glitch backward" bug.
 *
 * RESULT: planes glide forward continuously, with small, smooth corrections
 * when real data arrives, zero backward glitches, and an accurate trail.
 */
export function useAnimatedFlights(): AnimatedFlightsResult {
  const [displayFlights, setDisplayFlights] = useState<Flight[]>([]);
  const [trailMap, setTrailMap] = useState<Map<string, [number, number][]>>(new Map());

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
          const hdgRad = s.renderHeading * DEG2RAD;
          const ux = Math.sin(hdgRad);
          const uy = Math.cos(hdgRad);

          const dLat = f.lat - s.renderLat;
          const dLon = (f.lon - s.renderLon) * Math.cos(s.renderLat * DEG2RAD);

          const dot = dLat * uy + dLon * ux;
          if (dot > -0.005) {
            s.targetLat = f.lat;
            s.targetLon = f.lon;
          }

          s.targetHeading = f.heading;
          s.velocity = f.velocity;
          s.altitude = f.altitude;
          s.callsign = f.callsign;
          // Update metadata in case it changed
          s.aircraftType = f.aircraftType;
          s.airline = f.airline;
          s.country = f.country;
          s.countryFlag = f.countryFlag;
        } else {
          // ── Brand-new flight — snap everything to actual position ──
          states.set(f.id, {
            id: f.id,
            callsign: f.callsign,
            altitude: f.altitude,
            velocity: f.velocity,
            aircraftType: f.aircraftType,
            airline: f.airline,
            country: f.country,
            countryFlag: f.countryFlag,
            targetLat: f.lat,
            targetLon: f.lon,
            targetHeading: f.heading,
            renderLat: f.lat,
            renderLon: f.lon,
            renderHeading: f.heading,
            trail: [[f.lon, f.lat]],
            trailFrameCounter: 0,
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
      const newTrailMap = new Map<string, [number, number][]>();

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
        s.renderLat += (s.targetLat - s.renderLat) * posAlpha;
        s.renderLon += (s.targetLon - s.renderLon) * posAlpha;

        // ─ 3. Heading: smooth rotation toward target ──────────────
        s.renderHeading += (s.targetHeading - s.renderHeading) * hdgAlpha;

        // ─ 4. Trail: append point every TRAIL_FRAME_INTERVAL frames ─
        s.trailFrameCounter++;
        if (s.trailFrameCounter >= TRAIL_FRAME_INTERVAL) {
          s.trailFrameCounter = 0;
          s.trail.push([s.renderLon, s.renderLat]);
          // Ring-buffer: drop oldest point if over limit
          if (s.trail.length > TRAIL_MAX_POINTS) {
            s.trail.shift();
          }
        }

        newTrailMap.set(s.id, s.trail);

        out.push({
          id: s.id,
          callsign: s.callsign,
          lat: s.renderLat,
          lon: s.renderLon,
          heading: s.renderHeading,
          altitude: s.altitude,
          velocity: s.velocity,
          aircraftType: s.aircraftType,
          airline: s.airline,
          country: s.country,
          countryFlag: s.countryFlag,
        });
      }

      setDisplayFlights(out);
      setTrailMap(newTrailMap);
    };

    rafIdRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafIdRef.current);
  }, []);

  return { flights: displayFlights, trailMap };
}
