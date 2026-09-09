'use client'
import React, { useState, useMemo } from "react";
import MapGL, { useControl } from "react-map-gl/maplibre";
import { setWorkerUrl } from "maplibre-gl";
import { MapLibreOverlay } from "@deck.gl/maplibre";
import { IconLayer, PathLayer } from "@deck.gl/layers";
import 'maplibre-gl/dist/maplibre-gl.css';

import type { Flight } from "@/lib/flight/types";
import { useAnimatedFlights } from "@/lib/flight/useAnimatedFlights";
import FlightSidebar from "@/components/ui/FlightSidebar";

setWorkerUrl('/lib/maplibre/maplibre-gl-worker.mjs');

// ─── Icon mapping — uses the existing plane.png atlas (1024×1024, mask=true) ──
// All aircraft types share the same atlas; visual distinction is via color + size.
const ICON_ATLAS_URL = '/assets/plane.png';

const ICON_MAPPING = {
  airplane: { x: 0, y: 0, width: 1024, height: 1024, anchorX: 512, anchorY: 512, mask: true },
};

// Color per aircraft type (RGBA)
const TYPE_COLOR_NORMAL: Record<string, [number, number, number]> = {
  jet:        [255, 200,  50],   // gold
  widebody:   [167, 139, 250],   // violet
  helicopter: [ 52, 211, 153],   // emerald
  cargo:      [251, 191,  36],   // amber
};

const TYPE_COLOR_SELECTED: Record<string, [number, number, number]> = {
  jet:        [255, 100,  60],
  widebody:   [200, 160, 255],
  helicopter: [100, 240, 180],
  cargo:      [255, 220,  80],
};

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

  const handleFlightClick = (info: any) => {
    if (info.object) {
      setSelectedFlight(info.object as Flight);
    }
  };

  const handleMapClick = () => {
    setSelectedFlight(null);
  };

  // ─ Build per-type icon layers (4 types, each with its own atlas) ──────────
  const iconLayers = useMemo(() => {
    const types = ['jet', 'widebody', 'helicopter', 'cargo'] as const;

    return types.map((type) => {
      const data = flights.filter(f => f.aircraftType === type);

      return new IconLayer<Flight>({
        id: `flight-icons-${type}`,
        data,
        pickable: true,
        onClick: handleFlightClick,
        iconAtlas: ICON_ATLAS_URL,
        iconMapping: ICON_MAPPING,
        getIcon: () => 'airplane',
        getPosition: (d) => [d.lon, d.lat],
        getAngle: (d) => -d.heading,
        getSize: type === 'helicopter' ? 28 : 36,
        sizeScale: currentZoom / 6,
        sizeMinPixels: type === 'helicopter' ? 6 : 8,
        sizeMaxPixels: type === 'helicopter' ? 60 : 80,
        getColor: (d) => {
          const isSelected = d.id === selectedFlight?.id;
          const base = isSelected ? TYPE_COLOR_SELECTED[type] : TYPE_COLOR_NORMAL[type];
          return [...base, isSelected ? 255 : 220] as [number, number, number, number];
        },
        updateTriggers: {
          getColor: [selectedFlight?.id],
          sizeScale: [currentZoom],
        },
      });
    });
  }, [flights, selectedFlight, currentZoom]);


  const fadingTrailLayers = useMemo(() => {
    if (!selectedFlight) return [];

    const trail = trailMap.get(selectedFlight.id);
    if (!trail || trail.length < 2) return [];

    const type = selectedFlight.aircraftType;
    const accent = TYPE_COLOR_NORMAL[type] ?? [255, 255, 255];

    // Split into segments, each with opacity proportional to how recent it is
    const segments = [];
    const total = trail.length;

    for (let i = 0; i < total - 1; i++) {
      const progress = i / (total - 1); // 0 = oldest, 1 = newest
      const alpha = Math.round(20 + progress * 200); // 20 → 220

      segments.push({
        path: [trail[i], trail[i + 1]],
        alpha,
        progress,
      });
    }

    // Group segments into 10 buckets for efficiency
    const BUCKETS = 10;
    const layers = [];

    for (let b = 0; b < BUCKETS; b++) {
      const lo = Math.floor((b / BUCKETS) * segments.length);
      const hi = Math.floor(((b + 1) / BUCKETS) * segments.length);
      const bucket = segments.slice(lo, hi);
      if (bucket.length === 0) continue;

      const avgProgress = bucket.reduce((s, x) => s + x.progress, 0) / bucket.length;
      const alpha = Math.round(15 + avgProgress * 210);

      layers.push(new PathLayer({
        id: `trail-bucket-${b}`,
        data: bucket.map(s => ({ path: s.path })),
        getPath: (d: any) => d.path,
        getColor: [...accent, alpha] as [number, number, number, number],
        getWidth: 1.5 + avgProgress * 1.5,
        widthMinPixels: 1,
        widthMaxPixels: 4,
        pickable: false,
        opacity: 1,
      }));
    }

    return layers;
  }, [selectedFlight, trailMap]);

  const allLayers = [...iconLayers, ...fadingTrailLayers];

  // Trail age in seconds
  const trailAge = useMemo(() => {
    if (!selectedFlight) return 0;
    const trail = trailMap.get(selectedFlight.id);
    return trail ? trail.length : 0;
  }, [selectedFlight, trailMap]);

  return (
    <div className="w-screen h-screen relative font-sans bg-slate-950">
      <MapGL
        initialViewState={{ longitude: -95.0, latitude: 38.0, zoom: 4 }}
        style={{ width: '100%', height: '100%' }}
        mapStyle={`https://api.maptiler.com/maps/darkmatter/style.json?key=${process.env.NEXT_PUBLIC_MAPTILER_KEY || ''}`}
        onClick={handleMapClick}
        onMove={(evt) => setCurrentZoom(evt.viewState.zoom)}
      >
        <DeckGLOverlay layers={allLayers} />
      </MapGL>

      {/* Apple-style flight detail sidebar */}
      <FlightSidebar
        flight={selectedFlight}
        trailLength={trailAge}
        onClose={() => setSelectedFlight(null)}
      />

      {/* Live counter badge */}
      <div style={{
        position: 'absolute',
        top: '20px',
        left: '20px',
        background: 'rgba(18,18,22,0.82)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '12px',
        padding: '8px 16px',
        color: 'rgba(255,255,255,0.9)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
        fontSize: '13px',
        fontWeight: 500,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        zIndex: 30,
      }}>
        <span style={{
          width: '7px', height: '7px', borderRadius: '50%',
          background: '#34d399',
          display: 'inline-block',
          boxShadow: '0 0 6px #34d39980',
          animation: 'breathe 2s ease-in-out infinite',
        }} />
        {flights.length} aircraft live
      </div>

      <style>{`
        @keyframes breathe {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.5; transform: scale(1.3); }
        }
      `}</style>
    </div>
  );
}