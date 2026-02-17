/**
 * Rich tool descriptions for KOSIS tools.
 * Injected into the system prompt so the LLM knows when/how to use each tool.
 */

export const GET_KOSIS_DATA_DESCRIPTION = `get_kosis_data — KOSIS 통계 데이터 조회

Fetches statistical data from KOSIS (Korean Statistical Information Service).
Covers population, industry output, employment, trade, and thousands of other national statistics.

Input:
- table_id (required): KOSIS table ID (e.g., "DT_1B040A3" for population census)
- org_id: Organization ID that publishes the table
- period_type: "Y" yearly, "Q" quarterly, "M" monthly
- start_period: Start period (e.g., "2020" for annual, "202401" for monthly)
- end_period: End period
- item_id: Specific item ID filter
- obj_l1: Object level 1 classification filter
- obj_l2: Object level 2 classification filter

Common pre-mapped tables:
- 인구총조사: "DT_1B040A3"
- 광업제조업동향조사: "DT_1F01006"
- 경제활동인구조사: "DT_1D07002S"
- 무역통계: "DT_1B67001"

Returns: table name, items with dimensions, values, periods, and units

When to use:
- User asks about national statistics (인구, 고용, 산업, 무역)
- Need industry-level or sector-level macro data
- Comparing company metrics against national trends

When NOT to use:
- Need BOK monetary/financial indicators — use get_economic_indicator
- Need company-specific data — use OpenDART tools
- Don't know the table ID — use search_kosis_tables first

Caveats:
- If no period specified, returns 5 most recent periods by default
- Some tables require org_id; use search_kosis_tables to find it
- Historical data cached 7 days; recent data cached 1 hour`;

export const SEARCH_KOSIS_TABLES_DESCRIPTION = `search_kosis_tables — KOSIS 통계표 검색

Search available statistical tables in KOSIS by keyword.
Use this to discover table IDs before fetching specific data.

Input:
- query (required): Search keyword in Korean or English (e.g., "인구", "고용", "무역")
- org_id: Optional organization ID to filter results

Returns: list of { tableId, tableName, statId, orgId, periodType } for matching tables

When to use:
- Don't know the KOSIS table ID for specific statistics
- User asks about national statistics you don't have a pre-mapped code for
- Exploring what KOSIS data is available on a topic

When NOT to use:
- Already know the table ID — use get_kosis_data directly
- Need BOK economic indicators — use search_bok_tables instead

Caveats:
- Returns table metadata, not actual data — use get_kosis_data with the found ID
- Korean keywords typically yield better results than English
- Table catalog is cached for 30 days`;
