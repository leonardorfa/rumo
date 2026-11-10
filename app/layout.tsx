import type { Metadata, Viewport } from "next";
import "./globals.css";

const base = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const metadata: Metadata = {
  title: "Rumo",
  description: "Dinheiro, metas e treino. Tudo no seu iPhone.",
  manifest: `${base}/manifest.webmanifest`,
  appleWebApp: { capable: true, title: "Rumo", statusBarStyle: "default" },
  icons: { apple: `${base}/icon-180.png`, icon: `${base}/icon-192.png` },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        {/* Tema salvo aplicado antes de pintar a tela. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
