"use client";

import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { LLM_DISPLAY, LLM_NAMES } from "@/lib/llm-queries";
import type { LLMScores } from "@/lib/llm-queries";

interface LLMScoreCardsProps {
  scores: LLMScores;
}

export function LLMScoreCards({ scores }: LLMScoreCardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {LLM_NAMES.map((llm) => {
        const todayScore = scores.today[llm] ?? 0;
        const yesterdayScore = scores.yesterday[llm] ?? 0;
        const isNoData = todayScore === -1;
        const diff = isNoData ? 0 : todayScore - (yesterdayScore === -1 ? 0 : yesterdayScore);
        const display = LLM_DISPLAY[llm];

        return (
          <Card
            key={llm}
            className={`relative overflow-hidden ${isNoData ? "opacity-60" : ""}`}
            style={{ borderLeftColor: display.color, borderLeftWidth: 4 }}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-muted-foreground">
                  {display.label}
                </span>
                <span className="text-lg">{display.icon}</span>
              </div>
              <div className="flex items-end gap-2">
                {isNoData ? (
                  <span className="text-3xl font-bold text-muted-foreground">
                    N/A
                  </span>
                ) : (
                  <>
                    <span
                      className="text-3xl font-bold"
                      style={{ color: display.color }}
                    >
                      {todayScore}%
                    </span>
                    {diff !== 0 && yesterdayScore > 0 ? (
                      <span
                        className={`flex items-center text-sm font-medium ${
                          diff > 0 ? "text-green-500" : "text-red-500"
                        }`}
                      >
                        {diff > 0 ? (
                          <TrendingUp className="h-4 w-4 mr-0.5" />
                        ) : (
                          <TrendingDown className="h-4 w-4 mr-0.5" />
                        )}
                        {diff > 0 ? "+" : ""}
                        {diff}
                      </span>
                    ) : yesterdayScore > 0 ? (
                      <span className="flex items-center text-sm text-muted-foreground">
                        <Minus className="h-4 w-4 mr-0.5" />
                        stable
                      </span>
                    ) : null}
                  </>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {isNoData ? "Aucune donnée" : "Taux de mention"}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
