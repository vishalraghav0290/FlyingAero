'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { Flight } from '@/lib/flight/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatAlt(ft: number, onGround: boolean): string {
  if (onGround) return 'On Ground / Taxiing';
  return `${ft.toLocaleString()} ft  ·  ${Math.round(ft * 0.3048).toLocaleString()} m`;
}

function formatSpeed(kts: number): string {
  const kmh = Math.round(kts * 1.852);
  const mph = Math.round(kts * 1.15078);
  return `${kts.toFixed(0)} kts  ·  ${kmh} km/h  ·  ${mph} mph`;
}

function formatHeading(raw: number): string {
  const h = ((Math.round(raw) % 360) + 360) % 360;
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE',
                'S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return `${h}°  ${dirs[Math.round(h / 22.5) % 16]}`;
}

function formatCoords(lat: number, lon: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lonDir = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}°${latDir}  ${Math.abs(lon).toFixed(4)}°${lonDir}`;
}

function formatVerticalRate(fpm: number, onGround: boolean): { label: string; icon: string; color: string } {
  if (onGround) return { label: 'Ground', icon: '🛑', color: '#94a3b8' };
  if (Math.abs(fpm) < 100) return { label: 'Level', icon: '→', color: '#94a3b8' };
  if (fpm > 0) return { label: `+${fpm.toLocaleString()} ft/min`, icon: '↑', color: '#34d399' };
  return { label: `${fpm.toLocaleString()} ft/min`, icon: '↓', color: '#f87171' };
}

// Known ICAO type code → readable model
const MODEL_NAMES: Record<string, string> = {
  B737:'Boeing 737', B738:'Boeing 737-800', B739:'Boeing 737-900',
  B38M:'Boeing 737 MAX 8', B39M:'Boeing 737 MAX 9',
  B752:'Boeing 757-200', B763:'Boeing 767-300', B764:'Boeing 767-400',
  B772:'Boeing 777-200', B773:'Boeing 777-300', B77W:'Boeing 777-300ER',
  B77F:'Boeing 777F',
  B788:'Boeing 787-8', B789:'Boeing 787-9', B78X:'Boeing 787-10',
  B742:'Boeing 747-200', B744:'Boeing 747-400', B748:'Boeing 747-8',
  A318:'Airbus A318', A319:'Airbus A319', A320:'Airbus A320',
  A321:'Airbus A321', A20N:'Airbus A320neo', A21N:'Airbus A321neo',
  A332:'Airbus A330-200', A333:'Airbus A330-300', A339:'Airbus A330-900',
  A359:'Airbus A350-900', A35K:'Airbus A350-1000',
  A380:'Airbus A380', A388:'Airbus A380-800',
  E170:'Embraer E170', E175:'Embraer E175', E190:'Embraer E190', E195:'Embraer E195',
  E75S:'Embraer E175-S', E55P:'Embraer Phenom 300',
  CRJ7:'Bombardier CRJ-700', CRJ9:'Bombardier CRJ-900',
  R22:'Robinson R22', R44:'Robinson R44', R66:'Robinson R66',
  EC35:'Airbus H135', EC45:'Airbus H145', AS50:'Airbus AS350',
  S76:'Sikorsky S-76', B06:'Bell 206', B07:'Bell 407',
  H60:'Sikorsky Black Hawk', A109:'AgustaWestland AW109',
  MD11:'McDonnell Douglas MD-11',
  C172:'Cessna 172', C182:'Cessna 182', C208:'Cessna Grand Caravan',
  C68A:'Cessna Citation Latitude', P28A:'Piper PA-28 Arrow',
  SR22:'Cirrus SR22', BE23:'Beechcraft Musketeer', BE20:'Beechcraft King Air 200',
  C185:'Cessna 185 Skywagon',
};

const AIRCRAFT_IMAGES: Record<string, string> = {
  jet:        '/assets/icon_jet.jpg',
  widebody:   '/assets/icon_widebody.jpg',
  helicopter: '/assets/icon_helicopter.jpg',
  cargo:      '/assets/icon_cargo.jpg',
  light:      '/assets/icon_jet.jpg',
};

const TYPE_LABELS: Record<string, string> = {
  jet:        'Narrow-Body Jet',
  widebody:   'Wide-Body Airliner',
  helicopter: 'Rotorcraft',
  cargo:      'Cargo / Freighter',
  light:      'Light Aircraft',
};

const TYPE_ACCENT: Record<string, string> = {
  jet:        '#fbbf24',
  widebody:   '#a78bfa',
  helicopter: '#34d399',
  cargo:      '#f59e0b',
  light:      '#94a3b8',
};

const TYPE_BG: Record<string, string> = {
  jet:        'rgba(251,191,36,0.12)',
  widebody:   'rgba(167,139,250,0.12)',
  helicopter: 'rgba(52,211,153,0.12)',
  cargo:      'rgba(245,158,11,0.12)',
  light:      'rgba(148,163,184,0.10)',
};

const SQUAWK_LABELS: Record<string, { label: string; color: string }> = {
  '7500': { label: '7500 — HIJACKING', color: '#ef4444' },
  '7600': { label: '7600 — RADIO FAILURE', color: '#f97316' },
  '7700': { label: '7700 — EMERGENCY', color: '#ef4444' },
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  flight: Flight | null;
  trailLength: number; // number of trail points
  onClose: () => void;
}

// ─── Airline image hook ───────────────────────────────────────────────────────

function useAirlineImage(airline: string | null) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const cache = useRef<Map<string, string | null>>(new Map());

  useEffect(() => {
    if (!airline || airline === 'Unknown Operator') { setImageUrl(null); return; }
    const key = airline.toLowerCase();
    if (cache.current.has(key)) { setImageUrl(cache.current.get(key) ?? null); return; }

    setLoading(true);
    fetch(`/api/airline-image?airline=${encodeURIComponent(airline)}`)
      .then(r => r.json())
      .then(({ imageUrl: url }) => {
        cache.current.set(key, url);
        setImageUrl(url);
      })
      .catch(() => setImageUrl(null))
      .finally(() => setLoading(false));
  }, [airline]);

  return { imageUrl, loading };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FlightSidebar({ flight, trailLength, onClose }: Props) {
  const { imageUrl: airlineImage } = useAirlineImage(flight?.airline ?? null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const isOpen = flight !== null;
  const accent = flight ? (flight.isEmergency ? '#ef4444' : TYPE_ACCENT[flight.aircraftType] ?? '#fbbf24') : '#fbbf24';
  const bgAccent = flight ? (flight.isEmergency ? 'rgba(239,68,68,0.15)' : TYPE_BG[flight.aircraftType] ?? TYPE_BG.jet) : TYPE_BG.jet;
  const vr = flight ? formatVerticalRate(flight.verticalRate, flight.onGround) : null;
  const modelName = flight?.aircraftModel ? (MODEL_NAMES[flight.aircraftModel] ?? flight.aircraftModel) : '—';
  const trailSecs = Math.round(trailLength * (15 / 60)); // TRAIL_FRAME_INTERVAL=15 at 60fps
  const trailLabel = trailSecs > 0
    ? `${Math.floor(trailSecs / 60)}m ${(trailSecs % 60).toString().padStart(2,'0')}s of track recorded`
    : 'Tracking started…';
  const squawkInfo = flight?.squawk ? SQUAWK_LABELS[flight.squawk] : null;

  return (
    <>
      {/* Invisible backdrop to dismiss on map click */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 40,
          pointerEvents: isOpen ? 'auto' : 'none',
        }}
      />

      {/* Sidebar panel */}
      <div
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, width: '400px', zIndex: 50,
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.45s cubic-bezier(0.32, 0.72, 0, 1)',
          display: 'flex', flexDirection: 'column',
          background: 'rgba(12, 12, 16, 0.92)',
          backdropFilter: 'blur(48px) saturate(180%)',
          WebkitBackdropFilter: 'blur(48px) saturate(180%)',
          borderLeft: '1px solid rgba(255,255,255,0.07)',
          boxShadow: '-32px 0 100px rgba(0,0,0,0.7)',
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif',
          overflowY: 'auto', overflowX: 'hidden',
        }}
      >
        {flight && (
          <>
            {/* ── Emergency Banner ─────────────────────────────────────── */}
            {flight.isEmergency && squawkInfo && (
              <div style={{
                background: squawkInfo.color,
                padding: '10px 20px',
                display: 'flex', alignItems: 'center', gap: '8px',
                fontWeight: 700, fontSize: '13px', letterSpacing: '0.05em',
                color: '#fff', flexShrink: 0,
                animation: 'flashBg 1s ease-in-out infinite',
              }}>
                🚨 {squawkInfo.label}
              </div>
            )}

            {/* ── Hero Section ──────────────────────────────────────────── */}
            <div style={{
              position: 'relative', flexShrink: 0,
              background: `radial-gradient(ellipse at 50% 40%, ${bgAccent} 0%, rgba(8,8,12,0.98) 75%)`,
              padding: '20px 20px 16px',
            }}>
              {/* Close */}
              <button onClick={onClose} style={{
                position: 'absolute', top: '16px', right: '16px',
                width: '28px', height: '28px', borderRadius: '50%',
                background: 'rgba(255,255,255,0.09)', border: 'none', cursor: 'pointer',
                color: 'rgba(255,255,255,0.6)', fontSize: '14px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                backdropFilter: 'blur(8px)', zIndex: 10, transition: 'background 0.2s',
              }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.16)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.09)')}
              >✕</button>

              {/* Top row: aircraft image + airline logo */}
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '16px' }}>
                {/* Aircraft type silhouette */}
                <div style={{
                  width: '96px', height: '96px', borderRadius: '16px', overflow: 'hidden',
                  background: `radial-gradient(circle, ${bgAccent} 0%, rgba(0,0,0,0.6) 100%)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: `1px solid ${accent}30`, flexShrink: 0,
                }}>
                  <img src={AIRCRAFT_IMAGES[flight.aircraftType]}
                    alt={TYPE_LABELS[flight.aircraftType]}
                    style={{ width: '80px', height: '80px', objectFit: 'contain',
                      filter: `drop-shadow(0 0 12px ${accent}60)` }} />
                </div>

                {/* Airline logo from Wikipedia */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {airlineImage ? (
                    <div style={{
                      height: '48px', background: 'rgba(255,255,255,0.06)',
                      borderRadius: '10px', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', padding: '6px 10px', marginBottom: '8px',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}>
                      <img src={airlineImage} alt={flight.airline}
                        style={{ maxHeight: '36px', maxWidth: '100%', objectFit: 'contain',
                          filter: 'brightness(1.1) contrast(1.05)' }} />
                    </div>
                  ) : (
                    <div style={{
                      height: '48px', background: 'rgba(255,255,255,0.04)',
                      borderRadius: '10px', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', marginBottom: '8px',
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}>
                      <span style={{ fontSize: '22px' }}>{flight.countryFlag}</span>
                    </div>
                  )}

                  {/* Aircraft type badge */}
                  <div style={{
                    display: 'inline-flex', alignItems: 'center',
                    background: bgAccent, border: `1px solid ${accent}35`,
                    borderRadius: '20px', padding: '3px 10px',
                    fontSize: '10px', fontWeight: 700, color: accent,
                    letterSpacing: '0.07em', textTransform: 'uppercase',
                  }}>
                    {TYPE_LABELS[flight.aircraftType]}
                  </div>
                </div>
              </div>

              {/* Callsign + airline name */}
              <div style={{ marginBottom: '2px' }}>
                <div style={{
                  fontSize: '34px', fontWeight: 800, letterSpacing: '-0.5px',
                  color: '#ffffff', lineHeight: 1, fontVariantNumeric: 'tabular-nums',
                }}>
                  {flight.callsign}
                </div>
                <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', marginTop: '3px' }}>
                  {flight.airline}
                  {flight.registration && (
                    <span style={{
                      marginLeft: '8px', fontSize: '12px',
                      fontFamily: '"SF Mono", "Menlo", monospace',
                      color: accent, opacity: 0.9,
                    }}>
                      · {flight.registration}
                    </span>
                  )}
                </div>
              </div>

              {/* Country row */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px',
                padding: '8px 12px', background: 'rgba(255,255,255,0.04)',
                borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)',
              }}>
                <span style={{ fontSize: '18px' }}>{flight.countryFlag}</span>
                <div>
                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                    Country of Origin
                  </div>
                  <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>
                    {flight.country}
                  </div>
                </div>
              </div>
            </div>

            <Divider />

            {/* ── 3-Column Stat Cards ───────────────────────────────────── */}
            <div style={{ padding: '0 20px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              <StatCard label="Speed" value={Math.round(flight.velocity).toString()} unit="kts" accent={accent} />
              <StatCard label="Altitude"
                value={flight.onGround ? '—' : Math.round(flight.altitude / 100).toString()}
                unit={flight.onGround ? '' : '00 ft'} accent={accent} />
              <StatCard label="Heading"
                value={`${((Math.round(flight.heading) % 360) + 360) % 360}`}
                unit="°" accent={accent} />
            </div>

            <Divider />

            {/* ── Vertical Rate Card ────────────────────────────────────── */}
            {vr && (
              <div style={{ padding: '0 20px' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '12px 16px', borderRadius: '12px',
                  background: flight.onGround ? 'rgba(255,255,255,0.04)' : `${vr.color}15`,
                  border: `1px solid ${vr.color}25`,
                }}>
                  <span style={{ fontSize: '22px', lineHeight: 1, color: vr.color, fontWeight: 700 }}>
                    {vr.icon}
                  </span>
                  <div>
                    <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                      Vertical Rate
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: vr.color, marginTop: '1px' }}>
                      {vr.label}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {vr && <Divider />}

            {/* ── Detail Rows ───────────────────────────────────────────── */}
            <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column' }}>
              <DetailRow label="Speed" value={formatSpeed(flight.velocity)} />
              <DetailRow label="Altitude" value={formatAlt(flight.altitude, flight.onGround)} />
              <DetailRow label="Heading" value={formatHeading(flight.heading)} />
              {flight.aircraftModel && (
                <DetailRow label="Aircraft" value={modelName} />
              )}
              {flight.registration && (
                <DetailRow label="Registration" value={flight.registration} mono />
              )}
              <DetailRow label="Position" value={formatCoords(flight.lat, flight.lon)} mono />
              <DetailRow label="ICAO Hex" value={flight.id.toUpperCase()} mono />
              {flight.squawk && (
                <DetailRow
                  label="Squawk"
                  value={flight.squawk}
                  mono
                  highlight={flight.isEmergency ? '#ef4444' : undefined}
                />
              )}
            </div>

            <Divider />

            {/* ── Trail + Status Row ────────────────────────────────────── */}
            <div style={{ padding: '0 20px 32px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* On Ground status */}
              {flight.onGround && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '11px 14px', borderRadius: '10px',
                  background: 'rgba(148,163,184,0.08)', border: '1px solid rgba(148,163,184,0.15)',
                }}>
                  <span style={{ fontSize: '16px' }}>🛫</span>
                  <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>
                    Aircraft on ground / taxiing
                  </div>
                </div>
              )}

              {/* Trail indicator */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '11px 14px', borderRadius: '10px',
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div style={{
                  width: '8px', height: '8px', borderRadius: '50%', background: accent,
                  flexShrink: 0, animation: 'breathe 2s ease-in-out infinite',
                  boxShadow: `0 0 8px ${accent}80`,
                }} />
                <div>
                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                    Flight Trail
                  </div>
                  <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginTop: '1px' }}>
                    {trailLabel}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes breathe {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.5; transform: scale(1.4); }
        }
        @keyframes flashBg {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.75; }
        }
      `}</style>
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Divider() {
  return <div style={{ height: '1px', background: 'rgba(255,255,255,0.07)', margin: '18px 0', flexShrink: 0 }} />;
}

function StatCard({ label, value, unit, accent }: { label: string; value: string; unit: string; accent: string }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: '12px', padding: '12px 8px', textAlign: 'center',
    }}>
      <div style={{ fontSize: '22px', fontWeight: 700, color: accent, letterSpacing: '-0.5px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
        {value}<span style={{ fontSize: '11px', fontWeight: 400, color: 'rgba(255,255,255,0.38)', marginLeft: '2px' }}>{unit}</span>
      </div>
      <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono, highlight }: { label: string; value: string; mono?: boolean; highlight?: string }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
    }}>
      <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.38)', letterSpacing: '0.01em', flexShrink: 0 }}>
        {label}
      </span>
      <span style={{
        fontSize: '13px', color: highlight ?? 'rgba(255,255,255,0.82)',
        fontWeight: highlight ? 700 : 500,
        fontFamily: mono ? '"SF Mono", "Menlo", "JetBrains Mono", monospace' : 'inherit',
        textAlign: 'right', maxWidth: '220px', wordBreak: 'break-all',
      }}>
        {value}
      </span>
    </div>
  );
}
