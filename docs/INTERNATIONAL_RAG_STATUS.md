# International RAG & Country-Specific Retrieval Architecture

## 1. How Jurisdiction is Represented
Jurisdiction is represented in `CaseState.jurisdiction` (`"India"` or `"International"`). Normalized via `JurisdictionEngine.normalize_jurisdiction(...)`.
- `"India"`: Enforces Indian domestic statutory corpora (Indian Patents Act 1970, Biological Diversity Act 2002, Drugs & Cosmetics Act 1940, FSSAI Ayurveda Aahar Regulations 2022) and international treaties applicable to India (e.g. WIPO PCT, Nagoya Protocol, CBD, TRIPS).
- `"International"`: Triggers international and country-specific retrieval protocols based on the target country.

## 2. How Country/Region is Represented
- `CaseState.country`: The specific target sovereign country (e.g., `"Germany"`, `"USA"`, `"UK"`, `"France"`, `"Japan"`, or `None` if unspecified).
- `LegalSourceMetadata.country`: Direct domestic sovereign jurisdiction (e.g., `"India"`, `"Germany"`, `"USA"`).
- `LegalSourceMetadata.region`: Geographic or supranational treaty zone (e.g., `"EU"`, `"Europe"`, `"North America"`, `"International"`, `"Global"`).
- `LegalSourceMetadata.applicable_countries`: Explicit array of member states bound by or subject to the statute/treaty (e.g. EPC covers `["Germany", "France", "UK", "Italy", "Spain", ...]`).

## 3. How QueryPlan Carries Country
`QueryPlanner.plan_query` extracts and structures the RAG retrieval parameters into a Pydantic `QueryPlan`:
- `QueryPlan.jurisdiction`: `"India"` or `"International"`.
- `QueryPlan.country`: Direct country string (e.g. `"Germany"`, `"USA"`) or `None`.
- `QueryPlan.ip_domains`: Domain objectives (`"patent"`, `"regulatory"`, `"abs"`, `"tkdl_prior_art"`).
- `QueryPlan.search_terms`: Statutory terms and keywords.
- `QueryPlan.source_types`: `"statute"`, `"treaty"`, `"regulation"`.

Groq's prompt explicitly instructs: *"The country/region is legally significant. Do not generate a generic international query when a specific country is known."* Fallbacks strictly preserve `case_state.country`.

## 4. How Country Reaches Retrieval
The complete call chain passes `country` deterministically from state to vector search and reranking:
1. `ConversationPipeline` calls `RAGRetriever.execute_rag_pipeline(processed_text, case_state)`.
2. `RAGRetriever` generates `plan = await query_planner.plan_query(query, case_state)`.
3. `effective_country = plan.country or case_state.country`.
4. `RAGRetriever.retrieve_evidence(..., country=effective_country)` passes `country` to:
   - `VectorStoreInterface.search_chunks(..., country=country)`
   - `EvidenceReranker.rerank_evidence(..., target_country=country, target_jurisdiction=jurisdiction)`
5. `EvidenceContext` collects `selected_chunks` preserving `country`, `region`, and `applicable_countries`.

## 5. How Country Filtering Works
Filtering is implemented in `VectorStoreInterface.is_source_applicable(chunk, target_jurisdiction, target_country)`:
- **India Jurisdiction**: Allows India statutes/regulations and universal international treaties; strictly disallows foreign domestic statutes (e.g., 35 U.S.C., German PatG).
- **International Jurisdiction with Known Country (e.g. Germany)**:
  - Direct country match (`chunk.country == "Germany"`): **ELIGIBLE** (e.g., German Patent Act / PatG).
  - Explicit applicability list (`"Germany" in chunk.applicable_countries`): **ELIGIBLE**.
  - Regional regime match (`chunk.region in ["EU", "Europe"]` for EU countries): **ELIGIBLE** (e.g., European Patent Convention / EPC).
  - Universal international treaties (`chunk.source_type == "treaty"` or `chunk.region == "International"`): **ELIGIBLE** (e.g., WIPO PCT, Nagoya Protocol, CBD, TRIPS).
  - Foreign domestic statutes of other non-applicable countries (`chunk.country == "USA"`): **STRICTLY EXCLUDED**.

## 6. How International Treaties are Handled
Universal treaties (such as WIPO Patent Cooperation Treaty (PCT), Nagoya Protocol on ABS, TRIPS Agreement, and Convention on Biological Diversity) are marked with `source_type="treaty"` and `region="International"`. They remain eligible for both Indian and International inquiries across all target countries.

## 7. How Regional Sources are Handled
Supranational regional legal frameworks (such as the European Patent Convention - EPC, EU Biotech Directive 98/44/EC) carry `region="EU"` and an exhaustive list of member countries in `applicable_countries`. When an EU member state (e.g., Germany) is selected, regional sources are automatically recognized as applicable domestic/regional authority.

## 8. How Unknown Country is Handled
If `jurisdiction = "International"` and `country` is unknown / `None`:
- The system does **NOT** invent or assume a default country.
- `VectorStoreInterface` retrieves genuinely international treaties (PCT, Nagoya Protocol, CBD, TRIPS) and global patent frameworks.
- Domestic statutes tied to a specific country (e.g., US 35 U.S.C., German PatG, Indian national acts) are excluded.
- The Dynamic Questioning Engine prompts the user for their specific target country.

## 9. Tests Performed
The test suite `backend/tests/test_country_rag.py` provides complete test coverage for country-aware RAG:
1. `test_1_international_germany_query_plan`: Verifies `QueryPlan.country == "Germany"`.
2. `test_2_international_usa_query_plan`: Verifies `QueryPlan.country == "USA"`.
3. `test_3_international_germany_eligible_and_ineligible`: Verifies German PatG is retrieved while US 35 U.S.C. is excluded.
4. `test_4_international_germany_treaties_eligible`: Verifies international treaties (PCT, Nagoya) remain eligible for German cases.
5. `test_5_international_germany_eu_regional_eligible`: Verifies EU regional frameworks (EPC) are eligible for Germany.
6. `test_6_international_unknown_country`: Verifies unassigned country queries retrieve international treaties without fabricating a country.
7. `test_7_india_retrieval_intact`: Verifies India domestic retrieval functions properly and excludes foreign laws.
8. `test_8_country_reaches_vector_retrieval`: Verifies `search_chunks(country=...)` deterministically filters out mismatched domestic corpora.
9. `test_9_country_metadata_survives_into_evidence_chunk`: Verifies `country`, `region`, `applicable_countries`, `source_type`, and `authority_level` are preserved in `EvidenceChunk`.
10. `test_10_germany_case_does_not_retrieve_us_domestic_authority`: Verifies a Germany query with US terms never retrieves US-only law as German domestic authority.

All 37 backend tests passed cleanly with 0 failures.

## 10. Remaining Limitations
- While German statutory law (Patentgesetz / PatG Sections 1, 1a, 2a), US Code (35 U.S.C. 101/102), European Patent Convention (EPC), and International Treaties (PCT, Nagoya, TRIPS, CBD) are active, additional statutory corpora for other specific jurisdictions (e.g., UK Patents Act 1977, Japanese Patent Act) can be ingested into `source_registry.py` as new seed statutes are added.
