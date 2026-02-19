import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { queryAllLLMs, analyzeResponses, generateRecommendations } from "@/lib/llm-clients";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Nombre de requêtes par batch (5 requêtes = ~50s max, bien dans les 300s)
const BATCH_SIZE = 5;

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

  console.log("[LLM-MONITOR-RUN] === Lancement manuel du monitoring ===");

  try {
    const body = await request.json().catch(() => ({}));
    const targetDate = (body as { date?: string }).date || new Date().toISOString().split("T")[0];
    // batch optionnel : si fourni, ne traite que ce batch. Sinon, traite tout.
    const requestedBatch = (body as { batch?: number }).batch;

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

    // 2. Déterminer les requêtes à traiter
    let queriesToProcess = queries;
    const totalBatches = Math.ceil(queries.length / BATCH_SIZE);

    if (requestedBatch !== undefined && requestedBatch >= 1 && requestedBatch <= totalBatches) {
      const startIdx = (requestedBatch - 1) * BATCH_SIZE;
      const endIdx = Math.min(startIdx + BATCH_SIZE, queries.length);
      queriesToProcess = queries.slice(startIdx, endIdx);
      console.log(`[LLM-MONITOR-RUN] Batch ${requestedBatch}/${totalBatches}: requêtes ${startIdx + 1}-${endIdx}`);
    } else {
      console.log(`[LLM-MONITOR-RUN] Toutes les requêtes: ${queries.length}, date: ${targetDate}`);
    }

    // 3. Traiter les requêtes
    let totalProcessed = 0;
    let totalMentions = 0;
    let totalErrors = 0;

    for (const query of queriesToProcess) {
      // Safety: vérifier qu'on ne dépasse pas 250s
      const elapsed = (Date.now() - startTime) / 1000;
      if (elapsed > 250) {
        console.warn(`[LLM-MONITOR-RUN] Timeout safety: arrêt après ${totalProcessed} requêtes (${elapsed.toFixed(0)}s)`);
        break;
      }

      console.log(`[LLM-MONITOR-RUN] Requête ${totalProcessed + 1}/${queriesToProcess.length}: "${query.query_text.substring(0, 50)}..."`);

      try {
        const llmResponses = await queryAllLLMs(query.query_text);

        const validResponses = llmResponses
          .filter((r) => r.response !== null)
          .map((r) => ({ llmName: r.llmName, text: r.response! }));

        const analyses = validResponses.length > 0
          ? await analyzeResponses(query.query_text, validResponses)
          : [];

        for (const llmResponse of llmResponses) {
          const analysis = analyses.find((a) => a.llmName.toLowerCase() === llmResponse.llmName.toLowerCase());

          const { error: upsertError } = await supabaseAdmin
            .from("llm_results")
            .upsert(
              {
                query_id: query.id,
                llm_name: llmResponse.llmName,
                run_date: targetDate,
                response_text: llmResponse.response,
                is_mentioned: analysis?.is_mentioned ?? false,
                mention_rank: analysis?.mention_rank ?? null,
                sentiment: analysis?.sentiment ?? null,
                error: llmResponse.error,
              },
              { onConflict: "query_id,llm_name,run_date" }
            );

          if (upsertError) {
            console.error(`[LLM-MONITOR-RUN] Erreur upsert:`, upsertError.message);
            totalErrors++;
          } else {
            if (analysis?.is_mentioned) totalMentions++;
            if (llmResponse.error) totalErrors++;
          }
        }

        totalProcessed++;
      } catch (queryError) {
        console.error(`[LLM-MONITOR-RUN] Erreur requête:`, queryError);
        totalErrors++;
        totalProcessed++;
      }
    }

    // 4. Recommandations (seulement si on a traité toutes les requêtes ou dernier batch)
    let recommendations = null;
    let tokensUsed = 0;
    const isLastBatch = requestedBatch === undefined || requestedBatch === totalBatches;

    if (isLastBatch && totalProcessed > 0) {
      // Vérifier qu'on a assez de résultats pour les recos
      const { count: totalResultCount } = await supabaseAdmin
        .from("llm_results")
        .select("id", { count: "exact", head: true })
        .eq("run_date", targetDate);

      if (totalResultCount && totalResultCount >= queries.length * 2) {
        try {
          // Calculer stats depuis tous les résultats du jour (avec réponse texte et erreur pour filtrer)
          const { data: allResults } = await supabaseAdmin
            .from("llm_results")
            .select("llm_name, is_mentioned, query_id, response_text, error")
            .eq("run_date", targetDate);

          if (allResults && allResults.length > 0) {
            // Scores par LLM (en excluant les résultats en erreur)
            const llmCounts: Record<string, { mentioned: number; total: number }> = {};
            for (const r of allResults) {
              if (!r.response_text) continue; // ignorer les erreurs
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

            // Détails des questions où Lisnard est absent
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

            // Score global
            const validResults = allResults.filter((r) => !!r.response_text);
            const totalMentionsValid = validResults.filter((r) => r.is_mentioned).length;
            const scoreGlobal = validResults.length > 0
              ? Math.round((totalMentionsValid / validResults.length) * 100)
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

            const recoResult = await generateRecommendations(summaryStats);
            recommendations = recoResult.recommendations;
            tokensUsed = recoResult.tokens_used;

            await supabaseAdmin
              .from("llm_daily_recommendations")
              .upsert(
                {
                  run_date: targetDate,
                  recommendations,
                  summary_stats: summaryStats,
                  model_used: "claude-sonnet-4-6",
                  tokens_used: tokensUsed,
                  generated_at: new Date().toISOString(),
                },
                { onConflict: "run_date" }
              );
          }
        } catch (recoError) {
          console.error("[LLM-MONITOR-RUN] Erreur recommandations:", recoError);
        }
      }
    }

    const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[LLM-MONITOR-RUN] === Terminé en ${durationSec}s ===`);

    return NextResponse.json({
      success: true,
      date: targetDate,
      batch: requestedBatch || "all",
      total_batches: totalBatches,
      queries_processed: totalProcessed,
      queries_total: queriesToProcess.length,
      total_mentions: totalMentions,
      total_errors: totalErrors,
      recommendations_count: recommendations?.length ?? 0,
      duration_sec: parseFloat(durationSec),
    });
  } catch (error) {
    console.error("[LLM-MONITOR-RUN] Erreur fatale:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erreur interne",
      },
      { status: 500 }
    );
  }
}
