import FlightMap from '@/components/map/flightMap';

export default function Home() {
    return (
        <main className="flex min-h-screen flex-col items-center justify-between">
            <FlightMap />
        </main>
    );
}