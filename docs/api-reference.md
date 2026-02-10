# API Reference: Korean Financial Data Sources

## 1. OpenDART (금융감독원 전자공시시스템)

- **Base URL**: `https://opendart.fss.or.kr/api/`
- **Auth**: API key (`crtfc_key` parameter)
- **Registration**: https://opendart.fss.or.kr (requires Korean phone number or business registration)
- **Rate Limits**: ~1,000 req/day (free), ~10,000 req/day (certified)
- **Documentation**: https://opendart.fss.or.kr/guide/main.do

### Key Endpoints

| Endpoint | Path | Description |
|---|---|---|
| Corp Code List | `corpCode.xml` | ZIP file containing all ~90K company codes (XML) |
| Company Info | `company.json` | Company overview (CEO, address, industry, fiscal year) |
| Disclosure Search | `list.json` | Search disclosures by date/type/company |
| Major Accounts | `fnlttSinglAcnt.json` | Key financial items (~15-20 items) |
| Full Financials | `fnlttSinglAcntAll.json` | Complete XBRL financial statements (60-100+ items) |
| Financial Indicators | `fnlttSinglIndx.json` | Pre-calculated ratios (ROE, debt ratio, etc.) |
| Dividends | `alotMatter.json` | Dividend per share, payout ratio |
| Major Shareholders | `hyslrSttus.json` | Largest shareholders and ownership % |
| Shareholder Changes | `hyslrChgSttus.json` | Changes in major shareholding |
| Executives | `exctvSttus.json` | Board members and positions |
| Auditor Opinion | `accnutAdtorNmNdAdtOpinion.json` | Auditor name and opinion |

### Common Parameters

| Parameter | Description | Values |
|---|---|---|
| `crtfc_key` | API key | String |
| `corp_code` | 8-digit company code | e.g., "00126380" (Samsung) |
| `bsns_year` | Fiscal year | e.g., "2024" |
| `reprt_code` | Report type | "11013" (Q1), "11012" (H1), "11014" (Q3), "11011" (Annual) |
| `fs_div` | Statement type | "CFS" (consolidated), "OFS" (separate) |

### Important Notes

- `corpCode.xml` is actually a ZIP file, not raw XML
- `stock_code` field is empty for unlisted companies
- Amount values are strings (may have commas, negatives, or be empty)
- Empty string `""` means no data, NOT zero

---

## 2. KIS (한국투자증권 Open API)

- **Base URL (Prod)**: `https://openapi.koreainvestment.com:9443`
- **Base URL (Paper)**: `https://openapivts.koreainvestment.com:29443`
- **Auth**: OAuth2 Bearer token (24h expiry, ~1 issuance/day)
- **Registration**: https://apiportal.koreainvestment.com (requires Korean brokerage account)
- **Token Issuance**: `POST /oauth2/tokenP`

### Key Endpoints

| Endpoint | Path | Description |
|---|---|---|
| Token Issue | `/oauth2/tokenP` | Get OAuth access token |
| Current Price | `/uapi/domestic-stock/v1/quotations/inquire-price` | Real-time stock price |
| Daily Prices | `/uapi/domestic-stock/v1/quotations/inquire-daily-price` | OHLCV daily data |
| Investor Trading | `/uapi/domestic-stock/v1/quotations/inquire-investor` | Foreign/institutional flows |
| Stock Info | `/uapi/domestic-stock/v1/quotations/search-stock-info` | PER, PBR, EPS, sector |
| Market Index | `/uapi/domestic-stock/v1/quotations/inquire-index-price` | KOSPI/KOSDAQ indices |

### OAuth Token Lifecycle

1. Issue token: `POST /oauth2/tokenP` with `appkey` + `appsecret`
2. Token expires after 24 hours
3. Re-issuance rate: approximately 1/day (frequent requests → access blocked)
4. Refresh rate: 1/minute maximum
5. **Must persist token to disk** — process restart should reuse existing token

### Headers Required

```
Content-Type: application/json; charset=utf-8
authorization: Bearer {access_token}
appkey: {app_key}
appsecret: {app_secret}
tr_id: {transaction_id}  // Different per endpoint
```

---

## 3. BOK ECOS (한국은행 경제통계시스템) — v1.1

- **Base URL**: `https://ecos.bok.or.kr/api/`
- **Auth**: API key
- **Registration**: https://ecos.bok.or.kr/api/#/
- **Documentation**: https://ecos.bok.or.kr/api/#/DevGuide

### Key Table Codes

| Indicator | Table Code | Item Code | Frequency |
|---|---|---|---|
| Base Interest Rate | 722Y001 | 010101000 | Per BOK meeting |
| USD/KRW Exchange Rate | 731Y003 | 0000001 | Daily |
| GDP Growth Rate | 200Y002 | 10111 | Quarterly |
| Consumer Price Index | 021Y126 | Various | Monthly |

---

## 4. KOSIS (통계청 국가통계포털) — v1.1

- **Base URL**: `https://kosis.kr/openapi/`
- **Auth**: API key
- **Registration**: https://kosis.kr/openapi/
- **Notes**: 134,586 datasets. Primary challenge is discovery.

---

## 5. BigKinds (한국언론진흥재단) — v1.1

- **Base URL**: `https://tools.kinds.or.kr/`
- **Auth**: API key
- **Registration**: https://www.bigkinds.or.kr
- **Notes**: Korean news big data analysis. Replaces Exa/Tavily for Korean context.
