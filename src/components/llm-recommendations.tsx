"use client";

import { Sparkles, AlertTriangle, Info, CheckCircle, Target, TrendingUp, Square } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { LLMRecommendation } from "@/lib/llm-queries";
import { BLOC_DISPLAY } from "@/lib/llm-queries";

interface LLMRecommendationsProps {
  recommendations: LLMRecommendation[];
  generatedAt: string | null;
  globalScore?: number;
}

const priorityConfig = {
  haute: {
    label: "Urgent",
    icon: AlertTriangle,
    badgeClassName: "border-red-500 text-red-600 dark:text-red-400 bg-red-500/10",
    accentColor: "border-l-red-500",
  },
  moyenne: {
    label: "Important",
    icon: Info,
    badgeClassName: "border-amber-500 text-amber-600 dark:text-amber-400 bg-amber-500/10",
    accentColor: "border-l-amber-500",
  },
  basse: {
    label: "Quick win",
    icon: CheckCircle,
    badgeClassName: "border-green-500 text-green-600 dark:text-green-400 bg-green-500/10",
    accentColor: "border-l-green-500",
  },
};

export function LLMRecommendations({
  recommendations,
  generatedAt,
  globalScore,
}: LLMRecommendationsProps) {
  if (!recommendations || recommendations.length === 0) {
    return (
      <div className="bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950/30 dark:to-orange-950/30 border border-red-200/50 dark:border-red-800/50 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-5 w-5 text-red-500" />
          <span className="font-semibold text-sm text-red-900 dark:text-red-100">
            Plan d&apos;action IA
          </span>
        </div>
        <p className="text-sm text-red-900/60 dark:text-red-100/60 text-center py-4">
          Aucune recommandation pour le moment. Lancez un scan pour en générer.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950/30 dark:to-orange-950/30 border border-red-200/50 dark:border-red-800/50 rounded-xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-red-500" />
          <span className="font-semibold text-sm text-red-900 dark:text-red-100">
            Plan d&apos;action IA
          </span>
          {globalScore !== undefined && globalScore >= 0 && (
            <Badge variant="outline" className="text-xs border-red-300 text-red-700 dark:text-red-300">
              Score actuel : {globalScore}%
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          {generatedAt && (
            <span className="text-xs text-red-500/70">
              Généré le{" "}
              {new Date(generatedAt).toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "long",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>
      </div>

      {/* Todo List */}
      <div className="space-y-3">
        {recommendations.map((reco, idx) => {
          const config = priorityConfig[reco.priority] || priorityConfig.basse;
          const PriorityIcon = config.icon;

          // Trouver la couleur du bloc cible
          const blocKey = reco.bloc_cible as keyof typeof BLOC_DISPLAY | undefined;
          const blocDisplay = blocKey && BLOC_DISPLAY[blocKey];

          return (
            <div
              key={idx}
              className={`bg-white/80 dark:bg-white/5 rounded-lg border border-border/50 border-l-4 ${config.accentColor} p-4`}
            >
              {/* Ligne titre */}
              <div className="flex items-start gap-3">
                <div className="flex items-center gap-2 text-muted-foreground mt-0.5 shrink-0">
                  <span className="text-xs font-mono font-bold text-foreground/40 w-5 text-center">
                    {idx + 1}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 flex-wrap mb-1">
                    <span className="text-sm font-semibold text-foreground leading-tight">
                      {reco.title}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {reco.impact_estime && (
                        <Badge variant="outline" className="text-xs border-emerald-400 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10">
                          <TrendingUp className="h-3 w-3 mr-1" />
                          {reco.impact_estime}
                        </Badge>
                      )}
                      {blocDisplay && (
                        <Badge variant="outline" className="text-xs" style={{ borderColor: blocDisplay.color, color: blocDisplay.color }}>
                          {blocDisplay.label}
                        </Badge>
                      )}
                      <Badge
                        variant="outline"
                        className={`text-xs ${config.badgeClassName}`}
                      >
                        <PriorityIcon className="h-3 w-3 mr-1" />
                        {config.label}
                      </Badge>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-sm text-foreground/70 mb-2 leading-relaxed">
                    {reco.description}
                  </p>

                  {/* Action items comme sous-checklist */}
                  {reco.action_items && reco.action_items.length > 0 && (
                    <div className="space-y-1.5 pl-0.5">
                      {reco.action_items.map((item, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-2 text-xs text-foreground/60"
                        >
                          <Square className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground/40" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
