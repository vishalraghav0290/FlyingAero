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
  return `${kts.toFixed(0)} kts  ·  ${kmh} km/h`;
}

function formatHeading(raw: number): string {
  const h = ((Math.round(raw) % 360) + 360) % 360;
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return `${h}°  ${dirs[Math.round(h / 22.5) % 16]}`;
}

function formatCoords(lat: number, lon: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lonDir = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}°${latDir}  ${Math.abs(lon).toFixed(4)}°${lonDir}`;
}

function formatVerticalRate(fpm: number, onGround: boolean): { label: string; icon: string; color: string } {
  if (onGround) return { label: 'Ground', icon: '●', color: '#94a3b8' };
  if (Math.abs(fpm) < 100) return { label: 'Level', icon: '→', color: '#94a3b8' };
  if (fpm > 0) return { label: `+${fpm.toLocaleString()} ft/min`, icon: '↑', color: '#34d399' };
  return { label: `${fpm.toLocaleString()} ft/min`, icon: '↓', color: '#f87171' };
}

// Known ICAO type code → readable model
const MODEL_NAMES: Record<string, string> = {
  B737: 'Boeing 737', B738: 'Boeing 737-800', B739: 'Boeing 737-900',
  B38M: 'Boeing 737 MAX 8', B39M: 'Boeing 737 MAX 9',
  B752: 'Boeing 757-200', B763: 'Boeing 767-300', B764: 'Boeing 767-400',
  B772: 'Boeing 777-200', B773: 'Boeing 777-300', B77W: 'Boeing 777-300ER',
  B77F: 'Boeing 777F',
  B788: 'Boeing 787-8', B789: 'Boeing 787-9', B78X: 'Boeing 787-10',
  B742: 'Boeing 747-200', B744: 'Boeing 747-400', B748: 'Boeing 747-8',
  A318: 'Airbus A318', A319: 'Airbus A319', A320: 'Airbus A320',
  A321: 'Airbus A321', A20N: 'Airbus A320neo', A21N: 'Airbus A321neo',
  A332: 'Airbus A330-200', A333: 'Airbus A330-300', A339: 'Airbus A330-900',
  A359: 'Airbus A350-900', A35K: 'Airbus A350-1000',
  A380: 'Airbus A380', A388: 'Airbus A380-800',
  E170: 'Embraer E170', E175: 'Embraer E175', E190: 'Embraer E190', E195: 'Embraer E195',
  E75S: 'Embraer E175-S', E55P: 'Embraer Phenom 300',
  CRJ7: 'Bombardier CRJ-700', CRJ9: 'Bombardier CRJ-900',
  R22: 'Robinson R22', R44: 'Robinson R44', R66: 'Robinson R66',
  EC35: 'Airbus H135', EC45: 'Airbus H145', AS50: 'Airbus AS350',
  S76: 'Sikorsky S-76', B06: 'Bell 206', B07: 'Bell 407',
  H60: 'Sikorsky Black Hawk', A109: 'AgustaWestland AW109',
  MD11: 'McDonnell Douglas MD-11',
  C172: 'Cessna 172', C182: 'Cessna 182', C208: 'Cessna Grand Caravan',
  C68A: 'Cessna Citation Latitude', P28A: 'Piper PA-28 Arrow',
  SR22: 'Cirrus SR22', BE23: 'Beechcraft Musketeer', BE20: 'Beechcraft King Air 200',
  C185: 'Cessna 185 Skywagon',
};

const AIRCRAFT_IMAGES: Record<string, string> = {
  jet: '/assets/icon_jet1.png',
  widebody: '/assets/icon_widebody1.png',
  helicopter: '/assets/icon_helicopter1.png',
  cargo: '/assets/icon_cargo1.png',
  light: '/assets/icon_jet1.png',
};

const TYPE_LABELS: Record<string, string> = {
  jet: 'Narrow-Body Jet',
  widebody: 'Wide-Body Airliner',
  helicopter: 'Rotorcraft',
  cargo: 'Cargo / Freighter',
  light: 'Light Aircraft',
};

const TYPE_ACCENT: Record<string, string> = {
  jet: '#fbbf24',
  widebody: '#a78bfa',
  helicopter: '#34d399',
  cargo: '#f59e0b',
  light: '#94a3b8',
};

const TYPE_BG: Record<string, string> = {
  jet: 'rgba(251,191,36,0.10)',
  widebody: 'rgba(167,139,250,0.10)',
  helicopter: 'rgba(52,211,153,0.10)',
  cargo: 'rgba(245,158,11,0.10)',
  light: 'rgba(148,163,184,0.08)',
};

const SQUAWK_LABELS: Record<string, { label: string; color: string }> = {
  '7500': { label: '7500 — HIJACKING', color: '#ef4444' },
  '7600': { label: '7600 — RADIO FAILURE', color: '#f97316' },
  '7700': { label: '7700 — EMERGENCY', color: '#ef4444' },
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  flight: Flight | null;
  trailLength: number;
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
  const [activeTab, setActiveTab] = useState<'info' | 'technical'>('info');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Reset tab when flight changes
  useEffect(() => { setActiveTab('info'); }, [flight?.id]);

  const isOpen = flight !== null;
  const accent = flight ? (flight.isEmergency ? '#ef4444' : TYPE_ACCENT[flight.aircraftType] ?? '#fbbf24') : '#fbbf24';
  const bgAccent = flight ? (flight.isEmergency ? 'rgba(239,68,68,0.12)' : TYPE_BG[flight.aircraftType] ?? TYPE_BG.jet) : TYPE_BG.jet;
  const vr = flight ? formatVerticalRate(flight.verticalRate, flight.onGround) : null;
  const modelName = flight?.aircraftModel ? (MODEL_NAMES[flight.aircraftModel] ?? flight.aircraftModel) : null;
  const trailSecs = Math.round(trailLength * (15 / 60));
  const trailLabel = trailSecs > 0
    ? `${Math.floor(trailSecs / 60)}m ${(trailSecs % 60).toString().padStart(2, '0')}s tracked since detection`
    : 'Building trail from detection…';
  const squawkInfo = flight?.squawk ? SQUAWK_LABELS[flight.squawk] : null;

  return (
    <>
      {/* Invisible backdrop to dismiss */}
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
          position: 'fixed', top: 0, right: 0, bottom: 0, width: '380px', zIndex: 50,
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.4s cubic-bezier(0.32, 0.72, 0, 1)',
          display: 'flex', flexDirection: 'column',
          background: 'rgba(9, 10, 16, 0.96)',
          backdropFilter: 'blur(48px) saturate(180%)',
          WebkitBackdropFilter: 'blur(48px) saturate(180%)',
          borderLeft: '1px solid rgba(255,255,255,0.07)',
          boxShadow: '-24px 0 80px rgba(0,0,0,0.6)',
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
                padding: '9px 20px',
                display: 'flex', alignItems: 'center', gap: '8px',
                fontWeight: 700, fontSize: '12px', letterSpacing: '0.06em',
                color: '#fff', flexShrink: 0,
                animation: 'flashBg 1s ease-in-out infinite',
              }}>
                🚨 {squawkInfo.label}
              </div>
            )}

            {/* ── Hero: Aircraft image + callsign ───────────────────────── */}
            <div style={{
              position: 'relative', flexShrink: 0,
              height: '160px', overflow: 'hidden',
            }}>
              {/* Aircraft image full-width */}
              <img
                src={AIRCRAFT_IMAGES[flight.aircraftType]}
                alt={TYPE_LABELS[flight.aircraftType]}
                style={{
                  width: '100%', height: '100%', objectFit: 'cover',
                  filter: 'brightness(0.45) saturate(0.8)',
                }}
              />
              {/* Gradient overlay */}
              <div style={{
                position: 'absolute', inset: 0,
                background: `linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, ${bgAccent} 40%, rgba(9,10,16,0.98) 100%)`,
              }} />
              {/* Close button */}
              <button onClick={onClose} style={{
                position: 'absolute', top: '12px', right: '12px',
                width: '28px', height: '28px', borderRadius: '50%',
                background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.15)',
                cursor: 'pointer', color: 'rgba(255,255,255,0.7)', fontSize: '13px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                backdropFilter: 'blur(8px)', zIndex: 10, transition: 'all 0.2s',
              }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.5)')}
              >✕</button>

              {/* Callsign overlay at bottom of hero */}
              <div style={{
                position: 'absolute', bottom: '12px', left: '16px', right: '16px',
                display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{
                    fontSize: '30px', fontWeight: 800, color: '#fff',
                    letterSpacing: '-0.5px', lineHeight: 1, textShadow: '0 2px 12px rgba(0,0,0,0.8)',
                  }}>
                    {flight.callsign}
                  </div>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)', marginTop: '2px' }}>
                    {flight.airline}
                    {flight.registration && (
                      <span style={{ color: accent, marginLeft: '6px', fontFamily: '"SF Mono", monospace', fontSize: '11px' }}>
                        · {flight.registration}
                      </span>
                    )}
                  </div>
                </div>
                {/* Type badge */}
                <div style={{
                  background: `${accent}20`, border: `1px solid ${accent}40`,
                  borderRadius: '20px', padding: '3px 9px',
                  fontSize: '10px', fontWeight: 700, color: accent,
                  letterSpacing: '0.06em', textTransform: 'uppercase', flexShrink: 0,
                }}>
                  {TYPE_LABELS[flight.aircraftType]}
                </div>
              </div>
            </div>

            {/* ── Airline logo row ──────────────────────────────────────── */}
            <div style={{ padding: '12px 16px 0', flexShrink: 0 }}>
              {airlineImage ? (
                <div style={{
                  height: '44px', background: 'rgba(255,255,255,0.05)',
                  borderRadius: '10px', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', padding: '6px 12px',
                  border: '1px solid rgba(255,255,255,0.07)',
                }}>
                  <img src={airlineImage} alt={flight.airline}
                    style={{
                      maxHeight: '32px', maxWidth: '100%', objectFit: 'contain',
                      filter: 'brightness(1.1)'
                    }} />
                </div>
              ) : (
                <div style={{
                  height: '44px', background: 'rgba(255,255,255,0.04)',
                  borderRadius: '10px', display: 'flex', alignItems: 'center',
                  gap: '10px', padding: '0 14px',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}>
                  <span style={{ fontSize: '20px' }}>{flight.countryFlag}</span>
                  <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>
                    {flight.airline}
                  </span>
                </div>
              )}
            </div>

            {/* ── Tab switcher ─────────────────────────────────────────── */}
            <div style={{
              display: 'flex', margin: '14px 16px 0',
              background: 'rgba(255,255,255,0.05)', borderRadius: '10px', padding: '3px',
              flexShrink: 0,
            }}>
              {(['info', 'technical'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    flex: 1, padding: '7px 0',
                    borderRadius: '8px', border: 'none',
                    background: activeTab === tab ? 'rgba(255,255,255,0.1)' : 'transparent',
                    color: activeTab === tab ? '#fff' : 'rgba(255,255,255,0.4)',
                    fontSize: '12px', fontWeight: activeTab === tab ? 600 : 400,
                    cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'all 0.2s',
                    boxShadow: activeTab === tab ? '0 1px 4px rgba(0,0,0,0.3)' : 'none',
                  }}
                >
                  {tab === 'info' ? 'Flight Info' : 'Technical Data'}
                </button>
              ))}
            </div>

            {/* ── Flight Info Tab ───────────────────────────────────────── */}
            {activeTab === 'info' && (
              <div style={{ flex: 1, padding: '16px 16px 24px' }}>
                {/* 3 Stat Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '16px' }}>
                  <StatCard
                    label="Speed" value={`${Math.round(flight.velocity)}`} unit="kts"
                    accent={accent} barValue={flight.velocity} barMax={600}
                  />
                  <StatCard
                    label="Altitude"
                    value={flight.onGround ? '—' : `${Math.round(flight.altitude / 100)}`}
                    unit={flight.onGround ? '' : '00 ft'}
                    accent={accent} barValue={flight.altitude} barMax={45000}
                  />
                  <StatCard
                    label="Heading"
                    value={`${((Math.round(flight.heading) % 360) + 360) % 360}`}
                    unit="°"
                    accent={accent} barValue={((Math.round(flight.heading) % 360) + 360) % 360} barMax={360}
                  />
                </div>

                {/* Vertical rate card */}
                {vr && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '11px 14px', borderRadius: '12px', marginBottom: '14px',
                    background: flight.onGround ? 'rgba(255,255,255,0.04)' : `${vr.color}12`,
                    border: `1px solid ${vr.color}22`,
                  }}>
                    <span style={{ fontSize: '20px', color: vr.color, fontWeight: 700, lineHeight: 1, minWidth: '20px', textAlign: 'center' }}>
                      {vr.icon}
                    </span>
                    <div>
                      <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                        Vertical Rate
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: vr.color, marginTop: '1px' }}>
                        {vr.label}
                      </div>
                    </div>
                  </div>
                )}

                {/* Detail rows */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <DetailRow label="Speed" value={formatSpeed(flight.velocity)} />
                  <DetailRow label="Altitude" value={formatAlt(flight.altitude, flight.onGround)} />
                  <DetailRow label="Heading" value={formatHeading(flight.heading)} />
                  <DetailRow label="Position" value={formatCoords(flight.lat, flight.lon)} mono />
                  {flight.country && (
                    <DetailRow label="Country" value={`${flight.countryFlag} ${flight.country}`} />
                  )}
                  {flight.onGround && (
                    <DetailRow label="Status" value="🛫 On Ground / Taxiing" />
                  )}
                </div>

                {/* Trail status */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '11px 14px', borderRadius: '10px', marginTop: '14px',
                  background: 'rgba(255,255,255,0.04)', border: `1px solid ${accent}20`,
                }}>
                  <div style={{
                    width: '8px', height: '8px', borderRadius: '50%',
                    background: accent, flexShrink: 0,
                    animation: 'breathe 2s ease-in-out infinite',
                    boxShadow: `0 0 8px ${accent}80`,
                  }} />
                  <div>
                    <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                      Flight Trail
                    </div>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', marginTop: '1px' }}>
                      {trailLabel}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Technical Data Tab ───────────────────────────────────── */}
            {activeTab === 'technical' && (
              <div style={{ flex: 1, padding: '16px 16px 32px' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {flight.registration && (
                    <DetailRow label="Registration" value={flight.registration} mono />
                  )}
                  {modelName && (
                    <DetailRow label="Aircraft" value={modelName} />
                  )}
                  {flight.aircraftModel && (
                    <DetailRow label="ICAO Type" value={flight.aircraftModel} mono />
                  )}
                  <DetailRow label="ICAO Hex" value={flight.id.toUpperCase()} mono />
                  {flight.squawk && (
                    <DetailRow
                      label="Squawk"
                      value={flight.squawk}
                      mono
                      highlight={flight.isEmergency ? '#ef4444' : undefined}
                    />
                  )}
                  <DetailRow label="Position" value={formatCoords(flight.lat, flight.lon)} mono />
                  <DetailRow label="Altitude" value={formatAlt(flight.altitude, flight.onGround)} />
                  <DetailRow label="Speed" value={formatSpeed(flight.velocity)} />
                  <DetailRow label="Heading" value={formatHeading(flight.heading)} />
                  {vr && <DetailRow label="Vertical Rate" value={vr.label} />}
                  <DetailRow label="On Ground" value={flight.onGround ? 'Yes' : 'No'} />
                </div>

                {/* Emergency warning block */}
                {flight.isEmergency && squawkInfo && (
                  <div style={{
                    marginTop: '16px', padding: '14px',
                    background: `${squawkInfo.color}18`,
                    border: `1px solid ${squawkInfo.color}40`,
                    borderRadius: '12px',
                  }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: squawkInfo.color, letterSpacing: '0.06em', marginBottom: '4px' }}>
                      ⚠️ EMERGENCY SQUAWK
                    </div>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
                      {squawkInfo.label}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <style>{`
        @keyframes breathe {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(1.4); }
        }
        @keyframes flashBg {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.7; }
        }
      `}</style>
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, unit, accent, barValue, barMax }: {
  label: string; value: string; unit: string; accent: string; barValue: number; barMax: number;
}) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: '12px', padding: '11px 9px',
    }}>
      <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
        {label}
      </div>
      <div style={{ fontSize: '20px', fontWeight: 700, color: accent, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
        {value}<span style={{ fontSize: '10px', fontWeight: 400, color: 'rgba(255,255,255,0.35)', marginLeft: '2px' }}>{unit}</span>
      </div>
      <SparkBar value={barValue} max={barMax} color={accent} />
    </div>
  );
}

function DetailRow({ label, value, mono, highlight }: { label: string; value: string; mono?: boolean; highlight?: string }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
    }}>
      <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.38)', flexShrink: 0, marginRight: '12px' }}>
        {label}
      </span>
      <span style={{
        fontSize: '12px', color: highlight ?? 'rgba(255,255,255,0.82)',
        fontWeight: highlight ? 700 : 500,
        fontFamily: mono ? '"SF Mono", "Menlo", "JetBrains Mono", monospace' : 'inherit',
        textAlign: 'right', wordBreak: 'break-all',
      }}>
        {value}
      </span>
    </div>
  );
}

function SparkBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div style={{ width: '100%', height: '3px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', marginTop: '6px', overflow: 'hidden' }}>
      <div style={{
        height: '100%', width: `${pct}%`,
        background: `linear-gradient(90deg, ${color}70, ${color})`,
        borderRadius: '2px',
        transition: 'width 0.8s ease',
        boxShadow: `0 0 6px ${color}50`,
      }} />
    </div>
  );
}
