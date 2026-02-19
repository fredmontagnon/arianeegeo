// Clients LLM + analyseur Claude pour le monitoring — ArianeeGEO
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Mistral } from "@mistralai/mistralai";
import Anthropic from "@anthropic-ai/sdk";
import { LLMName } from "./llm-queries";

// ==================== TYPES ====================

export interface LLMResponse {
  llmName: LLMName;
  response: string | null;
  error: string | null;
  durationMs: number;
}

export type SentimentValue = "tres_positif" | "positif" | "neutre" | "negatif" | "tres_negatif";

export interface LLMAnalysis {
  llmName: string;
  is_mentioned: boolean;
  mention_rank: number | null;
  sentiment: SentimentValue | null;
}

// ==================== CONSTANTS ====================

// Pas de system prompt : on veut des réponses neutres, comme un utilisateur lambda

// Timeout par appel LLM (45s pour web search, les réponses arrivent normalement en 5-20s)
const LLM_TIMEOUT_MS = 45_000;

// ==================== TIMEOUT HELPER ====================

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout ${label} après ${ms / 1000}s`)), ms);
    promise
      .then((v) => { clearTimeout(timer); resolve(v); })
      .catch((e) => { clearTimeout(timer); reject(e); });
  });
}

// ==================== RETRY HELPER ====================

function isRetryableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("rate") || msg.includes("503") || msg.includes("quota") || msg.includes("Too Many Requests");
}

async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries = 2
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (isRetryableError(err) && attempt < maxRetries) {
        const delay = 2000 * Math.pow(2, attempt); // 2s, 4s
        console.log(`[LLM-MONITOR] ⏳ ${label} erreur retryable, tentative ${attempt + 1}/${maxRetries}, attente ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error(`${label}: max retries exceeded`);
}

// ==================== LLM CLIENTS ====================

async function queryChatGPT(query: string): Promise<LLMResponse> {
  const start = Date.now();
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return { llmName: "chatgpt", response: null, error: "OPENAI_API_KEY non configurée", durationMs: 0 };

    const client = new OpenAI({ apiKey, timeout: LLM_TIMEOUT_MS });
    const completion = await withRetry(async () => {
      return await withTimeout(
        client.chat.completions.create({
          model: "gpt-4o-search-preview",
          messages: [
            { role: "user", content: query },
          ],
          max_tokens: 800,
          web_search_options: {},
        }),
        LLM_TIMEOUT_MS,
        "ChatGPT"
      );
    }, "ChatGPT");

    return {
      llmName: "chatgpt",
      response: completion.choices[0]?.message?.content || null,
      error: null,
      durationMs: Date.now() - start,
    };
  } catch (err: unknown) {
    return {
      llmName: "chatgpt",
      response: null,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}

async function queryGemini(query: string): Promise<LLMResponse> {
  const start = Date.now();
  try {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) return { llmName: "gemini", response: null, error: "GOOGLE_AI_API_KEY non configurée", durationMs: 0 };

    const text = await withRetry(async () => {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tools: [{ googleSearch: {} } as any],
      });
      const result = await withTimeout(
        model.generateContent(query),
        LLM_TIMEOUT_MS,
        "Gemini"
      );
      return result.response.text();
    }, "Gemini");

    return {
      llmName: "gemini",
      response: text || null,
      error: null,
      durationMs: Date.now() - start,
    };
  } catch (err: unknown) {
    return {
      llmName: "gemini",
      response: null,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}

async function queryMistral(query: string): Promise<LLMResponse> {
  const start = Date.now();
  try {
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) return { llmName: "mistral", response: null, error: "MISTRAL_API_KEY non configurée", durationMs: 0 };

    const client = new Mistral({ apiKey });

    // Essayer d'abord avec web search (beta.conversations)
    let responseText: string | null = null;
    let usedFallback = false;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result: any = await withRetry(async () => {
        return await withTimeout(
          client.beta.conversations.start({
            inputs: query,
            model: "mistral-small-latest",
            tools: [{ type: "web_search" }],
            store: false,
          }),
          LLM_TIMEOUT_MS,
          "Mistral"
        );
      }, "Mistral", 3); // 3 retries pour les 429

      // Extraire le texte de la réponse (MessageOutputEntry avec role=assistant)
      const messageOutput = result.outputs?.find(
        (o: { role?: string }) => o.role === "assistant"
      );
      if (messageOutput) {
        if (typeof messageOutput.content === "string") {
          responseText = messageOutput.content;
        } else if (Array.isArray(messageOutput.content)) {
          responseText = messageOutput.content
            .filter((c: { type?: string }) => c.type === "text")
            .map((c: { text?: string }) => c.text || "")
            .join("");
        }
      }
    } catch (webSearchErr: unknown) {
      // Fallback: si 429 rate limit, utiliser chat.complete sans web search
      if (isRetryableError(webSearchErr)) {
        console.log(`[LLM-MONITOR] ⚠️ Mistral web_search 429, fallback sur chat.complete`);
        usedFallback = true;

        const fallbackResult = await withTimeout(
          client.chat.complete({
            model: "mistral-small-latest",
            messages: [{ role: "user", content: query }],
            maxTokens: 800,
          }),
          LLM_TIMEOUT_MS,
          "Mistral-fallback"
        );

        responseText = fallbackResult.choices?.[0]?.message?.content?.toString() || null;
      } else {
        throw webSearchErr;
      }
    }

    return {
      llmName: "mistral",
      response: responseText,
      error: usedFallback ? "fallback: sans web search (429)" : null,
      durationMs: Date.now() - start,
    };
  } catch (err: unknown) {
    return {
      llmName: "mistral",
      response: null,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}

async function queryGrok(query: string): Promise<LLMResponse> {
  const start = Date.now();
  try {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { llmName: "grok", response: null, error: "XAI_API_KEY non configurée", durationMs: 0 };

    const client = new OpenAI({
      apiKey,
      baseURL: "https://api.x.ai/v1",
      timeout: LLM_TIMEOUT_MS,
    });
    const response = await withRetry(async () => {
      return await withTimeout(
        client.responses.create({
          model: "grok-4-1-fast-non-reasoning",
          input: query,
          tools: [{ type: "web_search" as const }],
        }),
        LLM_TIMEOUT_MS,
        "Grok"
      );
    }, "Grok");

    return {
      llmName: "grok",
      response: response.output_text || null,
      error: null,
      durationMs: Date.now() - start,
    };
  } catch (err: unknown) {
    return {
      llmName: "grok",
      response: null,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}

async function queryClaude(query: string): Promise<LLMResponse> {
  const start = Date.now();
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return { llmName: "claude", response: null, error: "ANTHROPIC_API_KEY non configurée", durationMs: 0 };

    const client = new Anthropic({ apiKey });
    const message = await withRetry(async () => {
      return await withTimeout(
        client.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1024,
          messages: [
            { role: "user", content: query },
          ],
          tools: [
            {
              type: "web_search_20250305",
              name: "web_search",
              max_uses: 2,
            },
          ],
        }),
        LLM_TIMEOUT_MS,
        "Claude"
      );
    }, "Claude");

    // Avec web search, la réponse contient plusieurs blocks (tool_use, tool_result, text)
    // On collecte tous les blocks de type "text"
    const textParts = message.content
      .filter((block: { type: string }) => block.type === "text")
      .map((block: { type: string; text?: string }) => (block as { type: "text"; text: string }).text);
    const text = textParts.join("\n") || null;

    return {
      llmName: "claude",
      response: text,
      error: null,
      durationMs: Date.now() - start,
    };
  } catch (err: unknown) {
    return {
      llmName: "claude",
      response: null,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}

async function queryPerplexity(query: string): Promise<LLMResponse> {
  const start = Date.now();
  try {
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) return { llmName: "perplexity", response: null, error: "PERPLEXITY_API_KEY non configurée", durationMs: 0 };

    // Utiliser fetch direct au lieu du SDK OpenAI pour éviter le blocage Cloudflare
    const responseText = await withRetry(async () => {
      return await withTimeout(
        (async () => {
          const res = await fetch("https://api.perplexity.ai/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              "Accept": "application/json",
              "User-Agent": "ArianeeGEO-LLM-Monitor/1.0",
            },
            body: JSON.stringify({
              model: "sonar",
              messages: [{ role: "user", content: query }],
              max_tokens: 800,
              temperature: 0.3,
            }),
          });
          if (!res.ok) {
            const text = await res.text();
            throw new Error(`${res.status} ${text.substring(0, 200)}`);
          }
          const json = await res.json();
          return json.choices?.[0]?.message?.content || null;
        })(),
        LLM_TIMEOUT_MS,
        "Perplexity"
      );
    }, "Perplexity");

    return {
      llmName: "perplexity",
      response: responseText,
      error: null,
      durationMs: Date.now() - start,
    };
  } catch (err: unknown) {
    return {
      llmName: "perplexity",
      response: null,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}

// ==================== QUERY ALL LLMs IN PARALLEL ====================

export async function queryAllLLMs(query: string): Promise<LLMResponse[]> {
  const results = await Promise.allSettled([
    queryChatGPT(query),
    queryGemini(query),
    queryMistral(query),
    queryGrok(query),
    queryClaude(query),
    queryPerplexity(query),
  ]);

  return results.map((result, idx) => {
    const names: LLMName[] = ["chatgpt", "gemini", "mistral", "grok", "claude", "perplexity"];
    if (result.status === "fulfilled") {
      return result.value;
    }
    return {
      llmName: names[idx],
      response: null,
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      durationMs: 0,
    };
  });
}

// ==================== CLAUDE ANALYSIS ====================

export async function analyzeResponses(
  query: string,
  responses: { llmName: string; text: string }[]
): Promise<LLMAnalysis[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return responses.map((r) => ({
      llmName: r.llmName,
      is_mentioned: false,
      mention_rank: null,
      sentiment: null,
    }));
  }

  const client = new Anthropic({ apiKey });

  // Tronquer chaque réponse à 3000 chars pour rester dans les limites
  const responsesText = responses
    .map((r) => `--- ${r.llmName.toUpperCase()} ---\n${r.text.substring(0, 3000)}`)
    .join("\n\n");

  const llmNames = responses.map((r) => r.llmName);

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `Analyse ces réponses de LLMs à la question : "${query}"

${responsesText}

Pour CHAQUE LLM (${llmNames.join(", ")}), détermine :

1. **is_mentioned** (true/false) : Est-ce que le mot "Arianee" apparaît TEXTUELLEMENT dans la réponse ?
   IMPORTANT : Si le mot "Arianee" apparaît dans le texte, c'est TOUJOURS true, même si le contexte est approximatif. On cherche la PRÉSENCE TEXTUELLE du mot, pas la pertinence du contexte.

2. **mention_rank** (number|null) : Si Arianee est mentionné, à quel rang est-il cité parmi les solutions/entreprises DPP mentionnées ? (1=premier cité, 2=deuxième, etc.). null si absent.

3. **sentiment** : Le ton associé à Arianee dans cette réponse. Valeurs possibles EXACTEMENT :
   - "tres_positif" : éloge, mise en avant très favorable, leader du marché
   - "positif" : mention favorable, présentation positive
   - "neutre" : mention factuelle, ni positive ni négative
   - "negatif" : mention critique, présentation défavorable
   - "tres_negatif" : critique forte, présentation très défavorable
   - null : si absent de la réponse

Réponds UNIQUEMENT en JSON valide, sans backticks, sans markdown :
[
${llmNames.map((n) => `  { "llmName": "${n}", "is_mentioned": true_or_false, "mention_rank": number_or_null, "sentiment": "value_or_null" }`).join(",\n")}
]`,
      },
    ],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";

  try {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("No JSON array found in response");
      parsed = JSON.parse(jsonMatch[0]);
    }

    // Valider que c'est un array
    if (!Array.isArray(parsed)) throw new Error("Parsed result is not an array");

    // Override de sécurité : forcer is_mentioned=true si "arianee" est textuellement présent
    const analysisResults = parsed as LLMAnalysis[];

    // Log pour debug
    console.log(`[LLM-MONITOR] 🔍 Analyse Claude retournée: ${JSON.stringify(analysisResults.map(a => ({ llm: a.llmName, mentioned: a.is_mentioned })))}`);
    console.log(`[LLM-MONITOR] 🔍 Responses disponibles: ${responses.map(r => r.llmName).join(", ")}`);

    for (const analysis of analysisResults) {
      // Match case-insensitive pour éviter les problèmes de casse
      const originalResponse = responses.find((r) => r.llmName.toLowerCase() === analysis.llmName.toLowerCase());

      if (!originalResponse) {
        console.log(`[LLM-MONITOR] ⚠️ Pas de réponse trouvée pour ${analysis.llmName} (disponibles: ${responses.map(r => r.llmName).join(", ")})`);
        continue;
      }

      const lower = originalResponse.text.toLowerCase();
      const hasArianee = lower.includes("arianee");

      if (hasArianee && !analysis.is_mentioned) {
        console.log(`[LLM-MONITOR] ⚠️ Override: ${analysis.llmName} marqué absent par Claude mais "Arianee" trouvé textuellement → forcé à mentionné`);
        analysis.is_mentioned = true;
        if (!analysis.sentiment) analysis.sentiment = "neutre" as SentimentValue;
      }

      // Normaliser le llmName pour qu'il corresponde à notre convention (lowercase)
      analysis.llmName = originalResponse.llmName;
    }

    return analysisResults;
  } catch (err) {
    console.error("[LLM-MONITOR] ❌ Erreur parsing analyse Claude:", err);
    console.error("[LLM-MONITOR] Réponse brute Claude:", text.substring(0, 500));

    // Fallback : tenter une détection textuelle simple
    return responses.map((r) => {
      const lower = r.text.toLowerCase();
      const mentioned = lower.includes("arianee");
      return {
        llmName: r.llmName,
        is_mentioned: mentioned,
        mention_rank: null,
        sentiment: mentioned ? ("neutre" as SentimentValue) : null,
      };
    });
  }
}

// ==================== CLAUDE RECOMMENDATIONS ====================

export interface LLMRecommendationResult {
  title: string;
  description: string;
  priority: "haute" | "moyenne" | "basse";
  bloc_cible?: string;
  impact_estime?: string;
  action_items: string[];
}

export async function generateRecommendations(
  summaryStats: Record<string, unknown>
): Promise<{ recommendations: LLMRecommendationResult[]; tokens_used: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      recommendations: [
        {
          title: "Clé API manquante",
          description: "Configurez ANTHROPIC_API_KEY pour générer des recommandations.",
          priority: "haute",
          action_items: ["Ajouter ANTHROPIC_API_KEY dans les variables d'environnement"],
        },
      ],
      tokens_used: 0,
    };
  }

  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `Tu es un consultant expert en GEO (Generative Engine Optimization) et en marketing B2B tech.

CONTEXTE :
Arianee est un leader français du Digital Product Passport (DPP) basé sur la blockchain. L'entreprise aide les marques (luxe, mode, horlogerie, électronique) à créer des passeports numériques produits conformes à la régulation européenne ESPR (Ecodesign for Sustainable Products Regulation).
Nous monitorons quotidiennement la visibilité d'Arianee dans les réponses de 6 LLMs majeurs (ChatGPT, Gemini, Mistral, Grok, Claude, Perplexity) sur 20 questions DPP/ESPR thématiques.

RÉSULTATS DU MONITORING :
${JSON.stringify(summaryStats, null, 2)}

MISSION :
Génère un plan d'action de exactement 5 tâches prioritaires pour améliorer le score global de visibilité IA d'Arianee sur les requêtes DPP/ESPR.

RÈGLES :
- Chaque tâche doit être SPÉCIFIQUE et ACTIONNABLE (pas de généralités)
- Priorise les blocs thématiques à 0% (gain marginal maximum)
- Estime l'impact potentiel de chaque action sur le score global
- Le titre doit commencer par un verbe à l'infinitif
- Les action_items sont des étapes concrètes à réaliser
- bloc_cible = le bloc thématique visé (ou "global" si transversal)

Réponds UNIQUEMENT en JSON valide, sans backticks, sans markdown :
[
  {
    "title": "Titre court et actionnable",
    "description": "Explication détaillée du POURQUOI et du COMMENT",
    "priority": "haute",
    "bloc_cible": "providers",
    "impact_estime": "+5% à +10%",
    "action_items": ["étape 1", "étape 2", "étape 3"]
  }
]`,
      },
    ],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";
  const tokensUsed = message.usage?.output_tokens || 0;

  console.log(`[LLM-MONITOR] Réponse Claude recommendations: ${text.length} chars`);
  if (text.length < 50) {
    console.log("[LLM-MONITOR] Réponse courte/vide:", text);
  }

  try {
    let parsed;
    // Nettoyer le texte : enlever les backticks markdown si présents
    let cleanText = text.trim();
    // Supprimer ```json ... ``` ou ``` ... ```
    cleanText = cleanText.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
    cleanText = cleanText.trim();

    try {
      parsed = JSON.parse(cleanText);
    } catch {
      // Extraire le JSON array entre le premier [ et le dernier ]
      const firstBracket = cleanText.indexOf("[");
      const lastBracket = cleanText.lastIndexOf("]");
      if (firstBracket === -1 || lastBracket === -1 || lastBracket <= firstBracket) {
        throw new Error(`No JSON array found (len=${cleanText.length}): ${cleanText.substring(0, 300)}`);
      }
      const jsonStr = cleanText.substring(firstBracket, lastBracket + 1);
      parsed = JSON.parse(jsonStr);
    }
    return { recommendations: parsed, tokens_used: tokensUsed };
  } catch (err) {
    console.error("[LLM-MONITOR] Erreur parsing recommandations:", err);
    console.error("[LLM-MONITOR] Réponse brute Claude (500 premiers chars):", text.substring(0, 500));
    return {
      recommendations: [
        {
          title: "Erreur d'analyse",
          description: `Impossible de générer les recommandations (réponse: ${text.length} chars). Réessayez via l'API /api/llm-monitor/recommendations.`,
          priority: "basse",
          action_items: ["Vérifier les logs Vercel", "Relancer via POST /api/llm-monitor/recommendations"],
        },
      ],
      tokens_used: tokensUsed,
    };
  }
}
