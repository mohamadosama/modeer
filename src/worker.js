/**
 * Modeer Cloudflare Worker
 * Bridges Modeer SPA frontend with Cloudflare D1 database.
 */

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders,
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsHeaders(request);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    // API Routes
    if (url.pathname.startsWith('/api/')) {
      try {
        // Health check
        if (url.pathname === '/api/health') {
          return jsonResponse({ status: 'ok', edge: true, time: new Date().toISOString() }, 200, cors);
        }

        // List companies
        if (url.pathname === '/api/companies' && request.method === 'GET') {
          const { results } = await env.DB.prepare(
            'SELECT id, name, base_currency, created_at FROM companies ORDER BY name ASC'
          ).all();
          return jsonResponse({ companies: results || [] }, 200, cors);
        }

        // Create company
        if (url.pathname === '/api/companies' && request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const id = String(body.id || body.name || '').trim().slice(0, 50);
          const name = String(body.name || id).trim().slice(0, 80);
          const baseCurrency = String(body.base_currency || 'USD').toUpperCase().slice(0, 3);

          if (!id) {
            return jsonResponse({ error: 'Company id or name is required' }, 400, cors);
          }

          await env.DB.prepare(
            'INSERT OR REPLACE INTO companies (id, name, base_currency) VALUES (?, ?, ?)'
          ).bind(id, name, baseCurrency).run();

          return jsonResponse({ success: true, company: { id, name, base_currency: baseCurrency } }, 201, cors);
        }

        // Fetch company data
        if (url.pathname === '/api/data' && request.method === 'GET') {
          const company = url.searchParams.get('company') || 'Tijarahub';
          const { results } = await env.DB.prepare(
            'SELECT key, value FROM company_storage WHERE company = ?'
          ).bind(company).all();

          const data = {};
          if (results && results.length) {
            for (const row of results) {
              data[row.key] = row.value;
            }
          }

          return jsonResponse({ company, count: Object.keys(data).length, data }, 200, cors);
        }

        // Save company data (full or delta snapshot)
        if (url.pathname === '/api/data' && (request.method === 'POST' || request.method === 'PUT')) {
          const company = url.searchParams.get('company') || 'Tijarahub';
          const body = await request.json().catch(() => ({}));
          const payload = body.data || body;

          if (!payload || typeof payload !== 'object') {
            return jsonResponse({ error: 'Invalid data payload' }, 400, cors);
          }

          const entries = Object.entries(payload).filter(([k]) => k.startsWith('acc_') || k.startsWith('disk_') || k.startsWith('co_'));
          if (entries.length === 0) {
            return jsonResponse({ success: true, updated: 0 }, 200, cors);
          }

          // Ensure company exists in companies table
          await env.DB.prepare(
            'INSERT OR IGNORE INTO companies (id, name) VALUES (?, ?)'
          ).bind(company, company).run();

          // Batch insert / replace in D1 (chunks of 50 to respect D1 limits)
          const CHUNK_SIZE = 50;
          for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
            const chunk = entries.slice(i, i + CHUNK_SIZE);
            const stmts = chunk.map(([k, v]) =>
              env.DB.prepare(
                'INSERT OR REPLACE INTO company_storage (company, key, value, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)'
              ).bind(company, k, typeof v === 'string' ? v : JSON.stringify(v))
            );
            await env.DB.batch(stmts);
          }

          return jsonResponse({ success: true, company, updated: entries.length }, 200, cors);
        }

        return jsonResponse({ error: 'API route not found' }, 404, cors);
      } catch (err) {
        return jsonResponse({ error: err.message || 'Internal Server Error' }, 500, cors);
      }
    }

    // Serve static assets (public/index.html, etc.)
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not found', { status: 404 });
  },
};
