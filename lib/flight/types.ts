export type AircraftType = 'jet' | 'widebody' | 'helicopter' | 'cargo' | 'light';

export interface Flight {
  id: string;              // ICAO hex
  callsign: string;
  lon: number;
  lat: number;
  heading: number;         // degrees (continuous/unwrapped internally)
  altitude: number;        // feet (adsb.lol native) — 0 if on ground
  velocity: number;        // knots (adsb.lol native)
  verticalRate: number;    // ft/min — positive = climbing, negative = descending
  onGround: boolean;

  // Aircraft metadata
  aircraftType: AircraftType;
  aircraftModel: string;   // ICAO type code, e.g. "B738", "A320", "AS50"
  registration: string;    // tail number e.g. "N432UA"
  squawk: string;          // 4-digit octal transponder code
  isEmergency: boolean;    // squawk 7500/7600/7700

  // Airline metadata
  airline: string;
  country: string;
  countryFlag: string;     // emoji flag
}
