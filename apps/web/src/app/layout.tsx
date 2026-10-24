import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const jakarta = localFont({ src: "./fonts/PlusJakartaSans-Variable.woff2", variable: "--font-jakarta", weight: "300 800", display: "swap" });
const jbmono = localFont({ src: "./fonts/JetBrainsMono-Variable.woff2", variable: "--font-jbmono", weight: "400 700", display: "swap" });

export const metadata: Metadata = {
  title: { default: "PinFlow Studio — Arduino code. Visual clarity.", template: "%s · PinFlow Studio" },
  description: "Edit Arduino and ESP32 sketches as real C++ and as blocks, side by side and always in sync. Unsupported code is preserved, never rewritten.",
  applicationName: "PinFlow Studio",
};

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#0f0d0c" }, { media: "(prefers-color-scheme: light)", color: "#efe7df" }],
  width: "device-width",
  initialScale: 1,
};

const themeScript = `(function(){try{var t=localStorage.getItem('pf-theme');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t;}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" className={`${jakarta.variable} ${jbmono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="pf-ambient min-h-dvh bg-bg text-fg antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:px-4 focus:py-2 pf-accent-fill">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
