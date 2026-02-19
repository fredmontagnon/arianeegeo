import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const cookieStore = cookies();
  const adminSession = cookieStore.get("admin_session");
  const authenticated = adminSession?.value === "authenticated";

  return NextResponse.json({ authenticated });
}
