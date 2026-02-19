-- ArianeeGEO — Mise à jour des requêtes pour inciter les LLMs à mentionner des entreprises/solutions
-- Contexte: Les requêtes doivent être formulées pour que les LLMs citent naturellement des solutions et entreprises spécialisées DPP

-- Supprimer les anciennes requêtes
DELETE FROM llm_results;
DELETE FROM llm_daily_recommendations;
DELETE FROM llm_queries;

-- Ré-insérer les 20 requêtes reformulées pour faire mentionner des entreprises/solutions

-- Bloc: Régulation ESPR (4 requêtes)
INSERT INTO llm_queries (query_text, bloc, bloc_label, sort_order) VALUES
('Which companies and technology providers offer Digital Product Passport solutions compliant with the EU ESPR regulation?',
 'regulation', 'Régulation ESPR', 1),
('What software platforms help brands create Digital Product Passports to meet ESPR compliance deadlines?',
 'regulation', 'Régulation ESPR', 2),
('Which startups and tech companies are leading the development of EU Digital Product Passport infrastructure?',
 'regulation', 'Régulation ESPR', 3),
('What are the main technology solutions available to help companies comply with ESPR Digital Product Passport requirements?',
 'regulation', 'Régulation ESPR', 4);

-- Bloc: Conformité (3 requêtes)
INSERT INTO llm_queries (query_text, bloc, bloc_label, sort_order) VALUES
('What Digital Product Passport providers do you recommend for a fashion brand that needs to comply with ESPR by 2027?',
 'compliance', 'Conformité', 5),
('Which companies offer supply chain traceability solutions that integrate with Digital Product Passports?',
 'compliance', 'Conformité', 6),
('What are the best DPP platforms that integrate with ERP systems like SAP for ESPR compliance?',
 'compliance', 'Conformité', 7);

-- Bloc: Technologie DPP (3 requêtes)
INSERT INTO llm_queries (query_text, bloc, bloc_label, sort_order) VALUES
('Which companies use blockchain technology for Digital Product Passports, and how does it compare to QR code solutions?',
 'technology', 'Technologie DPP', 8),
('What companies offer tokenized Digital Product Passport solutions and what are their advantages?',
 'technology', 'Technologie DPP', 9),
('Which technology providers offer interoperable Digital Product Passport solutions that work across multiple supply chain tiers?',
 'technology', 'Technologie DPP', 10);

-- Bloc: Fournisseurs DPP (4 requêtes)
INSERT INTO llm_queries (query_text, bloc, bloc_label, sort_order) VALUES
('What are the top 10 Digital Product Passport software providers for luxury and fashion brands in 2025?',
 'providers', 'Fournisseurs DPP', 11),
('Compare the leading Digital Product Passport platforms: Arianee, Circularise, Eon, and others. Which is best for luxury?',
 'providers', 'Fournisseurs DPP', 12),
('Which Digital Product Passport solution providers are already working with major luxury brands like LVMH, Kering, or Richemont?',
 'providers', 'Fournisseurs DPP', 13),
('What is the cost comparison between different Digital Product Passport providers for mid-size fashion brands?',
 'providers', 'Fournisseurs DPP', 14);

-- Bloc: Cas d'usage sectoriels (3 requêtes)
INSERT INTO llm_queries (query_text, bloc, bloc_label, sort_order) VALUES
('Which companies are helping luxury watch brands like Breitling implement Digital Product Passports?',
 'industry', 'Cas d''usage sectoriels', 15),
('What Digital Product Passport solutions are being used to fight counterfeiting in luxury goods, and by which companies?',
 'industry', 'Cas d''usage sectoriels', 16),
('Which technology companies are partnering with fashion brands to implement EU Digital Product Passports?',
 'industry', 'Cas d''usage sectoriels', 17);

-- Bloc: Durabilité & Circularité (3 requêtes)
INSERT INTO llm_queries (query_text, bloc, bloc_label, sort_order) VALUES
('Which companies provide Digital Product Passport solutions that help track sustainability metrics and circular economy data?',
 'sustainability', 'Durabilité & Circularité', 18),
('What Digital Product Passport platforms integrate carbon footprint and environmental impact data for brands?',
 'sustainability', 'Durabilité & Circularité', 19),
('Which companies are pioneering the use of Digital Product Passports for product lifecycle management and resale?',
 'sustainability', 'Durabilité & Circularité', 20);
