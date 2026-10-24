import Link from "next/link";
import { getT } from "@/i18n/server";

export async function ProjectSubnav({ id, title, active }: { id: string; title: string; active: "history" | "settings" }) {
  const t = await getT();
  return (
    <div className="mb-6">
      <Link href="/dashboard" className="text-sm text-muted hover:text-fg">{t("sub.backProjects")}</Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[28px] font-bold tracking-tight">{title}</h1>
        <nav aria-label={t("sub.project")} className="flex gap-1 rounded-full border border-line bg-surface-inner p-1 text-sm">
          <Link href={`/projects/${id}/editor`} className="rounded-full px-3.5 py-1.5 font-medium text-muted hover:text-fg">{t("sub.workbench")}</Link>
          <Link href={`/projects/${id}/history`} aria-current={active === "history" ? "page" : undefined} className={`rounded-full px-3.5 py-1.5 font-medium ${active === "history" ? "bg-surface-hover text-fg" : "text-muted hover:text-fg"}`}>{t("sub.history")}</Link>
          <Link href={`/projects/${id}/settings`} aria-current={active === "settings" ? "page" : undefined} className={`rounded-full px-3.5 py-1.5 font-medium ${active === "settings" ? "bg-surface-hover text-fg" : "text-muted hover:text-fg"}`}>{t("sub.settings")}</Link>
        </nav>
      </div>
    </div>
  );
}
