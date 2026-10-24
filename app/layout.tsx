import "./globals.css";
import type { Metadata, Viewport } from "next";
import { getClub } from "@/lib/data";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  try { const c = await getClub(); return { title: { default: c.name, template: `%s · ${c.name}` }, description: c.tagline }; }
  catch { return { title: "Reservas de pádel" }; }
}
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#10261c" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let style: Record<string, string> = {};
  try { const c = await getClub(); style = { "--pri": c.color_primary, "--acc": c.color_accent }; } catch {}
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=Figtree:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body style={style as React.CSSProperties}>{children}</body>
    </html>
  );
}
