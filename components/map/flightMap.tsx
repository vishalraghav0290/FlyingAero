'use client'

import React from "react"
import Map, { useControl } from "react-map-gl/maplibre"
import { setWorkerUrl } from "maplibre-gl"
import { MapLibreOverlay } from "@deck.gl/maplibre"
import { IconLayer } from "@deck.gl/layers"

// Fix Turbopack worker bundling: manually point MapLibre to worker files in public/
setWorkerUrl('/lib/maplibre/maplibre-gl-worker.mjs');

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

function DeckGLOverlay(props: { layers: any[]; interleaved?: boolean }) {
    const overlay = useControl(() => new MapLibreOverlay(props));
    overlay.setProps(props);
    return null;
}

interface Flight {
    id: string;
    lon: number;
    lat: number;
    heading: number;
    altitude: number;
}

export default function FlightMap() {
    const flightData: Flight[] = [
        { id: 'F1', lon: -74.006, lat: 40.712, heading: 45, altitude: 30000 },
        { id: 'F2', lon: -118.243, lat: 34.052, heading: 180, altitude: 25000 },
    ];
    const iconLayer = new IconLayer<Flight>({
        id: 'flight-icons',
        data: flightData,
        pickable: true,
        iconAtlas: '/assets/plane.png',
        iconMapping: '/assets/plane.json',
        getIcon: () => 'airplane',
        getPosition: (d) => [d.lon, d.lat],
        getAngle: (d) => -d.heading,
        getSize: 36,
        getColor: [255, 200, 0],
        sizeScale: 1,
        sizeMinPixels: 16,
        sizeMaxPixels: 64,

        transitions: {
            getPosition: 1000,
            getAngle: 1000,
        },
    });
    console.table(iconLayer)

    return (
        <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
            <Map
                initialViewState={{
                    longitude: -95.0,
                    latitude: 38.0,
                    zoom: 4,
                    pitch: 0,
                    bearing: 0,
                }}
                style={{ width: '100%', height: '100%' }}
                mapStyle={`https://api.maptiler.com/maps/darkmatter/style.json?key=${MAPTILER_KEY || ''}`}
            >
                {/* Pass the array containing the constructed layer */}
                <DeckGLOverlay layers={[iconLayer]} />
            </Map>
        </div>
    )
}