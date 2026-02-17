/**
 * Rich tool descriptions for Korean financial tools.
 * Injected into the system prompt so the LLM knows when/how to use each tool.
 */

export const RESOLVE_COMPANY_DESCRIPTION = `resolve_company — 회사명/종목코드를 OpenDART corp_code로 변환

**MUST call this tool first** before using any other financial data tool.
OpenDART uses 8-digit corp_code, not ticker symbols. This tool resolves
company names (삼성전자), tickers (005930), or corp_codes (00126380) to
the canonical identifiers needed by other tools.

Returns: corp_code, corp_name, stock_code, confidence score, alternatives
- confidence 1.0 = exact match (ticker, corp_code, or name)
- confidence < 1.0 = fuzzy match — confirm with user if low confidence

When to use:
- User mentions any company by name or ticker
- Before calling get_financial_statements, get_company_info, get_stock_price

When NOT to use:
- You already have a confirmed corp_code from a previous call
- User is asking about market indices (use get_market_index directly)`;

export const GET_FINANCIAL_STATEMENTS_DESCRIPTION = `get_financial_statements — OpenDART 재무제표 주요 계정 조회

Retrieves key financial statement items (revenue, operating income, net income,
total assets, total liabilities, equity) from the DART electronic disclosure system.

Input:
- corp_code (required): 8-digit OpenDART corp code from resolve_company
- year: Business year (default: previous year, most recent annual)
- report_code: "11011" annual, "11012" H1, "11013" Q1, "11014" Q3
- fs_div: "CFS" consolidated (default) or "OFS" separate

Behavior:
- Defaults to consolidated (연결재무제표/CFS); auto-falls back to separate (별도/OFS)
- Returns items with Korean account names and normalized amounts in 조원/억원/만원
- Each item includes current period and previous period amounts for comparison

Caveats:
- Requires corp_code, NOT ticker — call resolve_company first
- Prior-year data is immutable and cached permanently
- Report availability depends on filing schedule (annual ~March, quarterly ~May/Aug/Nov)`;

export const GET_COMPANY_INFO_DESCRIPTION = `get_company_info — OpenDART 기업 개황 조회

Retrieves company overview from DART: name (KR/EN), CEO, corp class (Y=KOSPI, K=KOSDAQ, N=KONEX, E=etc),
industry code, establishment date, fiscal year end month.

Input:
- corp_code (required): 8-digit OpenDART corp code from resolve_company

When to use:
- User asks "what does this company do?" or wants basic company info
- Need to verify company listing status or fiscal year end
- Cross-checking company identity after fuzzy resolution

When NOT to use:
- Need financial numbers — use get_financial_statements
- Need stock price — use get_stock_price`;

export const GET_STOCK_PRICE_DESCRIPTION = `get_stock_price — KIS API 현재가 조회

Retrieves real-time (during market hours) or closing stock price from
Korea Investment & Securities API.

Input:
- stock_code (required): 6-digit KRX stock code (e.g., "005930" for Samsung Electronics)

Returns: current price, change, change%, volume, market cap, high, low, open, market status

Amounts are formatted in Korean won scales (조원/억원/만원).
Market cap is in 억원 from KIS, converted to won for display.

Caveats:
- Requires stock_code (6-digit ticker), NOT corp_code — get stock_code from resolve_company
- During KRX market hours (09:00-15:30 KST weekdays), returns live data
- Outside market hours, returns previous closing data
- Unlisted companies (stock_code is null) cannot use this tool`;

export const GET_HISTORICAL_PRICES_DESCRIPTION = `get_historical_prices — KIS API 일별 시세 (OHLCV) 조회

Retrieves historical daily/weekly/monthly OHLCV price data.

Input:
- stock_code (required): 6-digit KRX stock code
- start_date: YYYYMMDD format (default: 90 days ago)
- end_date: YYYYMMDD format (default: today)
- period: "D" daily (default), "W" weekly, "M" monthly

Returns: array of { date, open, high, low, close, volume }

When to use:
- User asks about price trends, historical performance
- Need to calculate returns over a period
- Chart or trend analysis

Caveats:
- Past data is immutable and cached permanently
- Maximum ~100 data points per request (KIS pagination limit)
- Dates must be in YYYYMMDD format, not YYYY-MM-DD`;

export const GET_MARKET_INDEX_DESCRIPTION = `get_market_index — KIS API 시장 지수 조회

Retrieves current KOSPI or KOSDAQ market index value.

Input:
- index_code: "0001" for KOSPI (default), "1001" for KOSDAQ

Returns: index name, current value, change, change%, volume, market status

When to use:
- User asks about overall market conditions
- Need KOSPI or KOSDAQ benchmark data
- Market sentiment analysis

When NOT to use:
- Need individual stock price — use get_stock_price
- Need company financials — use get_financial_statements`;

/**
 * Combined description of all tools for system prompt overview.
 */
export const TOOL_USAGE_OVERVIEW = `### Tool Usage Flow (권장 사용 흐름)

1. **Always start with resolve_company** when a user mentions a company
2. Use the returned corp_code for OpenDART tools (financials, company info)
3. Use the returned stock_code for KIS tools (prices, historical data)
4. For market indices, use get_market_index directly (no resolution needed)

### Available API Sources

- **OpenDART** (전자공시시스템): Financial statements, company info, disclosures
- **KIS** (한국투자증권): Stock prices, historical data, market indices`;
