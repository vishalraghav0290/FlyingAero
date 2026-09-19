'use client'
import React, { useState, useEffect } from "react";
import Map, { useControl } from "react-map-gl/maplibre";
import { setWorkerUrl } from "maplibre-gl";
import { MapLibreOverlay } from "@deck.gl/maplibre";
import { IconLayer } from "@deck.gl/layers";
import 'maplibre-gl/dist/maplibre-gl.css'; // MUST BE IMPORTED FOR SMOOTH LOADING

setWorkerUrl('/lib/maplibre/maplibre-gl-worker.mjs');

function DeckGLOverlay(props: { layers: any[]; interleaved?: boolean }) {
    const overlay = useControl(() => new MapLibreOverlay(props));
    overlay.setProps(props);
    return null;
}

interface Flight {
    id: string;
    callsign: string;
    lon: number;
    lat: number;
    heading: number;
    altitude: number;
    velocity: number;
}

export default function FlightMap() {
    const [flights, setFlights] = useState<Flight[]>([]);
    const [selectedFlight, setSelectedFlight] = useState<Flight | null>(null);

    useEffect(() => {
        const fetchFlights = async () => {
            try {
                const res = await fetch('/api/flight');
                if (!res.ok) {
                    throw new Error(`HTTP ${res.status} ${res.statusText}`);
                }
                const data = await res.json();
                if (Array.isArray(data)) setFlights(data);
            } catch (err) {
                console.error("Error fetching flights:", err);
            }
        };

        fetchFlights();
        const interval = setInterval(fetchFlights, 10000); // 10 second poll
        return () => clearInterval(interval);
    }, []);

    const iconLayer = new IconLayer<Flight>({
        id: 'flight-icons',
        data: flights,
        pickable: true,
        onClick: (info) => setSelectedFlight(info.object ? (info.object as Flight) : null),
        iconAtlas: '/assets/plane.png',
        iconMapping: '/assets/plane.json',
        getIcon: () => 'airplane',
        getPosition: (d) => [d.lon, d.lat],
        getAngle: (d) => -d.heading,
        getSize: 36,
        getColor: (d) => d.id === selectedFlight?.id ? [255, 50, 50] : [255, 200, 0],
        sizeScale: 1,
        sizeMinPixels: 16,
        sizeMaxPixels: 64,

        // SMOOTH ANIMATION ENGINE
        transitions: {
            getPosition: {
                duration: 10000,     // Matches the 10 second API poll
                easing: (t: number) => t,    // Linear movement: no speeding up or slowing down
            },
            getAngle: {
                duration: 2000,      // Turns happen faster (2 seconds) so they don't look weird
                easing: (t: number) => t,
            }
        },
        updateTriggers: {
            getColor: [selectedFlight?.id]
        }
    });

    return (
        // Added bg-slate-950 here to prevent white flash before dark map tiles load
        <div className="w-screen h-screen relative font-sans bg-slate-950">
            <Map
                initialViewState={{ longitude: -95.0, latitude: 38.0, zoom: 4 }}
                style={{ width: '100%', height: '100%' }}
                mapStyle={`https://api.maptiler.com/maps/darkmatter/style.json?key=${process.env.NEXT_PUBLIC_MAPTILER_KEY || ''}`}
                onClick={() => setSelectedFlight(null)}
            >
                <DeckGLOverlay layers={[iconLayer]} />
            </Map>

            {selectedFlight && (
                <div className="absolute top-6 right-6 w-80 bg-slate-900/90 text-white p-5 rounded-xl border border-slate-700 shadow-2xl backdrop-blur-md z-50 transition-all">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <h2 className="text-2xl font-bold tracking-tight text-yellow-400">
                                {selectedFlight.callsign}
                            </h2>
                            <p className="text-xs text-slate-400 font-mono mt-1">HEX: {selectedFlight.id}</p>
                        </div>
                        <button onClick={() => setSelectedFlight(null)} className="text-slate-400 hover:text-white transition-colors">
                            ✕
                        </button>
                    </div>

                    <div className="space-y-3">
                        <div className="flex justify-between border-b border-slate-700 pb-2">
                            <span className="text-slate-400 text-sm">Altitude</span>
                            <span className="font-semibold">{Math.round(selectedFlight.altitude)} meters</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-700 pb-2">
                            <span className="text-slate-400 text-sm">Speed</span>
                            <span className="font-semibold">{Math.round(selectedFlight.velocity * 3.6)} km/h</span>
                        </div>
                        <div className="flex justify-between pb-1">
                            <span className="text-slate-400 text-sm">Heading</span>
                            <span className="font-semibold">{Math.round(selectedFlight.heading)}°</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}