import { buildCacheKey } from './cache-key';

interface Env {
  DB: D1Database;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: CORS_HEADERS,
  });
}

function errorResponse(message: string, status = 500): Response {
  return jsonResponse({ error: message }, status);
}

async function handleLookup(url: URL, env: Env): Promise<Response> {
  const api = url.searchParams.get('api');
  const endpoint = url.searchParams.get('endpoint');

  if (!api || !endpoint) {
    return errorResponse('Missing required query params: api, endpoint', 400);
  }

  const extraParams: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) {
    if (key !== 'api' && key !== 'endpoint') {
      extraParams[key] = value;
    }
  }

  const cacheKey = buildCacheKey(api, endpoint, extraParams);

  try {
    const row = await env.DB.prepare(
      'SELECT data, source, created_at FROM responses WHERE key = ?'
    )
      .bind(cacheKey)
      .first<{ data: string; source: string; created_at: string }>();

    if (!row) {
      return errorResponse(`No data found for key: ${cacheKey}`, 404);
    }

    return jsonResponse({
      key: cacheKey,
      data: JSON.parse(row.data),
      source: row.source,
      created_at: row.created_at,
    });
  } catch (err) {
    return errorResponse(`DB error: ${String(err)}`);
  }
}

async function handleCorps(url: URL, env: Env): Promise<Response> {
  const limit = parseInt(url.searchParams.get('limit') ?? '100', 10);
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);

  try {
    const result = await env.DB.prepare(
      'SELECT corp_code, corp_name, stock_code, modify_date FROM corp_mappings LIMIT ? OFFSET ?'
    )
      .bind(limit, offset)
      .all<{ corp_code: string; corp_name: string; stock_code: string; modify_date: string }>();

    const countRow = await env.DB.prepare('SELECT COUNT(*) as total FROM corp_mappings')
      .first<{ total: number }>();

    return jsonResponse({
      total: countRow?.total ?? 0,
      limit,
      offset,
      items: result.results,
    });
  } catch (err) {
    return errorResponse(`DB error: ${String(err)}`);
  }
}

async function handleCorpsSearch(url: URL, env: Env): Promise<Response> {
  const q = url.searchParams.get('q');
  if (!q) {
    return errorResponse('Missing required query param: q', 400);
  }

  try {
    const result = await env.DB.prepare(
      'SELECT corp_code, corp_name, stock_code, modify_date FROM corp_mappings WHERE corp_name LIKE ? LIMIT 50'
    )
      .bind(`${q}%`)
      .all<{ corp_code: string; corp_name: string; stock_code: string; modify_date: string }>();

    return jsonResponse({
      query: q,
      items: result.results,
    });
  } catch (err) {
    return errorResponse(`DB error: ${String(err)}`);
  }
}

async function handleStats(env: Env): Promise<Response> {
  try {
    const [responsesCount, corpsCount, latestRow] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) as total FROM responses').first<{ total: number }>(),
      env.DB.prepare('SELECT COUNT(*) as total FROM corp_mappings').first<{ total: number }>(),
      env.DB.prepare('SELECT MAX(created_at) as latest FROM responses').first<{ latest: string | null }>(),
    ]);

    return jsonResponse({
      responses: responsesCount?.total ?? 0,
      corp_mappings: corpsCount?.total ?? 0,
      latest_response_at: latestRow?.latest ?? null,
    });
  } catch (err) {
    return errorResponse(`DB error: ${String(err)}`);
  }
}

function handleHealth(): Response {
  return jsonResponse({ status: 'ok', timestamp: new Date().toISOString() });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (pathname === '/lookup') {
      return handleLookup(url, env);
    }

    if (pathname === '/corps/search') {
      return handleCorpsSearch(url, env);
    }

    if (pathname === '/corps') {
      return handleCorps(url, env);
    }

    if (pathname === '/stats') {
      return handleStats(env);
    }

    if (pathname === '/health') {
      return handleHealth();
    }

    return errorResponse('Not found', 404);
  },
};
