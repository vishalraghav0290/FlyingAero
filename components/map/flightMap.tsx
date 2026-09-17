'use client'

import React from "react"
import Map from "react-map-gl/maplibre"
import DeckGL from "@deck.gl/react"

const layers: any[] = [];
const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;


export default function FlightMap() {
    return (
        <div className="w-screen h-screen relative">
            <DeckGL
                initialViewState={{
                    longitude: 0,
                    latitude: 40,
                    zoom: 3,
                    pitch: 0,
                    bearing: 0
                }}
                controller={true}
                layers={layers}
            >
                <Map 
                    mapStyle={`https://api.maptiler.com/maps/darkmatter/style.json?key=${MAPTILER_KEY || ''}`}
                />
            </DeckGL>
        </div>
    )
}