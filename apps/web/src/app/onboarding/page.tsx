import { redirect } from "next/navigation";
import { listBoards } from "@pinflow/board-registry";
import { requireUser } from "@/server/auth";
import { repos } from "@/server/db";
import { listTemplates } from "@/server/templates";
import { OnboardingWizard } from "./wizard";
import { finishOnboardingAction } from "@/app/actions/projects";

import { getT } from "@/i18n/server";
import { tplDesc, tplTitle } from "@/i18n/content";

export async function generateMetadata() { return { title: (await getT())("meta.welcome") }; }
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await requireUser("/onboarding");
  const prefs = await (await repos()).preferences.get(user.id);
  if (prefs.onboardedAt) redirect("/dashboard");
  const boards = listBoards().map((b) => ({ fqbn: b.fqbn, name: b.name }));
  const tr = await getT();
  const templates = listTemplates().map((t) => ({ id: t.id, title: tplTitle(tr, t.id, t.title), description: tplDesc(tr, t.id, t.description), boardFqbn: t.boardFqbn }));
  return <OnboardingWizard name={user.displayName} boards={boards} templates={templates} action={finishOnboardingAction} />;
}
