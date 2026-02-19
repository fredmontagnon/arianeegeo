import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { LLMName } from "@/lib/llm-queries";
import { LLM_NAMES, LLM_MARKET_WEIGHTS } from "@/lib/llm-queries";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      process.env.SUPABASE_SERVICE_ROLE_KEY || "",
      {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { fetch: (url, options) => fetch(url, { ...options, cache: "no-store" }) },
      }
    );

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get("date") || new Date().toISOString().split("T")[0];

    // 1. Récupérer les requêtes
    const { data: queries } = await supabaseAdmin
      .from("llm_queries")
      .select("id, query_text, bloc, bloc_label, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (!queries || queries.length === 0) {
      return NextResponse.json(
        { success: true, data: { date: dateParam, results: [], recommendations: null, scores: { today: {}, yesterday: {} }, global_score: -1, history: [], last_scan_date: null } },
        { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
      );
    }

    // 2. Résultats du jour demandé
    const { data: todayResults } = await supabaseAdmin
      .from("llm_results")
      .select("query_id, llm_name, is_mentioned, mention_rank, sentiment, response_text, error")
      .eq("run_date", dateParam);

    // 3. Résultats de la veille (pour tendance)
    const yesterday = new Date(dateParam);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    const { data: yesterdayResults } = await supabaseAdmin
      .from("llm_results")
      .select("llm_name, is_mentioned, response_text")
      .eq("run_date", yesterdayStr);

    // 4. Construire les résultats par requête
    const results = queries.map((query) => {
      const queryResults = todayResults?.filter((r) => r.query_id === query.id) || [];
      return {
        query_id: query.id,
        query_text: query.query_text,
        bloc: query.bloc,
        bloc_label: query.bloc_label,
        sort_order: query.sort_order,
        llm_results: LLM_NAMES.map((llmName) => {
          const result = queryResults.find((r) => r.llm_name === llmName);
          return {
            llm_name: llmName,
            is_mentioned: result?.is_mentioned ?? false,
            mention_rank: result?.mention_rank ?? null,
            sentiment: result?.sentiment ?? null,
            response_text: result?.response_text ?? null,
            error: result?.error ?? null,
          };
        }),
      };
    });

    // 5. Calculer les scores du jour et de la veille (en excluant les résultats en erreur)
    const computeScores = (data: { llm_name: string; is_mentioned: boolean; has_response: boolean }[] | null): Record<LLMName, number> => {
      const scores: Record<string, number> = {};
      for (const llm of LLM_NAMES) {
        const llmResults = data?.filter((r) => r.llm_name === llm) || [];
        const validResults = llmResults.filter((r) => r.has_response);
        const mentioned = validResults.filter((r) => r.is_mentioned).length;
        // -1 = pas de données valides (uniquement des erreurs), distingué de 0% réel
        scores[llm] = validResults.length > 0 ? Math.round((mentioned / validResults.length) * 100) : -1;
      }
      return scores as Record<LLMName, number>;
    };

    const todayScores = computeScores(
      todayResults?.map((r) => ({ llm_name: r.llm_name, is_mentioned: r.is_mentioned, has_response: !!r.response_text })) ?? null
    );
    const yesterdayScores = computeScores(
      yesterdayResults?.map((r) => ({ llm_name: r.llm_name, is_mentioned: r.is_mentioned, has_response: !!r.response_text })) ?? null
    );

    // 5b. Score global (moyenne pondérée par part de marché LLM, excluant N/A)
    const activeLLMs = (Object.entries(todayScores) as [LLMName, number][]).filter(([, s]) => s >= 0);
    const totalWeight = activeLLMs.reduce((sum, [llm]) => sum + LLM_MARKET_WEIGHTS[llm], 0);
    const globalScore = activeLLMs.length > 0 && totalWeight > 0
      ? Math.round(activeLLMs.reduce((sum, [llm, score]) => sum + score * LLM_MARKET_WEIGHTS[llm], 0) / totalWeight)
      : -1;

    // 6. Historique 30 jours
    const thirtyDaysAgo = new Date(dateParam);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0];

    const { data: historyData } = await supabaseAdmin
      .from("llm_results")
      .select("run_date, llm_name, is_mentioned, response_text")
      .gte("run_date", thirtyDaysAgoStr)
      .lte("run_date", dateParam);

    // Grouper par date (en excluant les résultats sans réponse = erreurs)
    const historyMap: Record<string, Record<LLMName, { mentioned: number; total: number }>> = {};
    if (historyData) {
      for (const row of historyData) {
        // Ignorer les résultats en erreur (pas de response_text)
        if (!row.response_text) continue;

        if (!historyMap[row.run_date]) {
          const init: Record<LLMName, { mentioned: number; total: number }> = {} as Record<LLMName, { mentioned: number; total: number }>;
          for (const llm of LLM_NAMES) init[llm] = { mentioned: 0, total: 0 };
          historyMap[row.run_date] = init;
        }
        const llm = row.llm_name as LLMName;
        if (historyMap[row.run_date][llm]) {
          historyMap[row.run_date][llm].total++;
          if (row.is_mentioned) {
            historyMap[row.run_date][llm].mentioned++;
          }
        }
      }
    }

    const history = Object.entries(historyMap)
      .map(([date, llms]) => {
        const point: Record<string, string | number> = { date };
        for (const llm of LLM_NAMES) {
          const d = llms[llm];
          point[llm] = d && d.total > 0 ? Math.round((d.mentioned / d.total) * 100) : 0;
        }
        return point;
      })
      .sort((a, b) => (a.date as string).localeCompare(b.date as string));

    // 7. Recommandations du jour
    const { data: recoData } = await supabaseAdmin
      .from("llm_daily_recommendations")
      .select("recommendations, summary_stats, generated_at")
      .eq("run_date", dateParam)
      .single();

    // 8. Date du dernier scan (la date la plus récente avec des résultats)
    const { data: lastScanData } = await supabaseAdmin
      .from("llm_results")
      .select("run_date")
      .order("run_date", { ascending: false })
      .limit(1)
      .single();

    const lastScanDate = lastScanData?.run_date || null;

    return NextResponse.json(
      {
        success: true,
        data: {
          date: dateParam,
          results,
          recommendations: recoData
            ? {
                recommendations: recoData.recommendations,
                summary_stats: recoData.summary_stats,
                generated_at: recoData.generated_at,
              }
            : null,
          scores: {
            today: todayScores,
            yesterday: yesterdayScores,
          },
          global_score: globalScore,
          history,
          last_scan_date: lastScanDate,
        },
      },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch (error) {
    console.error("[LLM-MONITOR-RESULTS] Erreur:", error);
    return NextResponse.json(
      { success: false, error: "Erreur interne" },
      { status: 500, headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  }
}
