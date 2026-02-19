"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  Loader2,
  Brain,
  Clock,
} from "lucide-react";
import { LLMScoreCards } from "@/components/llm-score-cards";
import { LLMHeatmap } from "@/components/llm-heatmap";
import { LLMTrendChart } from "@/components/llm-trend-chart";
import { LLMRecommendations } from "@/components/llm-recommendations";
import type { LLMDashboardData } from "@/lib/llm-queries";

function formatDateFR(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function LLMMonitorPage() {
  const [data, setData] = useState<LLMDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  const fetchData = useCallback(async (date: string, autoRedirect = false) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/llm-monitor/results?date=${date}`);
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const json = await res.json();
      if (json.success) {
        const d = json.data as LLMDashboardData;

        // Si c'est le chargement initial, qu'on est sur aujourd'hui sans résultats,
        // et qu'il y a un dernier scan, on bascule automatiquement
        if (autoRedirect && d.last_scan_date) {
          const hasResults = d.results?.some((r: LLMDashboardData["results"][0]) =>
            r.llm_results.some((lr) => lr.response_text || lr.error)
          );
          if (!hasResults && d.last_scan_date !== date) {
            setSelectedDate(d.last_scan_date);
            setIsLoading(false);
            return; // Le useEffect va relancer fetchData avec la bonne date
          }
        }

        setData(d);
      } else {
        setError(json.error || "Erreur inconnue");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement");
    } finally {
      setIsLoading(false);
      setIsInitialLoad(false);
    }
  }, []);

  useEffect(() => {
    fetchData(selectedDate, isInitialLoad);
  }, [selectedDate, fetchData, isInitialLoad]);

  const hasResults =
    data?.results && data.results.some((r) => r.llm_results.some((lr) => lr.response_text || lr.error));

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Brain className="h-7 w-7 text-primary" />
                ARIANEE GEO MONITOR
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Présence d&apos;Arianee dans les réponses IA — Digital Product Passport
              </p>
              {data?.last_scan_date && (
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Dernier scan : {formatDateFR(data.last_scan_date)}
                  {data.last_scan_date !== selectedDate && (
                    <button
                      onClick={() => setSelectedDate(data.last_scan_date!)}
                      className="text-primary hover:underline ml-1"
                    >
                      Voir
                    </button>
                  )}
                </p>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <Card className="border-destructive">
              <CardContent className="p-4">
                <p className="text-sm text-destructive">{error}</p>
              </CardContent>
            </Card>
          )}

          {/* Loading */}
          {isLoading && !data && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-3 text-muted-foreground">
                Chargement des données...
              </span>
            </div>
          )}

          {/* Dashboard content */}
          {data && (
            <>
              {/* Score global */}
              {data.global_score >= 0 && (
                <section>
                  <div className="flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20">
                    <div className="flex items-center justify-center h-16 w-16 rounded-full bg-primary/15 border-2 border-primary/30">
                      <span className="text-2xl font-bold text-primary">{data.global_score}%</span>
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold">Score global de visibilité</h2>
                      <p className="text-sm text-muted-foreground">
                        Moyenne de présence d&apos;Arianee sur les {Object.values(data.scores.today).filter((s) => s >= 0).length} LLMs actifs — {formatDateFR(selectedDate)}
                      </p>
                    </div>
                  </div>
                </section>
              )}

              {/* Score Cards */}
              <section>
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  Scores de présence
                  <Badge variant="outline" className="text-xs font-normal">
                    {formatDateFR(selectedDate)}
                  </Badge>
                </h2>
                <LLMScoreCards scores={data.scores} />
              </section>

              {/* Heatmap */}
              {hasResults && (
                <section>
                  <h2 className="text-lg font-semibold mb-3">
                    Détail par requête
                  </h2>
                  <Card>
                    <CardContent className="p-0 sm:p-4">
                      <LLMHeatmap results={data.results} />
                    </CardContent>
                  </Card>
                </section>
              )}

              {/* Trend Chart */}
              <section>
                <LLMTrendChart history={data.history} />
              </section>

              {/* Recommendations */}
              {data.recommendations && (
                <section>
                  <LLMRecommendations
                    recommendations={data.recommendations.recommendations}
                    generatedAt={data.recommendations.generated_at}
                    globalScore={data.global_score}
                  />
                </section>
              )}

              {/* Empty state */}
              {!hasResults && (
                <Card>
                  <CardContent className="py-16 text-center">
                    <Brain className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">
                      Aucune donnée pour le {formatDateFR(selectedDate)}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Aucun scan n&apos;a encore été effectué pour cette date.
                    </p>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
