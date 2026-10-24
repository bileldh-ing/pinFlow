import { redirect } from "next/navigation";
import { listBoards } from "@pinflow/board-registry";
import { requireUser } from "@/server/auth";
import { repos } from "@/server/db";
import { listTemplates } from "@/server/templates";
import { OnboardingWizard } from "./wizard";
import { finishOnboardingAction } from "@/app/actions/projects";

export const metadata = { title: "Welcome" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await requireUser("/onboarding");
  const prefs = await (await repos()).preferences.get(user.id);
  if (prefs.onboardedAt) redirect("/dashboard");
  const boards = listBoards().map((b) => ({ fqbn: b.fqbn, name: b.name }));
  const templates = listTemplates().map((t) => ({ id: t.id, title: t.title, description: t.description, boardFqbn: t.boardFqbn }));
  return <OnboardingWizard name={user.displayName} boards={boards} templates={templates} action={finishOnboardingAction} />;
}
