"use client";
import { useT } from "@/i18n/client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-4 text-center">
      <div>
        <h1 className="text-2xl font-semibold">{t("err.title")}</h1>
        <p className="mt-2 text-sm text-muted">{t("err.safe")} {error.digest ? t("err.ref", { ref: error.digest }) : ""}</p>
        <button type="button" onClick={reset} className="mt-6 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink">{t("err.tryAgain")}</button>
      </div>
    </main>
  );
}
