"use client";

import { useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Check, X } from "lucide-react";
import { LLM_DISPLAY, LLM_NAMES, BLOC_DISPLAY } from "@/lib/llm-queries";
import type { LLMQueryResult, LLMResultItem, LLMBloc, LLMName } from "@/lib/llm-queries";

interface LLMHeatmapProps {
  results: LLMQueryResult[];
}

// Mots-clés à surligner dans les réponses
const HIGHLIGHT_KEYWORDS = [
  "Arianee",
];

type SentimentValue = "tres_positif" | "positif" | "neutre" | "negatif" | "tres_negatif";

// Config sentiment 5 niveaux
const SENTIMENT_CONFIG: Record<SentimentValue, { label: string; bg: string; dot: string; textColor: string }> = {
  tres_positif: { label: "Très positif", bg: "bg-green-600", dot: "bg-green-600", textColor: "text-green-600" },
  positif:      { label: "Positif",      bg: "bg-green-400", dot: "bg-green-400", textColor: "text-green-500" },
  neutre:       { label: "Neutre",       bg: "bg-blue-400",  dot: "bg-blue-400",  textColor: "text-blue-500" },
  negatif:      { label: "Négatif",      bg: "bg-orange-400", dot: "bg-orange-400", textColor: "text-orange-500" },
  tres_negatif: { label: "Très négatif", bg: "bg-red-500",   dot: "bg-red-500",   textColor: "text-red-500" },
};

// Trouver un extrait pertinent autour d'un mot-clé
function findRelevantExcerpt(text: string, maxLength: number = 200): string {
  const lowerText = text.toLowerCase();
  for (const keyword of HIGHLIGHT_KEYWORDS) {
    const idx = lowerText.indexOf(keyword.toLowerCase());
    if (idx !== -1) {
      const start = Math.max(0, idx - 60);
      const end = Math.min(text.length, idx + keyword.length + 100);
      let excerpt = text.substring(start, end);
      if (start > 0) excerpt = "..." + excerpt;
      if (end < text.length) excerpt = excerpt + "...";
      return excerpt;
    }
  }
  return text.substring(0, maxLength) + (text.length > maxLength ? "..." : "");
}

// Surligner les mots-clés dans du texte
function HighlightedText({ text }: { text: string }) {
  if (!text) return null;

  // Build regex from keywords
  const escaped = HIGHLIGHT_KEYWORDS.map((k) =>
    k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  );
  const regex = new RegExp(`(${escaped.join("|")})`, "gi");

  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) => {
        const isHighlight = HIGHLIGHT_KEYWORDS.some(
          (k) => k.toLowerCase() === part.toLowerCase()
        );
        if (isHighlight) {
          return (
            <mark
              key={i}
              className="bg-yellow-300/80 dark:bg-yellow-500/40 text-foreground px-0.5 rounded font-semibold"
            >
              {part}
            </mark>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

// Applique le highlight sur les children React (strings) récursivement
function highlightChildren(children: ReactNode): ReactNode {
  if (typeof children === "string") {
    return <HighlightedText text={children} />;
  }
  if (Array.isArray(children)) {
    return children.map((child, i) => (
      <span key={i}>{highlightChildren(child)}</span>
    ));
  }
  return children;
}

// Rendu Markdown avec surlignage des mots-clés
function MarkdownWithHighlights({ text }: { text: string }) {
  if (!text) return null;

  return (
    <ReactMarkdown
      components={{
        h1: ({ children }) => (
          <h1 className="text-lg font-bold mt-4 mb-2 first:mt-0">{highlightChildren(children)}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-base font-bold mt-4 mb-2 first:mt-0">{highlightChildren(children)}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-sm font-bold mt-3 mb-1">{highlightChildren(children)}</h3>
        ),
        h4: ({ children }) => (
          <h4 className="text-sm font-semibold mt-2 mb-1">{highlightChildren(children)}</h4>
        ),
        p: ({ children }) => (
          <p className="mb-2 last:mb-0">{highlightChildren(children)}</p>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold">{highlightChildren(children)}</strong>
        ),
        em: ({ children }) => (
          <em className="italic">{highlightChildren(children)}</em>
        ),
        ul: ({ children }) => (
          <ul className="list-disc pl-5 mb-2 space-y-1">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal pl-5 mb-2 space-y-1">{children}</ol>
        ),
        li: ({ children }) => (
          <li>{highlightChildren(children)}</li>
        ),
        hr: () => (
          <hr className="my-3 border-border/50" />
        ),
        a: ({ href, children }) => (
          <a href={href} className="text-primary underline" target="_blank" rel="noopener noreferrer">
            {highlightChildren(children)}
          </a>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

export function LLMHeatmap({ results }: LLMHeatmapProps) {
  const [selectedResult, setSelectedResult] = useState<{
    query: LLMQueryResult;
    llmResult: LLMResultItem;
    llmName: LLMName;
  } | null>(null);

  // Grouper par bloc
  const blocs = results.reduce<Record<string, LLMQueryResult[]>>((acc, r) => {
    if (!acc[r.bloc]) acc[r.bloc] = [];
    acc[r.bloc].push(r);
    return acc;
  }, {});

  const blocOrder: LLMBloc[] = [
    "regulation",
    "compliance",
    "technology",
    "providers",
    "industry",
    "sustainability",
  ];

  return (
    <>
      <ScrollArea className="w-full">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[250px] sticky left-0 bg-background z-10">
                Requête
              </TableHead>
              {LLM_NAMES.map((llm) => (
                <TableHead key={llm} className="text-center min-w-[80px]">
                  <span style={{ color: LLM_DISPLAY[llm].color }}>
                    {LLM_DISPLAY[llm].icon} {LLM_DISPLAY[llm].label}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {blocOrder.map((blocKey) => {
              const blocResults = blocs[blocKey];
              if (!blocResults || blocResults.length === 0) return null;
              const blocDisplay = BLOC_DISPLAY[blocKey];

              return (
                <>{/* Fragment for bloc */}
                  {/* Ligne de séparation bloc */}
                  <TableRow key={`bloc-${blocKey}`} className="hover:bg-transparent">
                    <TableCell
                      colSpan={LLM_NAMES.length + 1}
                      className="py-2 px-3 font-semibold text-xs uppercase tracking-wider"
                      style={{ color: blocDisplay.color }}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: blocDisplay.color }}
                        />
                        {blocDisplay.label}
                      </div>
                    </TableCell>
                  </TableRow>

                  {/* Lignes requêtes */}
                  {blocResults.map((query) => (
                    <TableRow key={query.query_id}>
                      <TableCell className="text-sm py-2 sticky left-0 bg-background z-10 max-w-[300px]">
                        <span className="line-clamp-2">{query.query_text}</span>
                      </TableCell>
                      {LLM_NAMES.map((llmName) => {
                        const result = query.llm_results.find(
                          (r) => r.llm_name === llmName
                        );
                        const isMentioned = result?.is_mentioned ?? false;
                        const sentiment = result?.sentiment as SentimentValue | null;
                        const hasError = !!result?.error && !result?.response_text;

                        const tooltipText = hasError
                          ? `Erreur: ${result?.error?.substring(0, 100)}`
                          : result?.response_text
                          ? findRelevantExcerpt(result.response_text)
                          : "Pas de données";

                        return (
                          <TableCell key={llmName} className="text-center py-2">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  className="inline-flex flex-col items-center justify-center gap-0.5 w-10 h-10 rounded-md cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all bg-muted/30"
                                  onClick={() => {
                                    if (result) {
                                      setSelectedResult({
                                        query,
                                        llmResult: result,
                                        llmName,
                                      });
                                    }
                                  }}
                                >
                                  {/* Indicateur 1 : Présence */}
                                  {hasError ? (
                                    <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
                                  ) : isMentioned ? (
                                    <Check className="h-3.5 w-3.5 text-green-500" />
                                  ) : (
                                    <X className="h-3.5 w-3.5 text-red-500" />
                                  )}

                                  {/* Indicateur 2 : Pastille sentiment */}
                                  {hasError ? (
                                    <div className="w-2.5 h-2.5 rounded-full bg-muted" />
                                  ) : sentiment && SENTIMENT_CONFIG[sentiment] ? (
                                    <div className={`w-2.5 h-2.5 rounded-full ${SENTIMENT_CONFIG[sentiment].dot}`} />
                                  ) : (
                                    <div className="w-2.5 h-2.5 rounded-full bg-muted/50" />
                                  )}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent
                                side="top"
                                className="max-w-[350px] text-xs"
                              >
                                <p className="font-semibold mb-1">
                                  {LLM_DISPLAY[llmName].label}
                                  {result?.mention_rank
                                    ? ` (rang #${result.mention_rank})`
                                    : ""}
                                </p>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={isMentioned ? "text-green-500" : "text-red-500"}>
                                    {hasError ? "Erreur" : isMentioned ? "✓ Mentionné" : "✗ Absent"}
                                  </span>
                                  {sentiment && SENTIMENT_CONFIG[sentiment] && (
                                    <span className={SENTIMENT_CONFIG[sentiment].textColor}>
                                      · {SENTIMENT_CONFIG[sentiment].label}
                                    </span>
                                  )}
                                </div>
                                <p className="text-muted-foreground whitespace-pre-line">
                                  {tooltipText}
                                </p>
                                <p className="text-muted-foreground/60 mt-1 italic">
                                  Cliquer pour voir la réponse complète
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </>
              );
            })}
          </TableBody>
        </Table>
      </ScrollArea>

      {/* Légende 2 axes */}
      <div className="flex flex-col gap-3 mt-4 text-xs text-muted-foreground">
        {/* Axe 1 : Présence */}
        <div className="flex flex-wrap items-center gap-4">
          <span className="font-semibold text-foreground/70">Présence :</span>
          <span className="flex items-center gap-1">
            <Check className="h-3 w-3 text-green-500" />
            Mentionné
          </span>
          <span className="flex items-center gap-1">
            <X className="h-3 w-3 text-red-500" />
            Absent
          </span>
          <span className="flex items-center gap-1">
            <AlertCircle className="h-3 w-3 text-muted-foreground" />
            Erreur
          </span>
        </div>
        {/* Axe 2 : Sentiment */}
        <div className="flex flex-wrap items-center gap-4">
          <span className="font-semibold text-foreground/70">Sentiment :</span>
          {(Object.entries(SENTIMENT_CONFIG) as [SentimentValue, typeof SENTIMENT_CONFIG[SentimentValue]][]).map(([key, config]) => (
            <span key={key} className="flex items-center gap-1">
              <span className={`w-2.5 h-2.5 rounded-full inline-block ${config.dot}`} />
              {config.label}
            </span>
          ))}
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full inline-block bg-muted/50" />
            N/A
          </span>
        </div>
      </div>

      {/* Dialog réponse complète */}
      <Dialog
        open={!!selectedResult}
        onOpenChange={(open) => {
          if (!open) setSelectedResult(null);
        }}
      >
        {selectedResult && (
          <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle className="flex items-center gap-2 flex-wrap">
                <span style={{ color: LLM_DISPLAY[selectedResult.llmName].color }}>
                  {LLM_DISPLAY[selectedResult.llmName].icon}{" "}
                  {LLM_DISPLAY[selectedResult.llmName].label}
                </span>
                {selectedResult.llmResult.is_mentioned ? (
                  <Badge variant="default" className="bg-green-600 text-xs">
                    ✓ Mentionné
                    {selectedResult.llmResult.mention_rank
                      ? ` (rang #${selectedResult.llmResult.mention_rank})`
                      : ""}
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="text-xs">
                    ✗ Absent
                  </Badge>
                )}
                {selectedResult.llmResult.sentiment &&
                  SENTIMENT_CONFIG[selectedResult.llmResult.sentiment as SentimentValue] && (
                  <Badge
                    variant="outline"
                    className={`text-xs ${SENTIMENT_CONFIG[selectedResult.llmResult.sentiment as SentimentValue].textColor} border-current`}
                  >
                    {SENTIMENT_CONFIG[selectedResult.llmResult.sentiment as SentimentValue].label}
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription className="text-sm">
                {selectedResult.query.query_text}
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 min-h-0 overflow-y-auto mt-4 pr-2">
              {selectedResult.llmResult.error &&
                !selectedResult.llmResult.response_text ? (
                <div className="p-4 bg-destructive/10 rounded-lg">
                  <p className="text-sm text-destructive font-medium">Erreur</p>
                  <p className="text-sm text-destructive/80 mt-1">
                    {selectedResult.llmResult.error}
                  </p>
                </div>
              ) : selectedResult.llmResult.response_text ? (
                <div className="text-sm leading-relaxed">
                  <MarkdownWithHighlights
                    text={selectedResult.llmResult.response_text}
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Pas de données disponibles
                </p>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
