import type { Flight } from './types';

/**
 * Calculates the shortest rotational delta between two angles.
 *
 * The key insight: the raw difference (newAngle - oldAngle) might be
 * something like +340° or -340°. By normalising it into the (-180, +180]
 * range we guarantee the interpolation always takes the short way round.
 *
 * Examples:
 *   shortestAngleDelta(350, 10)  →  +20  (20° right turn)
 *   shortestAngleDelta(10, 350)  →  -20  (20° left turn)
 *   shortestAngleDelta(90, 270)  →  +180 (half turn – ambiguous, but consistent)
 */
export function shortestAngleDelta(from: number, to: number): number {
  let delta = ((to - from) % 360);

  // Force into (-180, +180]
  if (delta > 180) delta -= 360;
  if (delta <= -180) delta += 360;

  return delta;
}

/**
 * A map of flight‑id → the last *continuous* (unwrapped) heading we emitted.
 *
 * "Continuous" means the value is NOT clamped to [0, 360). It can be 730,
 * -45, or any real number. Deck.gl's transition engine doesn't care about
 * the absolute value — only that the numerical gap between the old and new
 * value matches the *real* angular change the plane made.
 */
export type HeadingState = Map<string, number>;

/** Factory for use in .tsx files where `new Map<K,V>()` clashes with the JSX parser */
export function createHeadingState(): HeadingState {
  return new Map<string, number>();
}

/**
 * Takes raw API flights (headings in 0‑360) and a mutable heading‑state map,
 * and returns a new array where each flight's `heading` is a continuous,
 * unwrapped angle suitable for smooth Deck.gl transitions.
 *
 * Flights that appear for the first time are seeded with their raw heading.
 * Flights that disappear from the API are pruned from the state map to
 * prevent unbounded memory growth.
 */
export function smoothFlightHeadings(
  incoming: Flight[],
  state: HeadingState,
): Flight[] {
  const activeIds = new Set<string>();

  const smoothed = incoming.map((flight) => {
    activeIds.add(flight.id);

    const prev = state.get(flight.id);

    if (prev === undefined) {
      // First time we see this flight – seed with raw heading
      state.set(flight.id, flight.heading);
      return flight;                       // no modification needed
    }

    // Compute the shortest path from where we left off.
    // `prev` is continuous (might be 730°), but `flight.heading` is raw [0, 360).
    // We must normalize prev to [0, 360) for the delta comparison to be correct.
    const prevNormalized = ((prev % 360) + 360) % 360;
    const delta = shortestAngleDelta(prevNormalized, flight.heading);
    const continuous = prev + delta;

    state.set(flight.id, continuous);

    return { ...flight, heading: continuous };
  });

  // Prune flights that are no longer in the API response
  for (const id of state.keys()) {
    if (!activeIds.has(id)) {
      state.delete(id);
    }
  }

  return smoothed;
}
