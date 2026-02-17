# Korean Data Sources Research

Research conducted: 2026-02-17

This document provides detailed research on three additional Korean data source APIs for potential integration into Korean Dexter.

---

## 1. BOK Economic Statistics API (ECOS)

### Overview

The Economic Statistics System (ECOS) is the official API service of the Bank of Korea (한국은행), providing comprehensive access to Korean macroeconomic data including monetary policy, financial statistics, GDP, price indices, and other key economic indicators.

- **Official Site**: https://ecos.bok.or.kr
- **API Documentation**: https://ecos.bok.or.kr/api/#/DevGuide
- **Base URL**: `https://ecos.bok.or.kr/api/`

### Authentication & Access

**Registration Process:**
- Visit https://ecos.bok.or.kr/api/#/AuthKeyApply to apply for an API key
- Registration appears to be straightforward (no special approval process mentioned)
- Free to use for all users

**Authentication Method:**
- API key passed as parameter in the URL
- No OAuth or complex token management required

**Key Application**: Simple form-based registration, key issued immediately upon approval

### Rate Limits

**Not explicitly documented** in public sources. Based on available information:
- Free tier appears suitable for research and development
- No specific requests/day limit mentioned in documentation
- Community libraries suggest stable access for reasonable usage patterns
- Recommended: Start with conservative rate (100 req/hour) and adjust based on actual limits

### Key Endpoints

| Endpoint | Function | Description |
|----------|----------|-------------|
| `keyStatList` | Top 100 Indicators | Returns the most frequently accessed statistical indicators |
| `statTableList` | Table List | List all available statistical tables with codes |
| `statItemList` | Item List | Returns item list for a specific statistical table (requires STAT_CODE) |
| `statSearch` | Search Statistics | Conditional search for statistical data with filters |
| `statMeta` | Statistical Metadata | Retrieve metadata for statistical tables |

### Common Statistical Table Codes

| Indicator | Table Code | Item Code | Frequency | Description |
|-----------|------------|-----------|-----------|-------------|
| Base Interest Rate | 722Y001 | 010101000 | Per BOK meeting | Key policy rate |
| USD/KRW Exchange Rate | 731Y003 | 0000001 | Daily | Foreign exchange rate |
| GDP Growth Rate | 200Y002 | 10111 | Quarterly | Real GDP growth |
| Consumer Price Index | 021Y126 | Various | Monthly | CPI and inflation |
| Base Money | 102Y004 | Various | Monthly | Monetary base composition |

**Note**: Table codes must be discovered through the API itself (using `statTableList` or `keyStatList`). The system contains hundreds of statistical series.

### Response Format

**Format**: JSON (primary), XML (supported)

**Example Response Structure** (based on community library documentation):
```json
{
  "StatisticSearch": {
    "list_total_count": "120",
    "row": [
      {
        "STAT_CODE": "722Y001",
        "STAT_NAME": "한국은행 기준금리",
        "ITEM_CODE1": "010101000",
        "ITEM_NAME1": "기준금리",
        "DATA_VALUE": "3.50",
        "TIME": "2024-01",
        "UNIT_NAME": "%"
      }
    ]
  }
}
```

**Key Fields:**
- `STAT_CODE`: Statistical table identifier
- `ITEM_CODE`: Specific data item within the table
- `DATA_VALUE`: The actual statistical value
- `TIME`: Time period (format varies by frequency: YYYYMM, YYYYQ, YYYY)
- `UNIT_NAME`: Unit of measurement

### Data Coverage

**Time Range:**
- Historical data extends back several decades for most indicators
- Specific range varies by indicator (GDP data typically from 1960s+, some series from 1990s+)
- Updated according to indicator frequency (daily, monthly, quarterly, annually)

**Update Frequency:**
- Real-time for market data (exchange rates: daily)
- Monthly for price indices and monetary statistics
- Quarterly for GDP and national accounts
- As-published for policy rates (irregular, per BOK meeting)

**API Version**: v1.1 (revised 2022-06-01 with improved date format handling)

### Integration Notes

**Complexity**: Medium

**Pros:**
- Well-structured statistical table system
- Stable government-maintained API
- Comprehensive macroeconomic coverage
- Free access with no apparent usage restrictions
- JSON support for easy integration
- Multiple community libraries available (R, Python)

**Cons:**
- Table code discovery required (not all codes well-documented publicly)
- Korean-language metadata (requires translation layer)
- Different date formats per indicator frequency (YYYYMM, YYYYQ, YYYY)
- Must learn table code system for specific data needs

**Integration Approach:**
1. Pre-map essential table codes for common indicators (GDP, CPI, interest rates, exchange rates)
2. Implement caching for table/item lists (metadata changes infrequently)
3. Build translation layer for Korean metadata
4. Handle multiple date format patterns

### Priority Assessment

**Priority: HIGH**

**Rationale:**
- Essential for macroeconomic context in financial research
- Complements company-level data (OpenDART) and market data (KIS)
- Authoritative source (central bank data)
- Critical indicators: interest rates, GDP, inflation, exchange rates
- Enables monetary policy impact analysis
- Required for sector-level economic analysis

**Use Cases for Korean Dexter:**
1. "What is the current BOK base rate?" → Direct query to 722Y001
2. "How has GDP grown in the last 5 years?" → Query 200Y002 with date range
3. "What's the inflation trend?" → CPI data from 021Y126
4. "USD/KRW exchange rate analysis" → Historical FX data from 731Y003
5. Context for corporate performance (e.g., "Samsung revenue vs GDP growth")

---

## 2. KOSIS National Statistics API

### Overview

KOSIS (Korean Statistical Information Service, 국가통계포털) is the national statistics portal operated by Statistics Korea, providing comprehensive access to official statistics from various government agencies. The platform contains **134,586 datasets** covering population, industry, trade, social indicators, and regional statistics.

- **Official Site**: https://kosis.kr
- **API Portal**: https://kosis.kr/openapi/
- **API Documentation**: https://kosis.kr/serviceInfo/openAPIGuide.do
- **Base URL**: `https://kosis.kr/openapi/`

### Authentication & Access

**Registration Process:**
1. Register as a KOSIS member at https://kosis.kr
2. Apply for Open API service through the API portal
3. Receive a single authentication key that works for all KOSIS services

**Authentication Method:**
- API key passed as parameter (`apiKey`) in the request URL
- No OAuth or token refresh required
- One key per member account

**Access Requirements:**
- Free membership registration (Korean residents and international users)
- No special approval process mentioned
- Immediate key issuance after registration

### Rate Limits

**Not explicitly documented** in public sources.

**Known Constraints:**
- Single API call can retrieve up to **40,000 records** (based on community library documentation)
- Pagination supported via `resultCount` and `startCount` parameters
- Example: `resultCount=20&startCount=1` returns records 1-20

**Estimated Limits:**
- Free tier appears generous for research use
- Recommended: Implement conservative rate limiting (100-200 req/hour) until limits confirmed

### Key Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `getList` | Statistics List | Retrieve list of available statistics tables |
| `getData` | Statistics Data | Query actual statistical data with filters |
| `getMeta` | Statistics Description | Get metadata and description for a table |
| `getTableDesc` | Table Description | Detailed table schema and field information |

### Service View Codes (Categories)

KOSIS organizes statistics into service views:

| View Code | Category | Description |
|-----------|----------|-------------|
| `MT_ZTITLE` | Domestic Statistics by Topic | Population, economy, labor, environment |
| `MT_OTITLE` | Domestic Statistics by Organization | By government agency |
| `MT_GTITLE01` | e-Local Indicators by Topic | Regional statistics by topic |
| `MT_GTITLE02` | e-Local Indicators by Region | Regional statistics by area |
| `MT_RTITLE` | International Statistics | Global comparative data |
| `MT_BUKHAN` | North Korean Statistics | DPRK data |
| `MT_CHOSUN_TITLE` | Pre-independence Statistics | Historical data 1908-1943 |
| `MT_HANKUK_TITLE` | ROK Statistical Yearbook | Annual yearbook data |

### Response Format

**Formats**: JSON (primary), XML, SDMX, XLS

**JSON Format Parameter**: `format=json&jsonVD=Y`

**Example Response Structure** (based on documentation):
```json
{
  "response": {
    "list_total_count": "150",
    "row": [
      {
        "TBL_ID": "DT_1B040A3",
        "TBL_NM": "인구총조사",
        "STAT_CODE": "11001",
        "STAT_NM": "인구동향조사",
        "ITEM_1": "전국",
        "ITEM_2": "총인구수",
        "DATA_VALUE": "51739000",
        "PRD_DE": "2024",
        "UNIT_NM": "명"
      }
    ]
  }
}
```

**Key Fields:**
- `TBL_ID`: Table identifier
- `STAT_CODE`: Statistics code
- `DATA_VALUE`: Statistical value
- `PRD_DE`: Period/date
- `UNIT_NM`: Unit of measurement
- `ITEM_1`, `ITEM_2`, etc.: Classification dimensions

### Data Coverage

**Time Range:**
- Varies significantly by dataset (from pre-1945 historical data to real-time)
- Population census: Decadal from 1925+
- Economic indicators: Typically from 1960s+
- Trade data: Detailed data from 1990s+
- Some specialized series have limited historical depth

**Update Frequency:**
- Depends on source agency and indicator type
- Census data: Every 5-10 years
- Economic/trade: Monthly/quarterly
- Social indicators: Annually or semi-annually

**Coverage Breadth:**
- 134,586 total datasets (as of documentation)
- Covers virtually all official Korean government statistics
- Includes regional breakdowns for many indicators

### Integration Notes

**Complexity**: High (due to discovery challenge)

**Pros:**
- Most comprehensive Korean statistics repository
- Single API key for all datasets
- Multiple output formats (JSON, XML, SDMX, XLS)
- Generous data limits (40K records per call)
- Free access
- Official government data (authoritative)
- Deep regional breakdowns available

**Cons:**
- **Primary challenge: Dataset discovery** (134K+ datasets, Korean metadata)
- Requires knowing `TBL_ID` codes beforehand
- Complex classification system (multiple item dimensions)
- Korean-language metadata requires translation
- Documentation primarily in Korean
- Parameter structure varies by table type

**Integration Approach:**
1. Pre-identify critical tables for financial research (industry output, trade, population demographics)
2. Build metadata translation layer
3. Cache table schemas (reduces API calls)
4. Implement table discovery tool for ad-hoc queries
5. Focus on most relevant service views (MT_ZTITLE, MT_OTITLE)

### Priority Assessment

**Priority: MEDIUM**

**Rationale:**
- Broad coverage but **overlaps significantly with BOK ECOS** for core economic data
- Strongest value in **industry-specific and regional statistics** not available elsewhere
- Dataset discovery complexity reduces immediate usability
- More valuable for specialized research than general financial queries

**Differentiation from BOK:**
- KOSIS: Broader (population, trade, industry, social), multiple agencies
- BOK: Deeper on monetary/financial data, more focused

**Use Cases for Korean Dexter:**
1. "Population trends in Seoul vs Busan" → Regional demographic data
2. "Export volume by industry sector" → Trade statistics
3. "Employment in semiconductor industry" → Industry-specific labor stats
4. "Housing supply by region" → Real estate statistics
5. Contextual data for sector analysis (e.g., "automotive industry trends")

**Recommendation**: Implement after BOK and BigKinds. Focus on pre-mapping 20-30 high-value tables rather than attempting comprehensive coverage.

---

## 3. BigKinds Korean News Search API

### Overview

BigKinds (빅카인즈) is a news big data analysis platform operated by the Korea Press Foundation (한국언론진흥재단), providing access to Korean news articles from over 100 major media outlets with AI-powered analysis capabilities. It serves as the Korean alternative to services like Exa or Tavily for news context.

- **Official Site**: https://www.bigkinds.or.kr
- **API Portal**: https://tools.kinds.or.kr/
- **GitHub (Open Source Platform)**: https://github.com/KPF-bigkinds/BIGKINDS-LAB
- **Base URL**: `http://api.bigkindslab.or.kr:5002/` (BigKinds Lab)

### Authentication & Access

**Registration Process:**
1. Create free account at https://www.bigkinds.or.kr/v2/account/signup.do
2. Apply for API access through the platform
3. For advanced features, register at the public data portal (https://www.data.go.kr)

**Authentication Method:**
- API key authentication
- Passed in request headers or parameters (specific method varies by endpoint)

**Access Tiers:**
- **Free tier**: Available to general public, media companies, academia, and startups
- **AI features without login**: Up to 5 queries (trial)
- **Registered members**: Can download analysis data and save news articles

**Commercial Use**: Not explicitly restricted based on available documentation, but detailed terms not found in search results (recommend confirming with Korea Press Foundation)

### Rate Limits

**Not explicitly documented** in public sources.

**Observations:**
- Free tier with trial limits (5 queries without login for AI features)
- Registered users have expanded access
- Specific req/day or req/second limits not published

**Recommendation**: Contact Korea Press Foundation for detailed rate limit documentation, especially for production use.

### Key Endpoints

Based on BigKinds Lab API documentation:

| Endpoint | URL | Description |
|----------|-----|-------------|
| Keyword Extraction | `/get_keyword` | Extract keywords from text content |
| Named Entity Recognition | `/get_ner` | Identify named entities (people, organizations, locations) |
| Classification | `/get_cls` | Categorize news articles by topic/type |
| Tag Generation | `/get_tag` | Generate tags from article content |
| Summarization | (Various) | Automatic text summarization |
| News Search | (Web interface) | Search news database with advanced filters |

**Note**: BigKinds provides both a **web-based search interface** (https://www.bigkinds.or.kr/v2/news/index.do) and **programmatic API access** (BigKinds Lab). Full REST API documentation appears limited in public sources.

### Search Parameters (Web Interface)

Based on platform documentation:

**Search Operators:**
- Boolean search supported in the search bar
- Date range filtering
- Media outlet selection (newspapers, economic publications, regional dailies, broadcasters)
- Category filtering (politics, economy, society, culture, etc.)

**Analysis Features:**
- Trend analysis over time
- Keyword network visualization
- Topic modeling
- Sentiment analysis
- Related article clustering

### Response Format

**Format**: JSON (primary)

**Example API Request** (BigKinds Lab):
```bash
POST http://api.bigkindslab.or.kr:5002/get_keyword
Content-Type: application/json

{
  "text": "삼성전자가 신규 반도체 공장 건설을 발표했다..."
}
```

**Example Response Structure** (keyword extraction):
```json
{
  "keywords": [
    {"word": "삼성전자", "score": 0.95},
    {"word": "반도체", "score": 0.88},
    {"word": "공장", "score": 0.72}
  ]
}
```

**Key Features:**
- AI-powered analysis (keywords, NER, classification)
- Structured extraction from unstructured news text
- Network analysis data for relationship mapping

### Data Coverage

**Time Range:**
- Historical news archive from **at least 1990** (based on research using the platform)
- One academic study used data from **January 1, 1990 to 2022** (30+ years)
- Recent confirmations of data available through **2024**
- Comprehensive modern coverage (2010+)

**Update Frequency:**
- **Real-time collection** from 100+ news sources
- Continuous ingestion and indexing
- Near-immediate availability of new articles

**Coverage Scale:**
- Massive volume: One study collected **7.14 million articles**, reduced to **5.64 million** after deduplication
- Includes major newspapers, economic publications, regional dailies, and broadcasters
- Comprehensive Korean-language news coverage

**Media Sources:**
- National newspapers (조선일보, 중앙일보, 동아일보, etc.)
- Economic press (매일경제, 한국경제, etc.)
- Regional dailies
- Broadcast news (KBS, MBC, SBS, etc.)

### Integration Notes

**Complexity**: Medium to High

**Pros:**
- **Korean-language optimized** (crucial for local news analysis)
- Massive historical archive (1990+, 5M+ articles)
- Real-time updates from 100+ sources
- AI-powered analysis (keywords, NER, classification)
- Free for academic and startup use
- Open-source analysis platform (BigKinds Lab on GitHub)
- Replaces need for international news APIs (Exa/Tavily) for Korean context

**Cons:**
- **Limited public API documentation** (web interface better documented than REST API)
- Rate limits not clearly published
- Commercial use terms unclear
- Some features require web interface (no API equivalent)
- API endpoints appear scattered across different services (bigkinds.or.kr vs bigkindslab.or.kr)

**Integration Approach:**
1. Start with BigKinds Lab API for text analysis features
2. Use web scraping (with permission) or official data downloads for bulk news search if API insufficient
3. Implement caching for analyzed articles (avoid re-processing)
4. Build Korean NLP pipeline using BigKinds NER/keyword extraction
5. Focus on financial news sources for relevance

**Technical Considerations:**
- Korean text processing required (tokenization, normalization)
- Large response sizes for bulk queries (bandwidth consideration)
- May need hybrid approach: API for analysis, data export for search
- Check robots.txt and terms of service for web scraping permissibility

### Priority Assessment

**Priority: HIGH**

**Rationale:**
- **Unique value**: Only source for Korean news context and sentiment
- Essential for **qualitative research** and company-specific events
- Complements quantitative data (OpenDART, KIS, BOK)
- Critical for understanding market-moving news
- Required for comprehensive company research (scandals, product launches, regulatory issues)

**Strategic Importance:**
- Bridges gap between structured financial data and real-world context
- Enables sentiment analysis for Korean market
- No viable alternative for Korean news (international APIs have poor Korean coverage)

**Use Cases for Korean Dexter:**
1. "What news about Samsung emerged this week?" → Recent article search + keyword extraction
2. "Sentiment analysis on Hyundai's EV strategy" → News search + AI analysis
3. "Corporate governance issues at Korean Air" → Historical news + trend analysis
4. "Impact of semiconductor policy changes" → News search filtered by date + topic
5. "Executive scandals affecting stock price" → Named entity recognition + date correlation

**Differentiation:**
- Complements structured data with **narrative context**
- Only source for **Korean public sentiment** and media coverage
- Essential for event-driven analysis

---

## Comparative Summary

### Integration Priority Ranking

| Rank | API | Priority | Rationale |
|------|-----|----------|-----------|
| 1 | **BOK ECOS** | HIGH | Essential macroeconomic context; authoritative central bank data |
| 2 | **BigKinds** | HIGH | Unique news/sentiment analysis; no Korean alternative |
| 3 | **KOSIS** | MEDIUM | Broad coverage but overlaps with BOK; valuable for specialized queries |

### Complexity Comparison

| API | Complexity | Primary Challenge |
|-----|------------|-------------------|
| BOK ECOS | Medium | Table code discovery, date format variations |
| KOSIS | High | 134K dataset discovery, complex classification system |
| BigKinds | Medium-High | Limited API docs, Korean NLP requirements |

### Data Coverage Comparison

| Dimension | BOK ECOS | KOSIS | BigKinds |
|-----------|----------|-------|----------|
| **Historical Depth** | 1960s+ (varies) | 1908+ (varies widely) | 1990+ |
| **Update Frequency** | Daily to Quarterly | Varies by indicator | Real-time |
| **Data Volume** | Hundreds of series | 134,586 datasets | 5M+ articles |
| **Focus Area** | Macroeconomics, Finance | All national statistics | News, Sentiment |

### Complementary Value

These three APIs form a **complementary data ecosystem**:

1. **BOK ECOS**: Macro context (interest rates, GDP, inflation, FX)
2. **KOSIS**: Industry/sector/regional details (trade, employment, demographics)
3. **BigKinds**: Qualitative context (news, sentiment, events)

Combined with existing integrations:
- **OpenDART**: Company financials and disclosures
- **KIS**: Stock prices and trading data

Korean Dexter would have comprehensive coverage across:
- ✅ Corporate fundamentals (OpenDART)
- ✅ Market data (KIS)
- ✅ Macroeconomic indicators (BOK ECOS)
- ✅ Industry/sector statistics (KOSIS)
- ✅ News and sentiment (BigKinds)

### Implementation Recommendation

**Phase 1 (MVP+)**: Add BOK ECOS
- Highest ROI for effort
- Clear use cases (interest rates, GDP, FX)
- Medium complexity
- Essential for macro context

**Phase 2**: Add BigKinds
- Unique value (no alternative for Korean news)
- Enables new capabilities (sentiment, event analysis)
- Requires Korean NLP investment
- High strategic value

**Phase 3**: Add KOSIS selectively
- Pre-map 20-30 high-value tables
- Focus on industry/regional data not in BOK
- Implement table discovery tool
- Defer comprehensive coverage

---

## Technical Integration Notes

### Common Patterns

**All three APIs share**:
1. Free tier availability (good for development/testing)
2. Korean-language metadata (translation layer needed)
3. Simple API key authentication (no OAuth complexity)
4. JSON response support
5. Government/quasi-government operation (stability)

### Recommended Architecture

```
┌─────────────────────────────────────────┐
│         Korean Dexter Agent             │
└─────────────────┬───────────────────────┘
                  │
        ┌─────────┴─────────┐
        │  Data Source       │
        │  Orchestrator      │
        └─────────┬──────────┘
                  │
    ┌─────────────┼─────────────┬──────────────┐
    │             │             │              │
┌───▼────┐  ┌────▼────┐  ┌─────▼─────┐  ┌────▼──────┐
│ OpenDART│  │   KIS   │  │ BOK ECOS  │  │ BigKinds  │
│(Existing)│  │(Existing)│  │  (New)    │  │   (New)   │
└────────┘  └─────────┘  └───────────┘  └───────────┘
     │           │             │              │
     └───────────┴─────────────┴──────────────┘
                    │
            ┌───────▼────────┐
            │  Response       │
            │  Synthesizer    │
            └────────────────┘
```

**Key Components:**
- **Translation Layer**: Korean → English for metadata
- **Caching Layer**: Reduce API calls, improve latency
- **Rate Limiter**: Respect (undocumented) limits
- **Error Handler**: Graceful degradation if source unavailable

---

## Sources

### BOK ECOS API
- [BOK Open API Service](https://ecos.bok.or.kr/api/)
- [ECOS R Package Documentation](https://cran.r-project.org/web/packages/ecos/ecos.pdf)
- [BOK ECOS Open API using R code | R-bloggers](https://www.r-bloggers.com/2021/05/bok-ecos-open-api-using-r-code/)
- [GitHub - boklib: A Python library for Bank of Korea API](https://github.com/neur0hak/boklib)
- [PublicDataReader ECOS Documentation](https://github.com/WooilJeong/PublicDataReader/blob/main/assets/docs/ecos/ecos.md)

### KOSIS API
- [KOSIS Open API Service](https://kosis.kr/openapi/)
- [KOSIS API Guide](https://kosis.kr/serviceInfo/openAPIGuide.do)
- [GitHub - seokhoonj/kosis](https://github.com/seokhoonj/kosis)
- [PublicDataReader KOSIS Documentation](https://github.com/WooilJeong/PublicDataReader/blob/main/assets/docs/kosis/Kosis.md)
- [KOSIS Korean Statistical Information Service](https://kosis.kr/eng/)

### BigKinds API
- [BigKinds Official Site](https://www.bigkinds.or.kr/)
- [GitHub - BIGKINDS-LAB](https://github.com/KPF-bigkinds/BIGKINDS-LAB)
- [How to do things with 'BigKinds' | PDF](https://www.slideshare.net/DaeminPark1/how-to-do-a-news-big-data-analysis-with-ltbigkinds)
- [Topic Modeling Analysis Using BigKinds | MDPI](https://www.mdpi.com/2304-8158/14/15/2650)
- [Analysis of Domestic Newspaper Articles using Bigkinds | Korea Science](https://koreascience.kr/article/JAKO202411643755431.page)

---

## Next Steps

To proceed with integration:

1. **BOK ECOS** (Priority 1):
   - [ ] Register for API key at https://ecos.bok.or.kr/api/#/AuthKeyApply
   - [ ] Test core endpoints (`keyStatList`, `statSearch`)
   - [ ] Map 10-15 essential table codes (interest rate, GDP, CPI, FX)
   - [ ] Implement client with rate limiting and caching
   - [ ] Build metadata translation layer

2. **BigKinds** (Priority 2):
   - [ ] Register account at https://www.bigkinds.or.kr
   - [ ] Test BigKinds Lab API endpoints
   - [ ] Evaluate web search API vs data export approach
   - [ ] Clarify commercial use terms with Korea Press Foundation
   - [ ] Build Korean NLP pipeline (tokenization, keyword extraction)

3. **KOSIS** (Priority 3):
   - [ ] Register for API key at https://kosis.kr/openapi/
   - [ ] Identify 20-30 high-value tables (industry, trade, regional data)
   - [ ] Test `getData` and `getMeta` endpoints
   - [ ] Build table discovery tool for ad-hoc queries
   - [ ] Implement selective integration (not comprehensive coverage)

4. **Cross-API**:
   - [ ] Design unified data source orchestrator
   - [ ] Implement centralized caching strategy
   - [ ] Build translation layer for Korean metadata
   - [ ] Create response synthesizer for multi-source queries
   - [ ] Document API key management in `.env.example`
