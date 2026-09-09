'use client';

import React, { useEffect, useRef } from 'react';
import type { Flight } from '@/lib/flight/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatAlt(m: number): string {
  const ft = Math.round(m * 3.28084);
  return `${ft.toLocaleString()} ft`;
}

function formatSpeed(ms: number): string {
  const kmh = Math.round(ms * 3.6);
  const kts = Math.round(ms * 1.94384);
  return `${kmh} km/h · ${kts} kts`;
}

function formatHeading(raw: number): string {
  const h = ((Math.round(raw) % 360) + 360) % 360;
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const dir = dirs[Math.round(h / 22.5) % 16];
  return `${h}° ${dir}`;
}

function formatCoords(lat: number, lon: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lonDir = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}°${latDir}  ${Math.abs(lon).toFixed(4)}°${lonDir}`;
}

const AIRCRAFT_LABELS: Record<string, string> = {
  jet:       'Narrow-Body Jet',
  widebody:  'Wide-Body Airliner',
  helicopter:'Helicopter',
  cargo:     'Cargo Transport',
};

const AIRCRAFT_ICONS: Record<string, string> = {
  jet:        '/assets/icon_jet.jpg',
  widebody:   '/assets/icon_widebody.jpg',
  helicopter: '/assets/icon_helicopter.jpg',
  cargo:      '/assets/icon_cargo.jpg',
};

const TYPE_COLORS: Record<string, string> = {
  jet:        'rgba(99,179,237,0.18)',   // blue
  widebody:   'rgba(154,117,255,0.18)',  // purple
  helicopter: 'rgba(72,213,151,0.18)',  // green
  cargo:      'rgba(251,189,35,0.18)',  // amber
};

const TYPE_ACCENT: Record<string, string> = {
  jet:        '#60a5fa',   // blue-400
  widebody:   '#a78bfa',   // violet-400
  helicopter: '#34d399',  // emerald-400
  cargo:      '#fbbf24',  // amber-400
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  flight: Flight | null;
  trailLength: number;
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FlightSidebar({ flight, trailLength, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const isOpen = flight !== null;
  const accent = flight ? TYPE_ACCENT[flight.aircraftType] ?? '#60a5fa' : '#60a5fa';
  const bgAccent = flight ? TYPE_COLORS[flight.aircraftType] ?? 'rgba(99,179,237,0.18)' : 'rgba(99,179,237,0.18)';

  const trailMins = Math.floor(trailLength / 60);
  const trailSecs = trailLength % 60;
  const trailLabel = trailLength > 0
    ? `${trailMins}m ${trailSecs.toString().padStart(2, '0')}s of track recorded`
    : 'Tracking started';

  return (
    <>
      {/* Backdrop blur scrim (subtle, Apple-style) */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 40,
          pointerEvents: isOpen ? 'auto' : 'none',
          opacity: isOpen ? 1 : 0,
          transition: 'opacity 0.3s ease',
          background: 'transparent',
        }}
      />

      {/* Sidebar panel */}
      <div
        ref={panelRef}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '380px',
          zIndex: 50,
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.45s cubic-bezier(0.32, 0.72, 0, 1)',
          display: 'flex',
          flexDirection: 'column',
          // Apple frosted glass
          background: 'rgba(18, 18, 22, 0.88)',
          backdropFilter: 'blur(40px) saturate(180%)',
          WebkitBackdropFilter: 'blur(40px) saturate(180%)',
          borderLeft: '1px solid rgba(255,255,255,0.07)',
          boxShadow: '-24px 0 80px rgba(0,0,0,0.6)',
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif',
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {flight && (
          <>
            {/* ── Aircraft Image Header ──────────────────────────────────── */}
            <div style={{
              position: 'relative',
              height: '200px',
              overflow: 'hidden',
              flexShrink: 0,
              background: `radial-gradient(ellipse at center, ${bgAccent} 0%, rgba(10,10,14,0.95) 70%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              {/* Close button */}
              <button
                onClick={onClose}
                style={{
                  position: 'absolute',
                  top: '16px',
                  right: '16px',
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.1)',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'rgba(255,255,255,0.7)',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backdropFilter: 'blur(8px)',
                  transition: 'background 0.2s',
                  zIndex: 10,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.18)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
              >
                ✕
              </button>

              {/* Aircraft image */}
              <img
                src={AIRCRAFT_ICONS[flight.aircraftType] ?? AIRCRAFT_ICONS.jet}
                alt={AIRCRAFT_LABELS[flight.aircraftType]}
                style={{
                  height: '130px',
                  width: '130px',
                  objectFit: 'contain',
                  filter: `drop-shadow(0 0 24px ${accent}80)`,
                  opacity: 0.9,
                  borderRadius: '8px',
                }}
              />

              {/* Ambient glow pulse */}
              <div style={{
                position: 'absolute',
                inset: 0,
                background: `radial-gradient(ellipse at 50% 60%, ${accent}15 0%, transparent 70%)`,
                pointerEvents: 'none',
                animation: 'pulse 3s ease-in-out infinite',
              }} />
            </div>

            {/* ── Primary Info Block ─────────────────────────────────────── */}
            <div style={{ padding: '24px 24px 0' }}>
              {/* Callsign + type badge */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '4px' }}>
                <div>
                  <div style={{
                    fontSize: '32px',
                    fontWeight: 700,
                    letterSpacing: '-0.5px',
                    color: '#ffffff',
                    lineHeight: 1,
                  }}>
                    {flight.callsign}
                  </div>
                  <div style={{
                    fontSize: '15px',
                    color: 'rgba(255,255,255,0.55)',
                    marginTop: '4px',
                    letterSpacing: '0.01em',
                  }}>
                    {flight.airline}
                  </div>
                </div>
                {/* Aircraft type pill */}
                <div style={{
                  background: bgAccent,
                  border: `1px solid ${accent}40`,
                  borderRadius: '20px',
                  padding: '4px 12px',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: accent,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                  marginTop: '4px',
                }}>
                  {AIRCRAFT_LABELS[flight.aircraftType]}
                </div>
              </div>

              {/* Country row */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginTop: '12px',
                padding: '10px 14px',
                background: 'rgba(255,255,255,0.04)',
                borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.06)',
              }}>
                <span style={{ fontSize: '20px' }}>{flight.countryFlag}</span>
                <div>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    Country of Origin
                  </div>
                  <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.9)', fontWeight: 500 }}>
                    {flight.country}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Hairline separator ─────────────────────────────────────── */}
            <Divider />

            {/* ── 3-column stat cards ────────────────────────────────────── */}
            <div style={{ padding: '0 24px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
              <StatCard
                label="Speed"
                value={`${Math.round(flight.velocity * 1.94384)}`}
                unit="kts"
                icon="󱗺"
                accent={accent}
              />
              <StatCard
                label="Altitude"
                value={`${Math.round(flight.altitude * 3.28084 / 100) * 100}`}
                unit="ft"
                icon="↑"
                accent={accent}
              />
              <StatCard
                label="Heading"
                value={`${((Math.round(flight.heading) % 360) + 360) % 360}`}
                unit="°"
                icon="⬆"
                accent={accent}
              />
            </div>

            {/* ── Hairline separator ─────────────────────────────────────── */}
            <Divider />

            {/* ── Detail rows ────────────────────────────────────────────── */}
            <div style={{ padding: '0 24px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <DetailRow label="Speed" value={formatSpeed(flight.velocity)} />
              <DetailRow label="Altitude" value={formatAlt(flight.altitude)} />
              <DetailRow label="Heading" value={formatHeading(flight.heading)} />
              <DetailRow label="Position" value={formatCoords(flight.lat, flight.lon)} mono />
              <DetailRow label="Hex Code" value={flight.id.toUpperCase()} mono />
            </div>

            {/* ── Hairline separator ─────────────────────────────────────── */}
            <Divider />

            {/* ── Trail status ───────────────────────────────────────────── */}
            <div style={{ padding: '0 24px 32px' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '12px 14px',
                background: 'rgba(255,255,255,0.04)',
                borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.06)',
              }}>
                {/* Animated dot */}
                <div style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: accent,
                  flexShrink: 0,
                  animation: 'breathe 2s ease-in-out infinite',
                  boxShadow: `0 0 8px ${accent}80`,
                }} />
                <div>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    Flight Trail
                  </div>
                  <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.75)', marginTop: '2px' }}>
                    {trailLabel}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Keyframe animations injected once */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.6; }
          50%       { opacity: 1; }
        }
        @keyframes breathe {
          0%, 100% { transform: scale(1);   opacity: 1; }
          50%       { transform: scale(1.4); opacity: 0.6; }
        }
      `}</style>
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Divider() {
  return (
    <div style={{
      height: '1px',
      background: 'rgba(255,255,255,0.07)',
      margin: '20px 0',
      flexShrink: 0,
    }} />
  );
}

function StatCard({ label, value, unit, accent }: {
  label: string;
  value: string;
  unit: string;
  icon: string;
  accent: string;
}) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.05)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '12px',
      padding: '12px 10px',
      textAlign: 'center',
    }}>
      <div style={{
        fontSize: '22px',
        fontWeight: 700,
        color: accent,
        letterSpacing: '-0.5px',
        lineHeight: 1,
      }}>
        {value}<span style={{ fontSize: '12px', fontWeight: 400, color: 'rgba(255,255,255,0.4)', marginLeft: '2px' }}>{unit}</span>
      </div>
      <div style={{
        fontSize: '10px',
        color: 'rgba(255,255,255,0.38)',
        marginTop: '4px',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
      }}>
        {label}
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '11px 0',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
    }}>
      <span style={{
        fontSize: '13px',
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: '0.01em',
      }}>
        {label}
      </span>
      <span style={{
        fontSize: '13px',
        color: 'rgba(255,255,255,0.85)',
        fontWeight: 500,
        fontFamily: mono ? '"SF Mono", "Menlo", monospace' : 'inherit',
        textAlign: 'right',
        maxWidth: '200px',
      }}>
        {value}
      </span>
    </div>
  );
}
