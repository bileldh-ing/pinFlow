import { listBoards } from "@pinflow/board-registry";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { ButtonLink, Chip } from "@/components/ui";
import { getCurrentUser } from "@/server/auth";
import { listTemplates } from "@/server/templates";

export const metadata = { title: "Templates" };
export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const user = await getCurrentUser().catch(() => null);
  const boards = listBoards();
  return (
    <div className="min-h-dvh">
      <SiteHeader signedIn={!!user} />
      <main id="main" className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <h1 className="text-[34px] font-bold tracking-tight">Templates</h1>
        <p className="mt-2 max-w-2xl text-muted">Working starting points. Create a project from one in your dashboard; the source below is exactly what you get.</p>
        <ul className="mt-8 grid gap-5 lg:grid-cols-2">
          {listTemplates().map((t) => (
            <li key={t.id} className="glass pf-lift flex flex-col rounded-[var(--radius)] p-6" id={t.id}>
              <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-bold">{t.title}</h2><Chip>{t.category}</Chip><Chip tone="info">{boards.find((b) => b.fqbn === t.boardFqbn)?.name ?? t.boardFqbn}</Chip></div>
              <p className="mt-1.5 text-sm text-muted">{t.description}</p>
              {t.dependencies.length > 0 && <p className="mt-1 text-xs text-faint">Libraries: {t.dependencies.map((d) => d.name).join(", ")}</p>}
              <pre className="mt-3 max-h-64 overflow-auto rounded-2xl border border-line bg-canvas p-3 font-mono text-[11.5px] leading-relaxed text-muted">{t.files[0]?.content}</pre>
              <div className="mt-3"><ButtonLink href={user ? "/dashboard" : "/signup"} size="sm" variant="primary">Use this template</ButtonLink></div>
            </li>
          ))}
        </ul>
      </main>
      <SiteFooter />
    </div>
  );
}
