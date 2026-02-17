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
import { CorpCodeResolver } from '@/mapping/corp-code-resolver.js';
import {
  checkOpenDartApiKey,
  checkKisCredentials,
} from '@/utils/env.js';
import { formatKoreanError } from '@/tools/error-messages.js';
import type { RegisteredTool } from './registry.js';
import {
  RESOLVE_COMPANY_DESCRIPTION,
  GET_FINANCIAL_STATEMENTS_DESCRIPTION,
  GET_COMPANY_INFO_DESCRIPTION,
  GET_STOCK_PRICE_DESCRIPTION,
  GET_HISTORICAL_PRICES_DESCRIPTION,
  GET_MARKET_INDEX_DESCRIPTION,
} from './descriptions/korean-tools.js';

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
 * Reset clients to null (cleanup after fixture mode).
 */
export function resetClients(): void {
  _dartClient = null;
  _kisClient = null;
  _resolver = null;
  _resolverInitialized = false;
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

      // CFS/OFS fallback warning: if user didn't request OFS explicitly but got OFS data
      const usedFallback = data.fsDiv === 'OFS' && fsDiv === undefined;

      const response: Record<string, unknown> = {
        corpCode: data.corpCode,
        corpName: data.corpName,
        period: data.period.label,
        periodEn: data.period.labelEn,
        fsDiv: data.fsDiv === 'CFS' ? '연결' : '별도',
        items: formattedItems,
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
      return JSON.stringify({
        stockCode: data.stockCode,
        name: data.name,
        currentPrice: data.currentPrice.displayValue,
        change: data.change.displayValue,
        changePercent: `${data.changePercent >= 0 ? '+' : ''}${data.changePercent.toFixed(2)}%`,
        volume: data.volume.toLocaleString('en-US'),
        marketCap: data.marketCap.displayValue,
        high: data.high.displayValue,
        low: data.low.displayValue,
        open: data.open.displayValue,
        isMarketOpen: data.isMarketOpen,
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
      return JSON.stringify({
        stockCode: data.stockCode,
        period: data.period,
        count: data.prices.length,
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
// Public API
// ---------------------------------------------------------------------------

/**
 * Create all available Korean financial tools based on configured API keys.
 * Tools for unavailable APIs are silently excluded (no crash).
 */
export function createKoreanFinancialTools(): RegisteredTool[] {
  const tools: RegisteredTool[] = [];

  // resolve_company is always available (uses local data, no API key needed)
  tools.push(createResolveCompanyTool());

  // OpenDART tools — require OPENDART_API_KEY
  if (checkOpenDartApiKey()) {
    tools.push(createGetFinancialStatementsTool());
    tools.push(createGetCompanyInfoTool());
  }

  // KIS tools — require KIS_APP_KEY + KIS_APP_SECRET
  if (checkKisCredentials()) {
    tools.push(createGetStockPriceTool());
    tools.push(createGetHistoricalPricesTool());
    tools.push(createGetMarketIndexTool());
  }

  return tools;
}
