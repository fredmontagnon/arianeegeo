import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateRecommendations } from "@/lib/llm-clients";
import { LLM_MARKET_WEIGHTS } from "@/lib/llm-queries";
import type { LLMName } from "@/lib/llm-queries";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  // Vérification auth
  const adminSession = request.cookies.get("admin_session");
  if (!adminSession || adminSession.value !== "authenticated") {
    return NextResponse.json(
      { success: false, error: "Non authentifié" },
      { status: 401 }
    );
  }

  const startTime = Date.now();
  console.log("[LLM-RECO] === Régénération des recommandations ===");

  try {
    const body = await request.json().catch(() => ({}));
    const targetDate = (body as { date?: string }).date || new Date().toISOString().split("T")[0];

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      process.env.SUPABASE_SERVICE_ROLE_KEY || "",
      {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { fetch: (url, options) => fetch(url, { ...options, cache: "no-store" }) },
      }
    );

    // 1. Récupérer les requêtes actives
    const { data: queries, error: queriesError } = await supabaseAdmin
      .from("llm_queries")
      .select("id, query_text, bloc, bloc_label, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (queriesError || !queries || queries.length === 0) {
      return NextResponse.json({
        success: false,
        error: "Aucune requête active trouvée",
      }, { status: 400 });
    }

    // 2. Récupérer tous les résultats du jour
    const { data: allResults, error: resultsError } = await supabaseAdmin
      .from("llm_results")
      .select("llm_name, is_mentioned, query_id, response_text, error")
      .eq("run_date", targetDate);

    if (resultsError || !allResults || allResults.length === 0) {
      return NextResponse.json({
        success: false,
        error: `Aucun résultat trouvé pour le ${targetDate}. Lancez d'abord un scan.`,
      }, { status: 400 });
    }

    console.log(`[LLM-RECO] ${allResults.length} résultats trouvés pour le ${targetDate}`);

    // 3. Calculer les stats (même logique que run/route.ts)
    // Scores par LLM (en excluant les résultats en erreur)
    const llmCounts: Record<string, { mentioned: number; total: number }> = {};
    for (const r of allResults) {
      if (!r.response_text) continue;
      if (!llmCounts[r.llm_name]) llmCounts[r.llm_name] = { mentioned: 0, total: 0 };
      llmCounts[r.llm_name].total++;
      if (r.is_mentioned) llmCounts[r.llm_name].mentioned++;
    }

    // Scores par bloc thématique
    const queryBlocMap: Record<string, string> = {};
    for (const q of queries) {
      queryBlocMap[q.id] = q.bloc;
    }
    const blocCounts: Record<string, { mentioned: number; total: number }> = {};
    for (const r of allResults) {
      if (!r.response_text) continue;
      const bloc = queryBlocMap[r.query_id] || "unknown";
      if (!blocCounts[bloc]) blocCounts[bloc] = { mentioned: 0, total: 0 };
      blocCounts[bloc].total++;
      if (r.is_mentioned) blocCounts[bloc].mentioned++;
    }

    // Détails des questions où la marque est absente
    const queryTextMap: Record<string, string> = {};
    const queryBlocLabelMap: Record<string, string> = {};
    for (const q of queries) {
      queryTextMap[q.id] = q.query_text;
      queryBlocLabelMap[q.id] = q.bloc_label;
    }
    const absentByQuery: Record<string, string[]> = {};
    for (const r of allResults) {
      if (!r.response_text) continue;
      if (!r.is_mentioned) {
        if (!absentByQuery[r.query_id]) absentByQuery[r.query_id] = [];
        absentByQuery[r.query_id].push(r.llm_name);
      }
    }
    const absentDetails = Object.entries(absentByQuery).map(([qid, llms]) => ({
      query: queryTextMap[qid] || qid,
      bloc: queryBlocLabelMap[qid] || "Inconnu",
      absent_from: llms,
    }));

    // Score global (moyenne pondérée par part de marché LLM)
    const llmScoreEntries = Object.entries(llmCounts)
      .filter(([, counts]) => counts.total > 0)
      .map(([llm, counts]) => ({ llm, score: Math.round((counts.mentioned / counts.total) * 100) }));
    const totalWeightReco = llmScoreEntries.reduce((sum, { llm }) => sum + (LLM_MARKET_WEIGHTS[llm as LLMName] || 0), 0);
    const scoreGlobal = llmScoreEntries.length > 0 && totalWeightReco > 0
      ? Math.round(llmScoreEntries.reduce((sum, { llm, score }) => sum + score * (LLM_MARKET_WEIGHTS[llm as LLMName] || 0), 0) / totalWeightReco)
      : 0;

    const summaryStats = {
      date: targetDate,
      score_global: scoreGlobal,
      total_queries: queries.length,
      total_results: allResults.length,
      total_mentions: allResults.filter((r) => r.is_mentioned).length,
      llm_scores: Object.fromEntries(
        Object.entries(llmCounts).map(([llm, counts]) => [
          llm,
          counts.total > 0 ? Math.round((counts.mentioned / counts.total) * 100) : 0,
        ])
      ),
      bloc_scores: Object.fromEntries(
        Object.entries(blocCounts).map(([bloc, counts]) => [
          bloc,
          {
            mentioned: counts.mentioned,
            total: counts.total,
            pct: counts.total > 0 ? Math.round((counts.mentioned / counts.total) * 100) : 0,
          },
        ])
      ),
      absent_details: absentDetails,
    };

    // 4. Générer les recommandations
    console.log(`[LLM-RECO] Score global: ${scoreGlobal}%, appel Claude...`);
    const recoResult = await generateRecommendations(summaryStats);

    // 5. Sauvegarder en base
    const { error: upsertError } = await supabaseAdmin
      .from("llm_daily_recommendations")
      .upsert(
        {
          run_date: targetDate,
          recommendations: recoResult.recommendations,
          summary_stats: summaryStats,
          model_used: "claude-sonnet-4-6",
          tokens_used: recoResult.tokens_used,
          generated_at: new Date().toISOString(),
        },
        { onConflict: "run_date" }
      );

    if (upsertError) {
      console.error("[LLM-RECO] Erreur upsert:", upsertError);
      return NextResponse.json({
        success: false,
        error: `Erreur sauvegarde: ${upsertError.message}`,
      }, { status: 500 });
    }

    const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[LLM-RECO] === Terminé en ${durationSec}s ===`);

    return NextResponse.json({
      success: true,
      date: targetDate,
      score_global: scoreGlobal,
      recommendations_count: recoResult.recommendations.length,
      tokens_used: recoResult.tokens_used,
      duration_sec: parseFloat(durationSec),
    });
  } catch (error) {
    console.error("[LLM-RECO] Erreur:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erreur interne",
      },
      { status: 500 }
    );
  }
}
