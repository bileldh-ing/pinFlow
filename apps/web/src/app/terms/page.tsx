import { LegalPage } from "@/components/LegalPage";
export const metadata = { title: "Terms" };
export const dynamic = "force-dynamic";
export default function Terms() {
  return <LegalPage source={`# Terms of use\n\n*Draft — to be reviewed by counsel before a commercial launch.*\n\n- You keep all rights to the code you write in PinFlow Studio.\n- You are responsible for what you upload to your hardware. PinFlow does not upload code to devices on your behalf.\n- Don’t use the compile service for anything other than building Arduino sketches (no mining, scanning or abuse). Rate limits apply.\n- The service is provided as is during this early release. We may change or discontinue features with notice.\n- Third-party toolchains, cores and libraries are used under their own licenses.\n`} />;
}
