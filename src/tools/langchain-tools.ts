/**
 * LangChain tool wrappers for Korean financial data APIs.
 * Wraps OpenDART and KIS tool functions as DynamicStructuredTools with Zod schemas.
 *
 * Clients are lazy-initialized singletons. Tools are conditionally created
 * based on available API credentials (missing keys = tool excluded, not crash).
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';

import { OpenDartClient, type DartClientLike } from '@/tools/core/opendart/client.js';
import {
  getFinancialStatements,
  getCompanyInfo,
} from '@/tools/core/opendart/tools.js';
import { KISClient, type KisClientLike } from '@/tools/core/kis/client.js';
import {
  getStockPrice,
  getHistoricalPrices,
  getMarketIndex,
} from '@/tools/core/kis/tools.js';
import { BokClient, type BokClientLike } from '@/tools/core/bok/client.js';
import {
  getEconomicIndicator,
  getKeyStatisticsList,
  searchStatisticTables,
} from '@/tools/core/bok/tools.js';
import { BOK_INDICATORS } from '@/tools/core/bok/types.js';
import { KosisClient, type KosisClientLike } from '@/tools/core/kosis/client.js';
import {
  getKosisData,
  searchKosisTables,
} from '@/tools/core/kosis/tools.js';
import { KOSIS_TABLES } from '@/tools/core/kosis/types.js';
import { CorpCodeResolver } from '@/mapping/corp-code-resolver.js';
import {
  checkOpenDartApiKey,
  checkKisCredentials,
  checkBokApiKey,
  checkKosisApiKey,
} from '@/utils/env.js';
import { formatKoreanError } from '@/tools/error-messages.js';
import {
  DemoDartClient,
  DemoKisClient,
  DemoBokClient,
  DemoKosisClient,
  loadDemoCorpCodes,
  isDemoDbAvailable,
} from '@/infra/demo-client.js';
import type { RegisteredTool } from './registry.js';
import {
  RESOLVE_COMPANY_DESCRIPTION,
  GET_FINANCIAL_STATEMENTS_DESCRIPTION,
  GET_COMPANY_INFO_DESCRIPTION,
  GET_STOCK_PRICE_DESCRIPTION,
  GET_HISTORICAL_PRICES_DESCRIPTION,
  GET_MARKET_INDEX_DESCRIPTION,
} from './descriptions/korean-tools.js';
import {
  GET_ECONOMIC_INDICATOR_DESCRIPTION,
  GET_KEY_STATISTICS_DESCRIPTION,
  SEARCH_BOK_TABLES_DESCRIPTION,
} from './descriptions/bok-tools.js';
import {
  GET_KOSIS_DATA_DESCRIPTION,
  SEARCH_KOSIS_TABLES_DESCRIPTION,
} from './descriptions/kosis-tools.js';

import { renderSparkline } from '@/utils/sparkline.js';
import { logger } from '@/utils/logger.js';
import { homedir } from 'node:os';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Lazy singleton clients
// ---------------------------------------------------------------------------

let _dartClient: DartClientLike | null = null;
function getDartClient(): DartClientLike {
  if (!_dartClient) {
    _dartClient = new OpenDartClient();
  }
  return _dartClient;
}

let _kisClient: KisClientLike | null = null;
function getKisClient(): KisClientLike {
  if (!_kisClient) {
    _kisClient = new KISClient();
  }
  return _kisClient;
}

let _bokClient: BokClientLike | null = null;
function getBokClient(): BokClientLike {
  if (!_bokClient) {
    _bokClient = new BokClient();
  }
  return _bokClient;
}

let _kosisClient: KosisClientLike | null = null;
function getKosisClient(): KosisClientLike {
  if (!_kosisClient) {
    _kosisClient = new KosisClient();
  }
  return _kosisClient;
}

/**
 * Override the DART client (used for testing with fixtures).
 */
export function setDartClient(client: DartClientLike): void {
  _dartClient = client;
}

/**
 * Override the KIS client (used for testing with fixtures).
 */
export function setKisClient(client: KisClientLike): void {
  _kisClient = client;
}

/**
 * Override the BOK client (used for testing with fixtures).
 */
export function setBokClient(client: BokClientLike): void {
  _bokClient = client;
}

/**
 * Override the KOSIS client (used for testing with fixtures).
 */
export function setKosisClient(client: KosisClientLike): void {
  _kosisClient = client;
}

let _demoMode = false;

/**
 * Enable or disable demo mode (creates all tools regardless of API keys).
 */
export function setDemoMode(enabled: boolean): void {
  _demoMode = enabled;
}

/**
 * Reset clients to null (cleanup after fixture mode).
 */
export function resetClients(): void {
  _dartClient = null;
  _kisClient = null;
  _bokClient = null;
  _kosisClient = null;
  _resolver = null;
  _resolverInitialized = false;
  _demoMode = false;
}

let _resolver: CorpCodeResolver | null = null;
let _resolverInitialized = false;

async function getResolver(): Promise<CorpCodeResolver> {
  if (!_resolver) {
    _resolver = new CorpCodeResolver();
  }
  if (!_resolverInitialized) {
    _resolverInitialized = true;
    const cachePath = join(homedir(), '.korean-dexter', 'corp-codes.json');
    const cached = await _resolver.loadFromCache(cachePath);

    if (!cached) {
      const apiKey = process.env.OPENDART_API_KEY;
      if (apiKey) {
        logger.info('Corp code cache not found. Auto-downloading from OpenDART...');
        await _resolver.loadFromApi(apiKey);
        await _resolver.saveToCache(cachePath);
        logger.info(`Corp codes saved to ${cachePath} (${_resolver.count} entries)`);
      }
    }
  }
  return _resolver;
}

/**
 * Pre-populate the resolver with fixture data (for demo mode).
 */
export function setResolverData(mappings: ReadonlyArray<{ corp_code: string; corp_name: string; stock_code: string }>): void {
  if (!_resolver) {
    _resolver = new CorpCodeResolver();
  }
  // Convert to CorpMapping format with empty modify_date
  const corpMappings = mappings.map(m => ({
    corp_code: m.corp_code,
    corp_name: m.corp_name,
    stock_code: m.stock_code,
    modify_date: '',
  }));
  _resolver.loadFromData(corpMappings);
  _resolverInitialized = true;
}

/**
 * Auto-detect demo mode: if NO API keys are configured AND the demo
 * SQLite database exists, inject demo clients and activate demo mode.
 * Returns true if demo mode was activated.
 */
export function initDemoMode(): boolean {
  const hasAnyKey =
    checkOpenDartApiKey() ||
    checkKisCredentials() ||
    checkBokApiKey() ||
    checkKosisApiKey();

  if (hasAnyKey) return false;
  if (!isDemoDbAvailable()) return false;

  _demoMode = true;
  setDartClient(new DemoDartClient());
  setKisClient(new DemoKisClient());
  setBokClient(new DemoBokClient());
  setKosisClient(new DemoKosisClient());

  // Seed CorpCodeResolver from demo SQLite
  const mappings = loadDemoCorpCodes();
  if (mappings.length > 0) {
    setResolverData(mappings);
  }

  return true;
}

/**
 * Check if demo mode is currently active.
 */
export function isDemoMode(): boolean {
  return _demoMode;
}

// ---------------------------------------------------------------------------
// Tool factories
// ---------------------------------------------------------------------------

function createResolveCompanyTool(): RegisteredTool {
  const resolveCompany = tool(
    async (input: { query: string }): Promise<string> => {
      const resolver = await getResolver();

      if (!resolver.isLoaded) {
        return JSON.stringify({
          error: true,
          message:
            'Corp code data not loaded. Please download corp code data first: ' +
            'run the data download command to populate ~/.korean-dexter/corp-codes.json',
        });
      }

      const result = resolver.resolve(input.query);

      if (!result) {
        return JSON.stringify({
          error: true,
          message: `No matching company found for "${input.query}". Try a different name, ticker, or corp_code.`,
        });
      }

      return JSON.stringify({
        corp_code: result.corp_code,
        corp_name: result.corp_name,
        stock_code: result.stock_code,
        confidence: result.confidence,
        matchType: result.matchType,
        alternatives: result.alternatives,
      });
    },
    {
      name: 'resolve_company',
      description:
        'Resolve company name, ticker, or corp_code to OpenDART identifiers. ' +
        'MUST call this first before using any other financial tool. ' +
        'Returns corp_code (8-digit) and stock_code (6-digit ticker).',
      schema: z.object({
        query: z
          .string()
          .describe(
            'Company name (삼성전자), 6-digit ticker (005930), or 8-digit corp_code (00126380)'
          ),
      }),
    }
  );

  return {
    name: 'resolve_company',
    tool: resolveCompany,
    description: RESOLVE_COMPANY_DESCRIPTION,
  };
}

function createGetFinancialStatementsTool(): RegisteredTool {
  const currentYear = new Date().getFullYear();
  const defaultYear = String(currentYear - 1);

  const financialStatements = tool(
    async (input: {
      corp_code: string;
      year?: string;
      report_code?: string;
      fs_div?: 'CFS' | 'OFS';
    }): Promise<string> => {
      const client = getDartClient();
      const year = input.year ?? defaultYear;
      const reportCode = input.report_code ?? '11011';
      const fsDiv = input.fs_div;

      const result = await getFinancialStatements(
        client,
        input.corp_code,
        year,
        reportCode,
        fsDiv
      );

      if (!result.success || !result.data) {
        const err = formatKoreanError(result.error?.code ?? 'API_ERROR', 'get_financial_statements', result.error?.message);
        return JSON.stringify({ error: true, ...err });
      }

      const data = result.data;
      const formattedItems = data.items.map((item) => ({
        accountName: item.accountName,
        category: item.normalizedCategory,
        currentPeriod: item.currentAmount.displayValue,
        previousPeriod: item.previousAmount.displayValue,
      }));

      // Compute derived financial ratios from raw values
      const rawValues: Record<string, number | null> = {};
      for (const item of data.items) {
        if (item.normalizedCategory) {
          rawValues[item.normalizedCategory] = item.currentAmount.value;
        }
      }

      const derivedRatios: Record<string, string> = {};
      const revenue = rawValues['revenue'];
      const operatingIncome = rawValues['operating_income'];
      const netIncome = rawValues['net_income'];
      const totalLiabilities = rawValues['total_liabilities'];
      const totalEquity = rawValues['total_equity'];

      if (revenue && revenue !== 0 && operatingIncome != null) {
        derivedRatios['영업이익률'] = `${((operatingIncome / revenue) * 100).toFixed(1)}%`;
      }
      if (revenue && revenue !== 0 && netIncome != null) {
        derivedRatios['순이익률'] = `${((netIncome / revenue) * 100).toFixed(1)}%`;
      }
      if (totalEquity && totalEquity !== 0 && totalLiabilities != null) {
        derivedRatios['부채비율'] = `${((totalLiabilities / totalEquity) * 100).toFixed(1)}%`;
      }

      // CFS/OFS fallback warning: if user didn't request OFS explicitly but got OFS data
      const usedFallback = data.fsDiv === 'OFS' && fsDiv === undefined;

      const response: Record<string, unknown> = {
        corpCode: data.corpCode,
        corpName: data.corpName,
        period: data.period.label,
        periodEn: data.period.labelEn,
        fsDiv: data.fsDiv === 'CFS' ? '연결' : '별도',
        items: formattedItems,
        ...(Object.keys(derivedRatios).length > 0 && { derivedRatios }),
      };

      if (usedFallback) {
        response.warning = '연결재무제표를 찾을 수 없어 별도재무제표를 사용했습니다.';
        response.usedFallback = true;
      }

      return JSON.stringify(response);
    },
    {
      name: 'get_financial_statements',
      description:
        'Get key financial statement items (revenue, OI, NI, assets, etc.) from OpenDART. ' +
        'Requires corp_code from resolve_company. Defaults to consolidated (CFS) and most recent annual.',
      schema: z.object({
        corp_code: z
          .string()
          .describe('8-digit OpenDART corp code from resolve_company'),
        year: z
          .string()
          .optional()
          .describe(
            `Business year (default: "${defaultYear}", most recent annual)`
          ),
        report_code: z
          .string()
          .optional()
          .describe(
            'DART report code: "11011" annual (default), "11012" H1, "11013" Q1, "11014" Q3'
          ),
        fs_div: z
          .enum(['CFS', 'OFS'])
          .optional()
          .describe(
            'Financial statement division: "CFS" consolidated (default) or "OFS" separate'
          ),
      }),
    }
  );

  return {
    name: 'get_financial_statements',
    tool: financialStatements,
    description: GET_FINANCIAL_STATEMENTS_DESCRIPTION,
  };
}

function createGetCompanyInfoTool(): RegisteredTool {
  const companyInfo = tool(
    async (input: { corp_code: string }): Promise<string> => {
      const client = getDartClient();
      const result = await getCompanyInfo(client, input.corp_code);

      if (!result.success || !result.data) {
        const err = formatKoreanError(result.error?.code ?? 'API_ERROR', 'get_company_info', result.error?.message);
        return JSON.stringify({ error: true, ...err });
      }

      const data = result.data;
      const corpClassMap: Record<string, string> = {
        Y: 'KOSPI',
        K: 'KOSDAQ',
        N: 'KONEX',
        E: '기타',
      };

      return JSON.stringify({
        corpCode: data.corpCode,
        corpName: data.corpName,
        corpNameEn: data.corpNameEn,
        ceoName: data.ceoName,
        market: corpClassMap[data.corpClass] ?? data.corpClass,
        industryCode: data.indutyCode,
        establishDate: data.establishDate,
        fiscalYearEndMonth: data.accountMonth,
      });
    },
    {
      name: 'get_company_info',
      description:
        'Get company overview from OpenDART: name, CEO, market listing, industry, establishment date. ' +
        'Requires corp_code from resolve_company.',
      schema: z.object({
        corp_code: z
          .string()
          .describe('8-digit OpenDART corp code from resolve_company'),
      }),
    }
  );

  return {
    name: 'get_company_info',
    tool: companyInfo,
    description: GET_COMPANY_INFO_DESCRIPTION,
  };
}

function createGetStockPriceTool(): RegisteredTool {
  const stockPrice = tool(
    async (input: { stock_code: string }): Promise<string> => {
      const client = getKisClient();
      const result = await getStockPrice(client, input.stock_code);

      if (!result.success || !result.data) {
        const err = formatKoreanError(result.error?.code ?? 'API_ERROR', 'get_stock_price', result.error?.message);
        return JSON.stringify({ error: true, ...err });
      }

      const data = result.data;
      const d = data.details;
      return JSON.stringify({
        stockCode: data.stockCode,
        name: data.name,
        industry: d.industry,
        market: d.market,
        currentPrice: data.currentPrice.displayValue,
        change: data.change.displayValue,
        changePercent: `${data.changePercent >= 0 ? '+' : ''}${data.changePercent.toFixed(2)}%`,
        volume: data.volume.toLocaleString('en-US'),
        tradingValue: data.tradingValue.displayValue,
        marketCap: data.marketCap.displayValue,
        todayOpen: data.open.displayValue,
        todayHigh: data.high.displayValue,
        todayLow: data.low.displayValue,
        w52High: data.w52High.displayValue,
        w52HighDate: data.w52HighDate,
        w52Low: data.w52Low.displayValue,
        w52LowDate: data.w52LowDate,
        per: data.per,
        pbr: data.pbr,
        eps: data.eps.toLocaleString('en-US'),
        bps: data.bps.toLocaleString('en-US'),
        foreignOwnershipRate: `${data.foreignOwnershipRate}%`,
        foreignNetBuy: data.foreignNetBuy.toLocaleString('en-US'),
        institutionalNetBuy: data.institutionalNetBuy.toLocaleString('en-US'),
        isMarketOpen: data.isMarketOpen,
        details: {
          listedShares: d.listedShares.toLocaleString('en-US'),
          foreignHoldings: d.foreignHoldings.toLocaleString('en-US'),
          faceValue: d.faceValue.toLocaleString('en-US'),
          volumeTurnoverRate: `${d.volumeTurnoverRate}%`,
          creditBalanceRate: `${d.creditBalanceRate}%`,
          ytdHigh: d.ytdHigh.displayValue,
          ytdHighDate: d.ytdHighDate,
          ytdLow: d.ytdLow.displayValue,
          ytdLowDate: d.ytdLowDate,
          upperLimit: d.upperLimit.displayValue,
          lowerLimit: d.lowerLimit.displayValue,
          basePrice: d.basePrice.displayValue,
          newHighLowFlag: d.newHighLowFlag,
          investmentCaution: d.investmentCaution,
          marketWarning: d.marketWarning,
          shortTermOverheat: d.shortTermOverheat,
          viTriggered: d.viTriggered,
          shortSellingAvailable: d.shortSellingAvailable,
        },
      });
    },
    {
      name: 'get_stock_price',
      description:
        'Get current stock price from KIS API. Returns price, change, volume, market cap. ' +
        'Requires 6-digit stock_code (ticker) from resolve_company.',
      schema: z.object({
        stock_code: z
          .string()
          .describe(
            '6-digit KRX stock code (e.g., "005930" for Samsung Electronics)'
          ),
      }),
    }
  );

  return {
    name: 'get_stock_price',
    tool: stockPrice,
    description: GET_STOCK_PRICE_DESCRIPTION,
  };
}

function createGetHistoricalPricesTool(): RegisteredTool {
  const historicalPrices = tool(
    async (input: {
      stock_code: string;
      start_date?: string;
      end_date?: string;
      period?: 'D' | 'W' | 'M';
    }): Promise<string> => {
      const client = getKisClient();
      const result = await getHistoricalPrices(client, input.stock_code, {
        startDate: input.start_date,
        endDate: input.end_date,
        period: input.period,
      });

      if (!result.success || !result.data) {
        const err = formatKoreanError(result.error?.code ?? 'API_ERROR', 'get_historical_prices', result.error?.message);
        return JSON.stringify({ error: true, ...err });
      }

      const data = result.data;

      // Reverse to chronological order (KIS returns newest-first)
      const chronological = [...data.prices].reverse();

      // Build summary stats + sparkline if we have data
      let summary: Record<string, unknown> | undefined;
      if (chronological.length >= 2) {
        const closingPrices = chronological.map((p) => p.close);
        const volumes = chronological.map((p) => p.volume);

        const firstClose = closingPrices[0];
        const lastClose = closingPrices[closingPrices.length - 1];
        const returnPct =
          firstClose !== 0
            ? ((lastClose - firstClose) / firstClose) * 100
            : 0;

        // Find highest/lowest closing prices
        let highIdx = 0;
        let lowIdx = 0;
        for (let i = 1; i < closingPrices.length; i++) {
          if (closingPrices[i] > closingPrices[highIdx]) highIdx = i;
          if (closingPrices[i] < closingPrices[lowIdx]) lowIdx = i;
        }

        const avgVolume = Math.round(
          volumes.reduce((a, b) => a + b, 0) / volumes.length
        );

        summary = {
          dateRange: `${chronological[0].date} ~ ${chronological[chronological.length - 1].date}`,
          returnPercent: `${returnPct >= 0 ? '+' : ''}${returnPct.toFixed(2)}%`,
          highestClose: {
            date: chronological[highIdx].date,
            price: closingPrices[highIdx].toLocaleString('en-US'),
          },
          lowestClose: {
            date: chronological[lowIdx].date,
            price: closingPrices[lowIdx].toLocaleString('en-US'),
          },
          averageVolume: avgVolume.toLocaleString('en-US'),
          closingPriceChart: renderSparkline(closingPrices),
        };
      }

      return JSON.stringify({
        stockCode: data.stockCode,
        period: data.period,
        count: data.prices.length,
        ...(summary && { summary }),
        prices: data.prices.map((p) => ({
          date: p.date,
          open: p.open,
          high: p.high,
          low: p.low,
          close: p.close,
          volume: p.volume,
        })),
      });
    },
    {
      name: 'get_historical_prices',
      description:
        'Get historical daily/weekly/monthly OHLCV price data from KIS API. ' +
        'Requires 6-digit stock_code. Defaults to daily data for last 90 days.',
      schema: z.object({
        stock_code: z.string().describe('6-digit KRX stock code'),
        start_date: z
          .string()
          .optional()
          .describe('Start date in YYYYMMDD format (default: 90 days ago)'),
        end_date: z
          .string()
          .optional()
          .describe('End date in YYYYMMDD format (default: today)'),
        period: z
          .enum(['D', 'W', 'M'])
          .optional()
          .describe('"D" daily (default), "W" weekly, "M" monthly'),
      }),
    }
  );

  return {
    name: 'get_historical_prices',
    tool: historicalPrices,
    description: GET_HISTORICAL_PRICES_DESCRIPTION,
  };
}

function createGetMarketIndexTool(): RegisteredTool {
  const marketIndex = tool(
    async (input: { index_code?: string }): Promise<string> => {
      const client = getKisClient();
      const indexCode = input.index_code ?? '0001';
      const result = await getMarketIndex(client, indexCode);

      if (!result.success || !result.data) {
        const err = formatKoreanError(result.error?.code ?? 'API_ERROR', 'get_market_index', result.error?.message);
        return JSON.stringify({ error: true, ...err });
      }

      const data = result.data;
      return JSON.stringify({
        indexCode: data.indexCode,
        indexName: data.indexName,
        currentValue: data.currentValue.toFixed(2),
        change: `${data.change >= 0 ? '+' : ''}${data.change.toFixed(2)}`,
        changePercent: `${data.changePercent >= 0 ? '+' : ''}${data.changePercent.toFixed(2)}%`,
        volume: data.volume.toLocaleString('en-US'),
        isMarketOpen: data.isMarketOpen,
      });
    },
    {
      name: 'get_market_index',
      description:
        'Get KOSPI or KOSDAQ market index value from KIS API. ' +
        'Default: KOSPI ("0001"). For KOSDAQ use "1001".',
      schema: z.object({
        index_code: z
          .string()
          .optional()
          .describe(
            'Index code: "0001" for KOSPI (default), "1001" for KOSDAQ'
          ),
      }),
    }
  );

  return {
    name: 'get_market_index',
    tool: marketIndex,
    description: GET_MARKET_INDEX_DESCRIPTION,
  };
}

// ---------------------------------------------------------------------------
// BOK ECOS tool factories
// ---------------------------------------------------------------------------

function createGetEconomicIndicatorTool(): RegisteredTool {
  const bokIndicatorNames = Object.values(BOK_INDICATORS)
    .map((i) => `${i.name}(${i.table})`)
    .join(', ');

  const economicIndicator = tool(
    async (input: {
      table_code: string;
      item_code: string;
      period_type: string;
      start_date: string;
      end_date: string;
    }): Promise<string> => {
      const client = getBokClient();
      const result = await getEconomicIndicator(
        client,
        input.table_code,
        input.item_code,
        input.period_type,
        input.start_date,
        input.end_date
      );

      if (!result.success || !result.data) {
        const err = formatKoreanError(result.error?.code ?? 'API_ERROR', 'get_economic_indicator', result.error?.message);
        return JSON.stringify({ error: true, ...err });
      }

      const data = result.data;
      return JSON.stringify({
        statCode: data.statCode,
        statName: data.statName,
        itemName: data.itemName,
        unit: data.unit,
        count: data.values.length,
        values: data.values.map((v) => ({
          period: v.period.label,
          periodEn: v.period.labelEn,
          value: v.displayValue,
        })),
      });
    },
    {
      name: 'get_economic_indicator',
      description:
        'Get economic indicators from BOK ECOS (Bank of Korea). ' +
        `Common: ${bokIndicatorNames}. ` +
        'Use search_bok_tables to find table codes for other indicators.',
      schema: z.object({
        table_code: z
          .string()
          .describe('BOK statistical table code (e.g., "722Y001" for base rate)'),
        item_code: z
          .string()
          .describe('Item code within the table (e.g., "0101000"). Use "*" for all items'),
        period_type: z
          .string()
          .describe('"A" annual, "Q" quarterly, "M" monthly, "D" daily'),
        start_date: z
          .string()
          .describe('Start date matching period type (annual="2020", monthly="202001", quarterly="2020Q1")'),
        end_date: z
          .string()
          .describe('End date matching period type'),
      }),
    }
  );

  return {
    name: 'get_economic_indicator',
    tool: economicIndicator,
    description: GET_ECONOMIC_INDICATOR_DESCRIPTION,
  };
}

function createGetKeyStatisticsTool(): RegisteredTool {
  const keyStatistics = tool(
    async (): Promise<string> => {
      const client = getBokClient();
      const result = await getKeyStatisticsList(client);

      if (!result.success || !result.data) {
        const err = formatKoreanError(result.error?.code ?? 'API_ERROR', 'get_key_statistics', result.error?.message);
        return JSON.stringify({ error: true, ...err });
      }

      const data = result.data;
      return JSON.stringify({
        totalCount: data.totalCount,
        items: data.items.map((item) => ({
          category: item.className,
          name: item.name,
          value: item.value,
          unit: item.unit,
          cycle: item.cycle,
          time: item.time,
        })),
      });
    },
    {
      name: 'get_key_statistics',
      description:
        'Get top 100 key economic indicators from BOK ECOS at a glance. ' +
        'No input required. Returns latest values for major macro indicators.',
      schema: z.object({}),
    }
  );

  return {
    name: 'get_key_statistics',
    tool: keyStatistics,
    description: GET_KEY_STATISTICS_DESCRIPTION,
  };
}

function createSearchBokTablesTool(): RegisteredTool {
  const searchBokTables = tool(
    async (input: { query: string }): Promise<string> => {
      const client = getBokClient();
      const result = await searchStatisticTables(client, input.query);

      if (!result.success || !result.data) {
        const err = formatKoreanError(result.error?.code ?? 'API_ERROR', 'search_bok_tables', result.error?.message);
        return JSON.stringify({ error: true, ...err });
      }

      const data = result.data;
      return JSON.stringify({
        totalCount: data.totalCount,
        tables: data.tables.map((t) => ({
          statCode: t.statCode,
          statName: t.statName,
          cycle: t.cycle,
          searchable: t.searchable,
          orgName: t.orgName,
        })),
      });
    },
    {
      name: 'search_bok_tables',
      description:
        'Search BOK ECOS statistical tables by keyword. ' +
        'Use this to find table codes before calling get_economic_indicator.',
      schema: z.object({
        query: z
          .string()
          .describe('Search keyword in Korean or English (e.g., "금리", "환율", "GDP")'),
      }),
    }
  );

  return {
    name: 'search_bok_tables',
    tool: searchBokTables,
    description: SEARCH_BOK_TABLES_DESCRIPTION,
  };
}

// ---------------------------------------------------------------------------
// KOSIS tool factories
// ---------------------------------------------------------------------------

function createGetKosisDataTool(): RegisteredTool {
  const kosisTableNames = Object.values(KOSIS_TABLES)
    .map((t) => `${t.name}(${t.id})`)
    .join(', ');

  const kosisData = tool(
    async (input: {
      table_id: string;
      org_id?: string;
      period_type?: string;
      start_period?: string;
      end_period?: string;
      item_id?: string;
      obj_l1?: string;
      obj_l2?: string;
    }): Promise<string> => {
      const client = getKosisClient();
      const result = await getKosisData(client, input.table_id, {
        orgId: input.org_id,
        periodType: input.period_type,
        startPeriod: input.start_period,
        endPeriod: input.end_period,
        itemId: input.item_id,
        objL1: input.obj_l1,
        objL2: input.obj_l2,
      });

      if (!result.success || !result.data) {
        const err = formatKoreanError(result.error?.code ?? 'API_ERROR', 'get_kosis_data', result.error?.message);
        return JSON.stringify({ error: true, ...err });
      }

      const data = result.data;
      return JSON.stringify({
        tableId: data.tableId,
        tableName: data.tableName,
        totalCount: data.totalCount,
        items: data.items.map((item) => ({
          itemName: item.itemName,
          period: item.period,
          value: item.value,
          unit: item.unit,
          dimensions: item.dimensions.map((d) => d.name).join(' > ') || undefined,
        })),
      });
    },
    {
      name: 'get_kosis_data',
      description:
        'Get statistical data from KOSIS (Korean Statistical Information Service). ' +
        `Common tables: ${kosisTableNames}. ` +
        'Use search_kosis_tables to find table IDs for other statistics.',
      schema: z.object({
        table_id: z
          .string()
          .describe('KOSIS table ID (e.g., "DT_1B040A3" for population census)'),
        org_id: z
          .string()
          .optional()
          .describe('Organization ID that publishes the table'),
        period_type: z
          .string()
          .optional()
          .describe('"Y" yearly, "Q" quarterly, "M" monthly'),
        start_period: z
          .string()
          .optional()
          .describe('Start period (e.g., "2020" for annual, "202401" for monthly)'),
        end_period: z
          .string()
          .optional()
          .describe('End period'),
        item_id: z
          .string()
          .optional()
          .describe('Specific item ID filter'),
        obj_l1: z
          .string()
          .optional()
          .describe('Level 1 classification filter'),
        obj_l2: z
          .string()
          .optional()
          .describe('Level 2 classification filter'),
      }),
    }
  );

  return {
    name: 'get_kosis_data',
    tool: kosisData,
    description: GET_KOSIS_DATA_DESCRIPTION,
  };
}

function createSearchKosisTablesTool(): RegisteredTool {
  const searchKosisTbls = tool(
    async (input: { query: string; org_id?: string }): Promise<string> => {
      const client = getKosisClient();
      const result = await searchKosisTables(client, input.query, input.org_id);

      if (!result.success || !result.data) {
        const err = formatKoreanError(result.error?.code ?? 'API_ERROR', 'search_kosis_tables', result.error?.message);
        return JSON.stringify({ error: true, ...err });
      }

      const data = result.data;
      return JSON.stringify({
        totalCount: data.totalCount,
        tables: data.tables.map((t) => ({
          tableId: t.tableId,
          tableName: t.tableName,
          orgId: t.orgId,
          periodType: t.periodType,
        })),
      });
    },
    {
      name: 'search_kosis_tables',
      description:
        'Search KOSIS statistical tables by keyword. ' +
        'Use this to find table IDs before calling get_kosis_data.',
      schema: z.object({
        query: z
          .string()
          .describe('Search keyword in Korean or English (e.g., "인구", "고용", "무역")'),
        org_id: z
          .string()
          .optional()
          .describe('Optional organization ID to filter results'),
      }),
    }
  );

  return {
    name: 'search_kosis_tables',
    tool: searchKosisTbls,
    description: SEARCH_KOSIS_TABLES_DESCRIPTION,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create all available Korean financial tools based on configured API keys.
 * Tools for unavailable APIs are silently excluded (no crash).
 * In demo mode, all tools are created regardless of API keys.
 */
export function createKoreanFinancialTools(): RegisteredTool[] {
  // Auto-detect demo mode on first tool creation
  initDemoMode();

  const tools: RegisteredTool[] = [];

  // resolve_company is always available (uses local data, no API key needed)
  tools.push(createResolveCompanyTool());

  // OpenDART tools — require OPENDART_API_KEY (or demo mode)
  if (_demoMode || checkOpenDartApiKey()) {
    tools.push(createGetFinancialStatementsTool());
    tools.push(createGetCompanyInfoTool());
  }

  // KIS tools — require KIS_APP_KEY + KIS_APP_SECRET (or demo mode)
  if (_demoMode || checkKisCredentials()) {
    tools.push(createGetStockPriceTool());
    tools.push(createGetHistoricalPricesTool());
    tools.push(createGetMarketIndexTool());
  }

  // BOK ECOS tools — require BOK_API_KEY (or demo mode)
  if (_demoMode || checkBokApiKey()) {
    tools.push(createGetEconomicIndicatorTool());
    tools.push(createGetKeyStatisticsTool());
    tools.push(createSearchBokTablesTool());
  }

  // KOSIS tools — require KOSIS_API_KEY (or demo mode)
  if (_demoMode || checkKosisApiKey()) {
    tools.push(createGetKosisDataTool());
    tools.push(createSearchKosisTablesTool());
  }

  return tools;
}
