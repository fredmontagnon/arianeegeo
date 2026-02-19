-- ArianeeGEO — LLM Monitoring Tables
-- Monitoring de la présence d'Arianee dans les réponses IA sur le DPP/ESPR

-- 1. Table des requêtes LLM
CREATE TABLE IF NOT EXISTS llm_queries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  query_text TEXT NOT NULL,
  bloc TEXT NOT NULL CHECK (bloc IN ('regulation', 'compliance', 'technology', 'providers', 'industry', 'sustainability')),
  bloc_label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Table des résultats LLM
CREATE TABLE IF NOT EXISTS llm_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  query_id UUID NOT NULL REFERENCES llm_queries(id) ON DELETE CASCADE,
  llm_name TEXT NOT NULL CHECK (llm_name IN ('chatgpt', 'gemini', 'mistral', 'grok', 'claude', 'perplexity')),
  run_date DATE NOT NULL,
  response_text TEXT,
  is_mentioned BOOLEAN DEFAULT false,
  mention_rank INTEGER,
  sentiment TEXT CHECK (sentiment IN ('tres_positif', 'positif', 'neutre', 'negatif', 'tres_negatif')),
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(query_id, llm_name, run_date)
);

-- 3. Table des recommandations quotidiennes
CREATE TABLE IF NOT EXISTS llm_daily_recommendations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  run_date DATE NOT NULL UNIQUE,
  recommendations JSONB,
  summary_stats JSONB,
  model_used TEXT,
  tokens_used INTEGER DEFAULT 0,
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour les performances
CREATE INDEX IF NOT EXISTS idx_llm_results_run_date ON llm_results(run_date);
CREATE INDEX IF NOT EXISTS idx_llm_results_query_id ON llm_results(query_id);
CREATE INDEX IF NOT EXISTS idx_llm_queries_active ON llm_queries(is_active, sort_order);

-- =============================================
-- Insertion des 20 requêtes DPP/ESPR
-- =============================================

-- Bloc: Régulation ESPR (4 requêtes)
INSERT INTO llm_queries (query_text, bloc, bloc_label, sort_order) VALUES
('What is the EU Digital Product Passport and which companies need to comply?',
 'regulation', 'Régulation ESPR', 1),
('When does ESPR Digital Product Passport regulation come into effect and what are the deadlines by sector?',
 'regulation', 'Régulation ESPR', 2),
('What data must be included in an EU Digital Product Passport under ESPR?',
 'regulation', 'Régulation ESPR', 3),
('What happens if a company doesn''t comply with ESPR Digital Product Passport requirements?',
 'regulation', 'Régulation ESPR', 4);

-- Bloc: Conformité (3 requêtes)
INSERT INTO llm_queries (query_text, bloc, bloc_label, sort_order) VALUES
('Does my fashion brand need a Digital Product Passport and when is the deadline?',
 'compliance', 'Conformité', 5),
('How do I collect supply chain data to populate a Digital Product Passport?',
 'compliance', 'Conformité', 6),
('How do I integrate a Digital Product Passport with my existing ERP system like SAP?',
 'compliance', 'Conformité', 7);

-- Bloc: Technologie DPP (3 requêtes)
INSERT INTO llm_queries (query_text, bloc, bloc_label, sort_order) VALUES
('What technology is used to implement a Digital Product Passport — QR code, NFC, blockchain?',
 'technology', 'Technologie DPP', 8),
('What is a tokenized Digital Product Passport and how is it different from a standard QR code label?',
 'technology', 'Technologie DPP', 9),
('Can a Digital Product Passport work across multiple supply chain tiers with different IT systems?',
 'technology', 'Technologie DPP', 10);

-- Bloc: Fournisseurs DPP (4 requêtes)
INSERT INTO llm_queries (query_text, bloc, bloc_label, sort_order) VALUES
('What are the best Digital Product Passport software platforms for fashion brands?',
 'providers', 'Fournisseurs DPP', 11),
('Arianee vs Avery Dennison for Digital Product Passports — which is better for luxury brands?',
 'providers', 'Fournisseurs DPP', 12),
('What DPP solution providers are compliant with EU ESPR regulation?',
 'providers', 'Fournisseurs DPP', 13),
('How much does it cost to implement a Digital Product Passport for a mid-size clothing brand?',
 'providers', 'Fournisseurs DPP', 14);

-- Bloc: Cas d'usage sectoriels (3 requêtes)
INSERT INTO llm_queries (query_text, bloc, bloc_label, sort_order) VALUES
('How are luxury watch brands like Breitling using Digital Product Passports?',
 'industry', 'Cas d''usage sectoriels', 15),
('Can a Digital Product Passport help fight counterfeiting in the luxury goods sector?',
 'industry', 'Cas d''usage sectoriels', 16),
('How is the fashion industry preparing for EU Digital Product Passport requirements?',
 'industry', 'Cas d''usage sectoriels', 17);

-- Bloc: Durabilité & Circularité (3 requêtes)
INSERT INTO llm_queries (query_text, bloc, bloc_label, sort_order) VALUES
('How does the Digital Product Passport help with sustainability and circular economy goals?',
 'sustainability', 'Durabilité & Circularité', 18),
('What is the link between Digital Product Passport and carbon footprint reporting requirements?',
 'sustainability', 'Durabilité & Circularité', 19),
('What is the difference between a Digital Product Passport and an EPD (Environmental Product Declaration)?',
 'sustainability', 'Durabilité & Circularité', 20);
