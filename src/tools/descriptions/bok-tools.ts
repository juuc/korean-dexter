/**
 * Rich tool descriptions for BOK ECOS tools.
 * Injected into the system prompt so the LLM knows when/how to use each tool.
 */

export const GET_ECONOMIC_INDICATOR_DESCRIPTION = `get_economic_indicator — BOK ECOS 경제지표 조회

Fetches specific economic indicators from the Bank of Korea Economic Statistics System (ECOS).
Covers interest rates, GDP, CPI, exchange rates, money supply, and more.

Input:
- table_code (required): BOK statistical table code (e.g., "722Y001" for base rate)
- item_code (required): Item code within the table (e.g., "0101000")
- period_type (required): "A" annual, "Q" quarterly, "M" monthly, "D" daily
- start_date (required): Start date matching period format (e.g., "2020" for annual, "202401" for monthly)
- end_date (required): End date matching period format

Common pre-mapped indicators (use these codes directly):
- 기준금리: table="722Y001", item="0101000"
- 원/달러 환율: table="731Y003", item="0000001"
- GDP 성장률: table="200Y002", item="10111"
- 소비자물가지수: table="021Y126", item="*"
- 광의통화(M2): table="102Y004", item="*"

Returns: indicator name, unit, and time-series values with period labels

When to use:
- User asks about macroeconomic indicators (금리, 환율, GDP, 물가)
- Need to compare company performance against macro trends
- Analyzing interest rate or exchange rate impact on financials

When NOT to use:
- Need company-specific data — use OpenDART tools
- Need stock prices — use KIS tools
- Don't know the table code — use search_bok_tables first

Caveats:
- Period format must match period_type (annual="2024", monthly="202401", quarterly="2024Q1")
- Use "*" as item_code to get all items in a table
- Historical data is cached 7 days; current-period data cached 1 hour`;

export const GET_KEY_STATISTICS_DESCRIPTION = `get_key_statistics — BOK ECOS 100대 주요 경제지표

Fetches top 100 frequently accessed economic indicators from BOK.
Returns latest values for key macro indicators at a glance.

No input required — returns the most important 100 indicators.

Returns: list of { name, value, unit, cycle, time } for each indicator

When to use:
- User asks for a macro overview or economic snapshot
- Need to quickly check current economic conditions
- Starting point before drilling into specific indicators

When NOT to use:
- Need historical time series — use get_economic_indicator
- Need specific indicator detail — use get_economic_indicator with exact codes

Caveats:
- Values are latest available, not real-time
- Cached for 1 hour (indicators update daily at most)`;

export const SEARCH_BOK_TABLES_DESCRIPTION = `search_bok_tables — BOK ECOS 통계표 검색

Search available statistical tables in BOK ECOS by keyword.
Use this to discover table codes before fetching specific indicators.

Input:
- query (required): Search keyword in Korean or English (e.g., "금리", "환율", "GDP")

Returns: list of { statCode, statName, cycle, orgName } for matching tables

When to use:
- Don't know the table code for a specific indicator
- User asks about an economic metric you don't have a pre-mapped code for
- Exploring what BOK data is available on a topic

When NOT to use:
- Already know the table code — use get_economic_indicator directly
- Need KOSIS national statistics — use search_kosis_tables instead

Caveats:
- Returns table metadata, not actual data — use get_economic_indicator with the found code
- Korean keywords often yield better results than English
- Table catalog is cached for 30 days`;
