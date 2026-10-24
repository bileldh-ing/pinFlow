import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { dirOf } from "@/i18n/config";
import { I18nProvider } from "@/i18n/client";
import { getI18n } from "@/i18n/server";
import "./globals.css";

const jakarta = localFont({ src: "./fonts/PlusJakartaSans-Variable.woff2", variable: "--font-jakarta", weight: "300 800", display: "swap" });
const jbmono = localFont({ src: "./fonts/JetBrainsMono-Variable.woff2", variable: "--font-jbmono", weight: "400 700", display: "swap" });
// Arabic-capable UI font. Only fetched when Arabic glyphs are rendered (it sits after Jakarta in the stack).
const arabic = localFont({ src: "./fonts/NotoSansArabic-Variable.woff2", variable: "--font-arabic", weight: "100 900", display: "swap", preload: false });

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: { default: t("meta.title"), template: "%s · PinFlow Studio" },
    description: t("meta.description"),
    applicationName: "PinFlow Studio",
  };
}

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#0f0d0c" }, { media: "(prefers-color-scheme: light)", color: "#efe7df" }],
  width: "device-width",
  initialScale: 1,
};

// Runs before paint: theme (light | dark | system) and a cookie for a locale chosen earlier in this browser.
const bootScript = `(function(){try{var d=document.documentElement,t=localStorage.getItem('pf-theme');if(t==='system'){t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';d.dataset.themePref='system';}if(t==='light'||t==='dark'){d.dataset.theme=t;}var l=localStorage.getItem('pf-locale');if(l&&document.cookie.indexOf('pf-locale=')<0){document.cookie='pf-locale='+l+'; path=/; max-age=31536000; samesite=lax';}}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, t } = await getI18n();
  return (
    <html lang={locale} dir={dirOf(locale)} data-locale={locale} data-theme="dark" className={`${jakarta.variable} ${jbmono.variable} ${arabic.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
      </head>
      <body className="pf-ambient min-h-dvh bg-bg text-fg antialiased">
        <I18nProvider locale={locale}>
          <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-50 focus:rounded-full focus:px-4 focus:py-2 pf-accent-fill">{t("common.skip")}</a>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
