import Link from "next/link";
import { getT } from "@/i18n/server";

export default async function NotFound() {
  const t = await getT();
  return (
    <main id="main" className="pf-grid-bg grid min-h-dvh place-items-center px-4 text-center">
      <div>
        <p className="font-mono text-sm text-accent">404</p>
        <h1 className="mt-2 text-2xl font-semibold">{t("nf.title")}</h1>
        <p className="mt-2 text-sm text-muted">{t("nf.lead")}</p>
        <Link href="/" className="mt-6 inline-block text-accent hover:underline">{t("nf.home")}</Link>
      </div>
    </main>
  );
}
