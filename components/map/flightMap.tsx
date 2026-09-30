'use client'
import React, { useState, useMemo } from "react";
import MapGL, { useControl } from "react-map-gl/maplibre";
import { setWorkerUrl } from "maplibre-gl";
import { MapLibreOverlay } from "@deck.gl/maplibre";
import { IconLayer, PathLayer, ScatterplotLayer } from "@deck.gl/layers";
import 'maplibre-gl/dist/maplibre-gl.css';

import type { Flight } from "@/lib/flight/types";
import { useAnimatedFlights } from "@/lib/flight/useAnimatedFlights";
import FlightSidebar from "@/components/ui/FlightSidebar";

setWorkerUrl('/lib/maplibre/maplibre-gl-worker.mjs');

// ─── Per-type SVG icon atlases (distinct silhouettes)
// Each SVG is white on black with mask mode: black → transparent, white → getColor tint
const ICON_ATLAS: Record<string, string> = {
  jet: '/assets/icon_jet1.png',
  widebody: '/assets/icon_widebody1.png',
  helicopter: '/assets/icon_helicopter.png',
  cargo: '/assets/icon_cargo1.png',
  light: '/assets/icon_light1.png',
};

const ICON_MAPPING = {
  airplane: { x: 0, y: 0, width: 1024, height: 1024, anchorX: 256, anchorY: 256, mask: true },
};

// Color per aircraft type (RGB)
const TYPE_COLOR_NORMAL: Record<string, [number, number, number]> = {
  jet: [255, 200, 50],       // gold
  widebody: [167, 139, 250],      // violet
  helicopter: [52, 211, 153],       // emerald
  cargo: [251, 191, 36],       // amber
  light: [148, 163, 184],      // slate
};

const TYPE_COLOR_SELECTED: Record<string, [number, number, number]> = {
  jet: [255, 120, 60],
  widebody: [200, 160, 255],
  helicopter: [100, 240, 180],
  cargo: [255, 220, 80],
  light: [203, 213, 225],
};

const EMERGENCY_COLOR: [number, number, number] = [255, 50, 50];

// ─── Deck.gl overlay bridge ────────────────────────────────────────────────────

function DeckGLOverlay(props: { layers: any[]; interleaved?: boolean }) {
  const overlay = useControl(() => new MapLibreOverlay(props));
  overlay.setProps(props);
  return null;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FlightMap() {
  const { flights, trailMap } = useAnimatedFlights();

  const [selectedFlight, setSelectedFlight] = useState<Flight | null>(null);
  const [currentZoom, setCurrentZoom] = useState<number>(4);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [mapTheme, setMapTheme] = useState<'dark' | 'light' | 'satellite'>('dark');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // OpenFreeMap: free, no API key, no domain restrictions — works everywhere
  const MAP_STYLES: Record<string, string> = {
    dark: 'https://tiles.openfreemap.org/styles/dark',
    light: 'https://tiles.openfreemap.org/styles/bright',
    satellite: 'https://tiles.openfreemap.org/styles/liberty',
  };

  const isLight = mapTheme === 'light';

  const MAP_THEME_OPTIONS: { key: 'dark' | 'light' | 'satellite'; label: string; }[] = [
    { key: 'dark', label: 'Dark' },
    { key: 'light', label: 'Light' },
    { key: 'satellite', label: 'Satellite' },
  ];

  const handleFlightClick = (info: any) => {
    if (info.object) {
      setSelectedFlight(info.object as Flight);
    }
  };

  const handleMapClick = () => {
    setSelectedFlight(null);
  };

  const toggleFilter = (filter: string) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(filter)) next.delete(filter);
      else next.add(filter);
      return next;
    });
  };

  // Apply filters and sort by altitude (low → high) so higher planes render on top
  const visibleFlights = useMemo(() => {
    let filtered = flights;
    if (activeFilters.size > 0) {
      filtered = flights.filter(f => {
        if (activeFilters.has('jets') && (f.aircraftType === 'jet' || f.aircraftType === 'widebody')) return true;
        if (activeFilters.has('helicopters') && f.aircraftType === 'helicopter') return true;
        if (activeFilters.has('cargo') && f.aircraftType === 'cargo') return true;
        if (activeFilters.has('light') && f.aircraftType === 'light') return true;
        if (activeFilters.has('emergency') && f.isEmergency) return true;
        return false;
      });
    }
    // Sort ascending by altitude → deck.gl renders last items on top
    return [...filtered].sort((a, b) => a.altitude - b.altitude);
  }, [flights, activeFilters]);

  // ─ Build per-type icon layers ──────────────────────────────────────────────
  const iconLayers = useMemo(() => {
    const types = ['jet', 'widebody', 'helicopter', 'cargo', 'light'] as const;

    return types.map((type) => {
      const data = visibleFlights.filter(f => f.aircraftType === type);
      const isHeli = type === 'helicopter';
      const isLightAc = type === 'light';

      return new IconLayer<Flight>({
        id: `flight-icons-${type}`,
        data,
        pickable: true,
        onClick: handleFlightClick,
        iconAtlas: ICON_ATLAS[type],
        iconMapping: ICON_MAPPING,
        getIcon: () => 'airplane',
        // Include altitude as elevation (feet → meters) for z-ordering
        getPosition: (d) => [d.lon, d.lat, d.altitude * 0.3048],
        getAngle: (d) => -d.heading,
        getSize: isHeli ? 28 : isLightAc ? 20 : 36,
        sizeScale: currentZoom / 6,
        sizeMinPixels: isHeli ? 5 : isLightAc ? 4 : 8,
        sizeMaxPixels: isHeli ? 55 : isLightAc ? 40 : 80,
        getColor: (d) => {
          if (d.isEmergency) return [...EMERGENCY_COLOR, 255] as [number, number, number, number];
          const isSelected = d.id === selectedFlight?.id;
          let base = isSelected ? TYPE_COLOR_SELECTED[type] : TYPE_COLOR_NORMAL[type];
          // On light map darken icons so they stay readable on pale background
          if (isLight) base = base.map(c => Math.round(c * 0.6)) as [number, number, number];
          return [...base, isSelected ? 255 : 220] as [number, number, number, number];
        },
        updateTriggers: {
          getColor: [selectedFlight?.id, mapTheme],
          sizeScale: [currentZoom],
        },
      });
    });
  }, [visibleFlights, selectedFlight, currentZoom, isLight]);

  // ─ Trail layers for the selected flight ────────────────────────────────────
  // Trails build from when the flight was first detected (simulating "from takeoff")
  // but only render the full trail visualization when a flight is selected
  const fadingTrailLayers = useMemo(() => {
    if (!selectedFlight) return [];

    const trail = trailMap.get(selectedFlight.id);
    if (!trail || trail.length < 2) return [];

    const type = selectedFlight.aircraftType;
    const accent = TYPE_COLOR_NORMAL[type] ?? [255, 255, 255];
    const total = trail.length;

    // ── 1. Glowing path segments (gradient opacity oldest→newest) ──────────
    const BUCKETS = 16;
    const pathLayers: any[] = [];

    for (let b = 0; b < BUCKETS; b++) {
      const lo = Math.floor((b / BUCKETS) * (total - 1));
      const hi = Math.floor(((b + 1) / BUCKETS) * (total - 1));
      if (hi <= lo) continue;

      const progress = (b + 0.5) / BUCKETS;          // 0=oldest, 1=newest
      const alpha = Math.round(8 + progress * 230);  // 8 → 238
      const width = 1.2 + progress * 2.8;            // thinner old, thicker new

      // Build path for this bucket
      const path = trail.slice(lo, hi + 1);

      pathLayers.push(new PathLayer({
        id: `trail-seg-${b}`,
        data: [{ path }],
        getPath: (d: any) => d.path,
        getColor: [...accent, alpha] as [number, number, number, number],
        getWidth: width,
        widthMinPixels: 0.8,
        widthMaxPixels: 5,
        pickable: false,
        jointRounded: true,
        capRounded: true,
      }));
    }

    // ── 2. Dot markers along the trail (every Nth point) ──────────────────
    const DOT_EVERY = Math.max(1, Math.floor(total / 12));
    const dotData: { position: [number, number]; progress: number }[] = [];
    for (let i = 0; i < total - 1; i += DOT_EVERY) {
      const progress = i / (total - 1);
      dotData.push({ position: trail[i] as [number, number], progress });
    }

    const dotLayer = new ScatterplotLayer({
      id: 'trail-dots',
      data: dotData,
      getPosition: (d: any) => d.position,
      getRadius: (d: any) => 1200 + d.progress * 1800,
      radiusMinPixels: 1.5,
      radiusMaxPixels: 5,
      getFillColor: (d: any) => {
        const a = Math.round(40 + d.progress * 180);
        return [...accent, a] as [number, number, number, number];
      },
      pickable: false,
      stroked: false,
    });

    // ── 3. Pulsing "current position" halo ───────────────────────────────
    const currentPos = trail[total - 1];
    const haloLayer = new ScatterplotLayer({
      id: 'trail-halo',
      data: [{ position: currentPos }],
      getPosition: (d: any) => d.position,
      getRadius: 5000,
      radiusMinPixels: 10,
      radiusMaxPixels: 25,
      getFillColor: [...accent, 40] as [number, number, number, number],
      getLineColor: [...accent, 180] as [number, number, number, number],
      stroked: true,
      getLineWidth: 600,
      lineWidthMinPixels: 1.5,
      pickable: false,
    });

    return [...pathLayers, dotLayer, haloLayer];
  }, [selectedFlight, trailMap]);

  const allLayers = [...iconLayers, ...fadingTrailLayers];

  // Trail age display — now shows the full accumulated trail since detection
  const trailAge = useMemo(() => {
    if (!selectedFlight) return 0;
    const trail = trailMap.get(selectedFlight.id);
    return trail ? trail.length : 0;
  }, [selectedFlight, trailMap]);

  const filterChips = [
    { key: 'jets', label: 'Jets', color: '#fbbf24', dot: [255, 200, 50] },
    { key: 'helicopters', label: 'Helicopters', color: '#34d399', dot: [52, 211, 153] },
    { key: 'cargo', label: 'Cargo', color: '#f59e0b', dot: [251, 191, 36] },
    { key: 'light', label: 'Light', color: '#94a3b8', dot: [148, 163, 184] },
    { key: 'emergency', label: '🚨 Emergency', color: '#ef4444', dot: [255, 50, 50] },
  ];

  return (
    <div className="w-screen h-screen relative font-sans bg-slate-950">
      <div style={{ width: '100%', height: '100%' }}>
        <MapGL
          initialViewState={{ longitude: -95.0, latitude: 38.0, zoom: 4 }}
          style={{ width: '100%', height: '100%' }}
          mapStyle={MAP_STYLES[mapTheme]}
          onClick={handleMapClick}
          onMove={(evt) => setCurrentZoom(evt.viewState.zoom)}
        >
          <DeckGLOverlay layers={allLayers} />
        </MapGL>
      </div>

      {/* ── Flight Detail Sidebar ──────────────────────────────────── */}
      <FlightSidebar
        flight={selectedFlight}
        trailLength={trailAge}
        onClose={() => setSelectedFlight(null)}
      />

      {/* ── Top-left: Live Counter + Map Style Dropdown ─────────── */}
      <div style={{
        position: 'absolute', top: '16px', left: '16px',
        display: 'flex', alignItems: 'center', gap: '8px',
        zIndex: 40,
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif',
      }}>
        {/* Live counter pill */}
        <div style={{
          background: isLight ? 'rgba(255,255,255,0.88)' : 'rgba(10,12,18,0.88)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          border: isLight ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.09)',
          borderRadius: '12px', padding: '8px 14px',
          color: isLight ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.92)',
          fontSize: '13px', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: '8px',
          boxShadow: isLight ? '0 4px 20px rgba(0,0,0,0.1)' : '0 4px 20px rgba(0,0,0,0.4)',
          transition: 'all 0.3s ease',
        }}>
          <span style={{
            width: '7px', height: '7px', borderRadius: '50%', background: '#34d399',
            display: 'inline-block', boxShadow: '0 0 8px #34d39990',
            animation: 'breathe 2s ease-in-out infinite', flexShrink: 0,
          }} />
          <span>{visibleFlights.length} aircraft live</span>
        </div>

        {/* Map style dropdown */}
        <div style={{ position: 'relative' }}>
          {/* Trigger button */}
          <button
            onClick={() => setDropdownOpen(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 12px', borderRadius: '12px', border: 'none', cursor: 'pointer',
              background: isLight ? 'rgba(255,255,255,0.88)' : 'rgba(10,12,18,0.88)',
              backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
              borderWidth: '1px', borderStyle: 'solid',
              borderColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.09)',
              color: isLight ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.92)',
              fontSize: '13px', fontWeight: 600, fontFamily: 'inherit',
              boxShadow: isLight ? '0 4px 20px rgba(0,0,0,0.1)' : '0 4px 20px rgba(0,0,0,0.4)',
              transition: 'all 0.3s ease',
              whiteSpace: 'nowrap',
            }}
          >

            <span>{MAP_THEME_OPTIONS.find(o => o.key === mapTheme)?.label} Map</span>
            {/* Chevron */}
            <svg
              width="10" height="10" viewBox="0 0 10 10" fill="none"
              style={{ transition: 'transform 0.2s', transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)', opacity: 0.5, marginLeft: '2px' }}
            >
              <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {/* Dropdown menu */}
          {dropdownOpen && (
            <>
              {/* Invisible overlay to close on outside click */}
              <div
                style={{ position: 'fixed', inset: 0, zIndex: 38 }}
                onClick={() => setDropdownOpen(false)}
              />
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', left: 0,
                minWidth: '160px',
                background: isLight ? 'rgba(255,255,255,0.96)' : 'rgba(14,16,22,0.96)',
                backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
                border: isLight ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.09)',
                borderRadius: '14px', padding: '5px',
                boxShadow: isLight ? '0 8px 32px rgba(0,0,0,0.15)' : '0 8px 32px rgba(0,0,0,0.6)',
                zIndex: 39,
                animation: 'dropIn 0.15s ease',
              }}>
                {MAP_THEME_OPTIONS.map(opt => {
                  const active = mapTheme === opt.key;
                  return (
                    <button
                      key={opt.key}
                      onClick={() => { setMapTheme(opt.key); setDropdownOpen(false); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        width: '100%', padding: '9px 12px', borderRadius: '10px',
                        border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                        background: active
                          ? (isLight ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.1)')
                          : 'transparent',
                        color: active
                          ? (isLight ? 'rgba(0,0,0,0.9)' : '#fff')
                          : (isLight ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.55)'),
                        fontSize: '13px', fontWeight: active ? 600 : 400,
                        textAlign: 'left', transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => {
                        if (!active) e.currentTarget.style.background = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)';
                      }}
                      onMouseLeave={e => {
                        if (!active) e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <span>{opt.label}</span>
                      {active && (
                        <span style={{ marginLeft: 'auto', fontSize: '11px', opacity: 0.6 }}>
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Bottom Status Bar (FlightRadar24-style) ───────────────── */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: selectedFlight ? '400px' : 0,
        transition: 'right 0.45s cubic-bezier(0.32,0.72,0,1)',
        background: 'rgba(8,10,16,0.94)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', alignItems: 'center',
        padding: '0 20px',
        height: '52px',
        gap: '0',
        zIndex: 30,
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif',
        boxShadow: '0 -8px 32px rgba(0,0,0,0.5)',
      }}>
        {/* Global stats */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px', paddingRight: '24px', borderRight: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.07em', lineHeight: 1 }}>Total Tracked</span>
            <span style={{ fontSize: '20px', fontWeight: 700, color: '#fff', lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>{flights.length}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.07em', lineHeight: 1 }}>Showing</span>
            <span style={{ fontSize: '20px', fontWeight: 700, color: '#34d399', lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>{visibleFlights.length}</span>
          </div>
        </div>

        {/* Filter chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingLeft: '20px', flex: 1, overflowX: 'auto', scrollbarWidth: 'none' }}>
          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.07em', flexShrink: 0 }}>Filter:</span>
          {filterChips.map(chip => {
            const active = activeFilters.has(chip.key);
            return (
              <button
                key={chip.key}
                onClick={() => toggleFilter(chip.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '5px',
                  padding: '4px 10px', borderRadius: '20px',
                  border: `1px solid ${active ? chip.color : 'rgba(255,255,255,0.12)'}`,
                  background: active ? `${chip.color}22` : 'rgba(255,255,255,0.04)',
                  color: active ? chip.color : 'rgba(255,255,255,0.55)',
                  fontSize: '11px', fontWeight: active ? 600 : 400,
                  cursor: 'pointer', flexShrink: 0,
                  transition: 'all 0.2s',
                  fontFamily: 'inherit',
                }}
              >
                {chip.key !== 'emergency' && (
                  <span style={{
                    width: '6px', height: '6px', borderRadius: '50%',
                    background: active ? chip.color : 'rgba(255,255,255,0.3)',
                    flexShrink: 0,
                    transition: 'background 0.2s',
                  }} />
                )}
                {chip.label}
              </button>
            );
          })}
        </div>

        {/* Data latency */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingLeft: '20px', borderLeft: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#34d399', boxShadow: '0 0 6px #34d39980', animation: 'breathe 2s ease-in-out infinite' }} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.07em', lineHeight: 1 }}>Data Latency</span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.75)', lineHeight: 1.3 }}>~10s</span>
          </div>
        </div>
      </div>

      {/* ── Trail info chip (visible when a plane is selected) ──────── */}
      {selectedFlight && (
        <div style={{
          position: 'absolute', bottom: '64px', left: '16px',
          background: 'rgba(10,12,18,0.88)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: '10px', padding: '8px 14px',
          display: 'flex', alignItems: 'center', gap: '8px',
          zIndex: 30,
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
          fontSize: '12px', color: 'rgba(255,255,255,0.7)',
          animation: 'fadeIn 0.3s ease',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <circle cx="6" cy="6" r="5" stroke={(() => {
              const type = selectedFlight.aircraftType;
              const colors: Record<string, string> = { jet: '#fbbf24', widebody: '#a78bfa', helicopter: '#34d399', cargo: '#f59e0b', light: '#94a3b8' };
              return colors[type] ?? '#fbbf24';
            })()} strokeWidth="1.5" />
            <circle cx="6" cy="6" r="2" fill={(() => {
              const type = selectedFlight.aircraftType;
              const colors: Record<string, string> = { jet: '#fbbf24', widebody: '#a78bfa', helicopter: '#34d399', cargo: '#f59e0b', light: '#94a3b8' };
              return colors[type] ?? '#fbbf24';
            })()} />
          </svg>
          <span>
            <strong style={{ color: 'rgba(255,255,255,0.9)' }}>Flight trail</strong>
            {' '}· {trailAge > 0 ? `${Math.floor(trailAge * 15 / 60)}m ${((trailAge * 15) % 60).toString().padStart(2, '0')}s tracked since detection` : 'starting…'}
          </span>
        </div>
      )}

      <style>{`
        @keyframes breathe {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(1.4); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes dropIn {
          from { opacity: 0; transform: translateY(-6px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        ::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}