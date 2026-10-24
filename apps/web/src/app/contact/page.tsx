import { LegalPage } from "@/components/LegalPage";
export const metadata = { title: "Contact" };
export const dynamic = "force-dynamic";
export default function Contact() {
  return <LegalPage source={`# Contact\n\nQuestions, bug reports or a sketch that doesn’t convert the way you expect? Email **hello@pinflow.studio** (placeholder address — configure before launch) and include the sketch if you can. A status page is not available yet.\n`} />;
}
