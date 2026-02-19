// Types et constantes pour le monitoring LLM — ArianeeGEO

export type LLMBloc = 'regulation' | 'compliance' | 'technology' | 'providers' | 'industry' | 'sustainability';
export type LLMName = 'chatgpt' | 'gemini' | 'mistral' | 'grok' | 'claude' | 'perplexity';

export const LLM_NAMES: LLMName[] = ['chatgpt', 'gemini', 'mistral', 'grok', 'claude', 'perplexity'];

export const LLM_DISPLAY: Record<LLMName, { label: string; color: string; icon: string }> = {
  chatgpt:    { label: 'ChatGPT',    color: '#10a37f', icon: '🟢' },
  gemini:     { label: 'Gemini',     color: '#4285f4', icon: '🔵' },
  mistral:    { label: 'Mistral',    color: '#ff7000', icon: '🟠' },
  grok:       { label: 'Grok',       color: '#1DA1F2', icon: '🐦' },
  claude:     { label: 'Claude',     color: '#d97706', icon: '🟤' },
  perplexity: { label: 'Perplexity', color: '#20808D', icon: '🔍' },
};

export const BLOC_DISPLAY: Record<LLMBloc, { label: string; color: string }> = {
  regulation:     { label: 'Régulation ESPR',          color: '#3b82f6' },
  compliance:     { label: 'Conformité',               color: '#ef4444' },
  technology:     { label: 'Technologie DPP',          color: '#8b5cf6' },
  providers:      { label: 'Fournisseurs DPP',         color: '#f59e0b' },
  industry:       { label: 'Cas d\'usage sectoriels',  color: '#10b981' },
  sustainability: { label: 'Durabilité & Circularité', color: '#06b6d4' },
};

// Types pour les résultats
export interface LLMQueryResult {
  query_id: string;
  query_text: string;
  bloc: LLMBloc;
  bloc_label: string;
  sort_order: number;
  llm_results: LLMResultItem[];
}

export interface LLMResultItem {
  llm_name: LLMName;
  is_mentioned: boolean;
  mention_rank: number | null;
  sentiment: 'tres_positif' | 'positif' | 'neutre' | 'negatif' | 'tres_negatif' | null;
  response_text: string | null;
  error: string | null;
}

export interface LLMScores {
  today: Record<LLMName, number>;
  yesterday: Record<LLMName, number>;
}

export interface LLMHistoryPoint {
  date: string;
  chatgpt: number;
  gemini: number;
  mistral: number;
  grok: number;
  claude: number;
  perplexity: number;
}

export interface LLMRecommendation {
  title: string;
  description: string;
  priority: 'haute' | 'moyenne' | 'basse';
  bloc_cible?: string;
  impact_estime?: string;
  action_items: string[];
}

export interface LLMDashboardData {
  date: string;
  results: LLMQueryResult[];
  recommendations: {
    recommendations: LLMRecommendation[];
    summary_stats: Record<string, unknown>;
    generated_at: string;
  } | null;
  scores: LLMScores;
  global_score: number;  // -1 = pas de données, sinon 0-100
  history: LLMHistoryPoint[];
  last_scan_date: string | null;
}
