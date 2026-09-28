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
 * Higher = smoother. 4s gives very gentle correction that avoids visible
 * teleporting when providers report slightly different positions.
 */
const POS_HALFLIFE = 4.0;

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
 * At 1 point per second → ~5 min of visible history.
 * This is the trail from "takeoff" (when the flight was first detected).
 */
const TRAIL_MAX_POINTS = 300;

/** Append a trail point every this many frames (at 60fps = ~4pts/sec for quick visibility) */
const TRAIL_FRAME_INTERVAL = 15;

/**
 * How many consecutive API cycles a flight can be "missing" before we prune it.
 * With round-robin providers, different cycles return different flight subsets.
 * Keeping flights alive for 3 missed polls (~30s) prevents the mass-disappearance
 * bug where hundreds of planes vanish because a different provider was queried.
 */
const MAX_MISSED_POLLS = 3;

// ─── Internal state per flight ──────────────────────────────────────────────

interface FlightState {
  // Identity + display
  id: string;
  callsign: string;
  altitude: number;       // feet
  velocity: number;       // knots
  verticalRate: number;   // ft/min
  onGround: boolean;
  aircraftType: AircraftType;
  aircraftModel: string;
  registration: string;
  squawk: string;
  isEmergency: boolean;
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
  // This is built continuously for ALL flights from when they first appear,
  // not just when selected. This simulates a trail "from takeoff."
  trail: [number, number][];
  trailFrameCounter: number;

  // How many consecutive polls this flight has been missing from the API
  missedPolls: number;
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
 *   5. Append [lon, lat] to trail ring-buffer every TRAIL_FRAME_INTERVAL
 *      frames FOR ALL FLIGHTS — not just the selected one. This means
 *      every flight has a trail building since it was first detected,
 *      simulating a trail "from takeoff."
 *
 *   6. Flights are kept alive for MAX_MISSED_POLLS cycles before pruning,
 *      so they don't vanish when a different provider is queried.
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
          // ── Existing flight: update target position ──────────────
          // Forward-only guard: reject API positions that are behind
          // the current render position (stale data from cache/provider hop).
          const dLat = f.lat - s.renderLat;
          const dLon = f.lon - s.renderLon;
          const hdgRad = s.renderHeading * (Math.PI / 180);
          const fwd = dLat * Math.cos(hdgRad) + dLon * Math.sin(hdgRad);

          if (fwd > -0.002) {
            // Position is forward or nearly sideways — accept it
            s.targetLat = f.lat;
            s.targetLon = f.lon;
          }
          // If behind, keep old targetPos — dead reckoning will advance naturally
          s.targetHeading = f.heading;
          s.velocity = f.velocity;
          s.altitude = f.altitude;
          s.verticalRate = f.verticalRate;
          s.onGround = f.onGround;
          s.callsign = f.callsign;
          s.aircraftType = f.aircraftType;
          s.aircraftModel = f.aircraftModel;
          s.registration = f.registration;
          s.squawk = f.squawk;
          s.isEmergency = f.isEmergency;
          s.airline = f.airline;
          s.country = f.country;
          s.countryFlag = f.countryFlag;
          // Reset missed poll counter — this flight is alive
          s.missedPolls = 0;
        } else {
          // ── Brand-new flight — snap everything to actual position ──
          states.set(f.id, {
            id: f.id,
            callsign: f.callsign,
            altitude: f.altitude,
            velocity: f.velocity,
            verticalRate: f.verticalRate,
            onGround: f.onGround,
            aircraftType: f.aircraftType,
            aircraftModel: f.aircraftModel,
            registration: f.registration,
            squawk: f.squawk,
            isEmergency: f.isEmergency,
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
            missedPolls: 0,
          });
        }
      }

      // Graceful pruning: increment missedPolls for flights not in this response.
      // Only delete after MAX_MISSED_POLLS consecutive misses.
      // This prevents the "mass disappearance" bug caused by round-robin
      // provider rotation returning different flight subsets each cycle.
      for (const [id, state] of states.entries()) {
        if (!seen.has(id)) {
          state.missedPolls++;
          if (state.missedPolls > MAX_MISSED_POLLS) {
            states.delete(id);
          }
        }
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
      const dt = Math.min(elapsed / 1000, 0.1);

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
        // velocity is in knots → convert to m/s for dead-reckoning
        const v = s.velocity * 0.514444; // knots → m/s

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
        // Trail is built for ALL flights continuously, not just selected.
        // This gives every flight a trail from when it was first detected
        // (simulating a "from takeoff" trail).
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
          verticalRate: s.verticalRate,
          onGround: s.onGround,
          aircraftType: s.aircraftType,
          aircraftModel: s.aircraftModel,
          registration: s.registration,
          squawk: s.squawk,
          isEmergency: s.isEmergency,
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
