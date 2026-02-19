import { NextResponse } from "next/server";

// Plus de routes protégées par middleware — le dashboard est public
// Seuls les boutons admin sont conditionnés côté client
// et l'API /api/llm-monitor/run est protégée côté serveur
export function middleware() {
  return NextResponse.next();
}

export const config = {
  matcher: [],
};
