export type AircraftType = 'jet' | 'widebody' | 'helicopter' | 'cargo';

export interface Flight {
  id: string;
  callsign: string;
  lon: number;
  lat: number;
  heading: number;
  altitude: number;
  velocity: number;
  // Enriched metadata (derived from callsign / assigned on mock)
  aircraftType: AircraftType;
  airline: string;
  country: string;
  countryFlag: string; // emoji flag
}
