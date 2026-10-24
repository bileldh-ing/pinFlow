import { NextResponse } from "next/server";
import { endSession } from "@/server/auth";

async function handle(req: Request) {
  // GET is allowed only for same-origin navigations (Sec-Fetch-Site), so a third-party page cannot log users out.
  if (req.method === "GET") {
    const site = req.headers.get("sec-fetch-site");
    if (site && site !== "same-origin" && site !== "none") return NextResponse.redirect(new URL("/", req.url), 303);
  }
  await endSession();
  return NextResponse.redirect(new URL("/", req.url), 303);
}
export const GET = handle;
export const POST = handle;
