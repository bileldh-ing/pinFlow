import { LegalPage } from "@/components/LegalPage";
import { getT } from "@/i18n/server";

export async function generateMetadata() { return { title: (await getT())("meta.contact") }; }
export const dynamic = "force-dynamic";
export default async function Contact() {
  const t = await getT();
  return <LegalPage localized source={t("contact.body")} />;
}
