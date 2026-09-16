'use client'

import React from "react"
import Map, { useControl } from "react-map-gl/maplibre"
import { setWorkerUrl } from "maplibre-gl"
import { MapLibreOverlay } from "@deck.gl/maplibre"

// Fix Turbopack worker bundling: manually point MapLibre to the worker files
// hosted in public/lib/maplibre/ (copied from node_modules/maplibre-gl/dist/)
setWorkerUrl('/lib/maplibre/maplibre-gl-worker.mjs');

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

function DeckGLOverlay(props: { layers: any[]; interleaved?: boolean }) {
    const overlay = useControl(() => new MapLibreOverlay(props));
    overlay.setProps(props);
    return null;
}

export default function FlightMap() {
    const layers: any[] = [];

    return (
        <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
            <Map
                initialViewState={{
                    longitude: 0,
                    latitude: 40,
                    zoom: 3,
                    pitch: 0,
                    bearing: 0,
                }}
                style={{ width: '100%', height: '100%' }}
                mapStyle={`https://api.maptiler.com/maps/darkmatter/style.json?key=${MAPTILER_KEY || ''}`}
            >
                <DeckGLOverlay layers={layers} />
            </Map>
        </div>
    )
}