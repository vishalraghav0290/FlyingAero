import 'maplibre-gl/dist/maplibre-gl.css';
import './globals.css'; // Your Tailwind CSS

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}