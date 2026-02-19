"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  Loader2,
  Play,
  RefreshCw,
  Brain,
  Calendar,
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
  const [isRunning, setIsRunning] = useState(false);
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

  const [runProgress, setRunProgress] = useState("");

  const handleRun = async () => {
    setIsRunning(true);
    setError(null);
    setRunProgress("");

    try {
      // Lancer 4 batches séquentiellement
      const totalBatches = 4;
      let totalProcessed = 0;
      let totalMentions = 0;

      for (let batch = 1; batch <= totalBatches; batch++) {
        setRunProgress(`Batch ${batch}/${totalBatches} en cours...`);

        const res = await fetch("/api/llm-monitor/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: selectedDate, batch }),
        });

        if (!res.ok) {
          throw new Error(`Erreur batch ${batch}: ${res.status}`);
        }

        const json = await res.json();
        if (!json.success) {
          throw new Error(json.error || `Erreur batch ${batch}`);
        }

        totalProcessed += json.queries_processed || 0;
        totalMentions += json.total_mentions || 0;

        setRunProgress(`Batch ${batch}/${totalBatches} terminé (${totalProcessed} requêtes traitées)`);
      }

      setRunProgress(`Scan terminé ! ${totalProcessed} requêtes, ${totalMentions} mentions`);

      // Recharger les données
      await fetchData(selectedDate);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors du scan");
    } finally {
      setIsRunning(false);
    }
  };

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

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-40 h-9"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchData(selectedDate)}
                disabled={isLoading}
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button
                onClick={handleRun}
                disabled={isRunning}
                size="sm"
              >
                {isRunning ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-1" />
                )}
                {isRunning ? "Scan en cours..." : "Lancer un scan"}
              </Button>
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

          {/* Running overlay */}
          {isRunning && (
            <Card className="border-primary/50 bg-primary/5">
              <CardContent className="p-6 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
                <p className="text-sm font-medium">
                  Scan en cours... Interrogation de 6 LLMs sur 20 requêtes (4 batches)
                </p>
                {runProgress && (
                  <p className="text-sm text-primary mt-2 font-medium">
                    {runProgress}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Cela peut prendre 3 à 5 minutes
                </p>
              </CardContent>
            </Card>
          )}

          {/* Dashboard content */}
          {data && !isRunning && (
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
                    <p className="text-sm text-muted-foreground mb-4">
                      Lancez un scan pour interroger les LLMs et analyser les réponses.
                    </p>
                    <Button onClick={handleRun} disabled={isRunning}>
                      <Play className="h-4 w-4 mr-2" />
                      Lancer le premier scan
                    </Button>
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
