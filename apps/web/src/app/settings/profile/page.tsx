import { listBoards } from "@pinflow/board-registry";
import { requireUser } from "@/server/auth";
import { repos } from "@/server/db";
import { AppHeader } from "@/components/app/AppHeader";
import { ProfileClient } from "./client";
import { changePasswordAction } from "@/app/actions/auth";

import { getT } from "@/i18n/server";

export async function generateMetadata() { return { title: (await getT())("meta.profile") }; }
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireUser("/settings/profile");
  const prefs = await (await repos()).preferences.get(user.id);
  const t = await getT();
  return (
    <div className="min-h-dvh">
      <AppHeader user={user} />
      <main id="main" className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="mb-6 text-[28px] font-bold tracking-tight">{t("prof.title")}</h1>
        <ProfileClient user={user} boards={listBoards().map((b) => ({ fqbn: b.fqbn, name: b.name }))}
          prefs={{ skillLevel: prefs.skillLevel, preferredBoard: prefs.preferredBoard, layout: prefs.layout, theme: prefs.theme, editorFontSize: prefs.editorFontSize }}
          changePassword={changePasswordAction} />
      </main>
    </div>
  );
}
