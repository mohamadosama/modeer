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

        // ----------------- Attachments API -----------------

        // 1. Get attachment counts
        if (url.pathname === '/api/files/counts' && request.method === 'GET') {
          const company = url.searchParams.get('company') || 'Tijarahub';
          const { results } = await env.DB.prepare(
            'SELECT owner, COUNT(*) as cnt FROM attachments WHERE company = ? GROUP BY owner'
          ).bind(company).all();
          const counts = {};
          for (const r of results || []) {
            counts[r.owner] = r.cnt;
          }
          return jsonResponse({ counts }, 200, cors);
        }

        // 2. Get lightweight all attachments list (for ID and owner mapping)
        if (url.pathname === '/api/files/all' && request.method === 'GET') {
          const company = url.searchParams.get('company') || 'Tijarahub';
          const { results } = await env.DB.prepare(
            'SELECT id, owner FROM attachments WHERE company = ?'
          ).bind(company).all();
          return jsonResponse({ files: results || [] }, 200, cors);
        }

        // 3. Clear all attachments for company
        if (url.pathname === '/api/files/clear' && request.method === 'POST') {
          const company = url.searchParams.get('company') || 'Tijarahub';
          await env.DB.prepare(
            'DELETE FROM attachment_chunks WHERE attachment_id IN (SELECT id FROM attachments WHERE company = ?)'
          ).bind(company).run();
          await env.DB.prepare('DELETE FROM attachments WHERE company = ?').bind(company).run();
          return jsonResponse({ success: true, company }, 200, cors);
        }

        // 4. List attachments for an owner (with data chunks) or all metadata
        if (url.pathname === '/api/files' && request.method === 'GET') {
          const company = url.searchParams.get('company') || 'Tijarahub';
          const owner = url.searchParams.get('owner');

          if (!owner) {
            const { results } = await env.DB.prepare(
              'SELECT id, owner, cat, name, type, size, at, created_at FROM attachments WHERE company = ? ORDER BY at DESC, created_at DESC'
            ).bind(company).all();
            return jsonResponse({ files: results || [] }, 200, cors);
          }

          const { results: meta } = await env.DB.prepare(
            'SELECT id, owner, cat, name, type, size, at FROM attachments WHERE company = ? AND owner = ? ORDER BY at DESC, created_at DESC'
          ).bind(company, owner).all();

          if (!meta || meta.length === 0) {
            return jsonResponse({ files: [] }, 200, cors);
          }

          const fileIds = meta.map((m) => m.id);
          const placeholders = fileIds.map(() => '?').join(',');
          const { results: chunks } = await env.DB.prepare(
            `SELECT attachment_id, chunk_index, data FROM attachment_chunks WHERE attachment_id IN (${placeholders}) ORDER BY attachment_id, chunk_index ASC`
          ).bind(...fileIds).all();

          const chunkMap = {};
          for (const c of chunks || []) {
            if (!chunkMap[c.attachment_id]) chunkMap[c.attachment_id] = [];
            chunkMap[c.attachment_id].push(c.data);
          }

          const files = meta.map((m) => ({
            ...m,
            data: (chunkMap[m.id] || []).join(''),
          }));

          return jsonResponse({ files }, 200, cors);
        }

        // 5. Get single attachment by ID (including data)
        if (url.pathname.startsWith('/api/files/') && request.method === 'GET') {
          const id = decodeURIComponent(url.pathname.replace('/api/files/', ''));
          const meta = await env.DB.prepare(
            'SELECT id, company, owner, cat, name, type, size, at FROM attachments WHERE id = ?'
          ).bind(id).first();

          if (!meta) {
            return jsonResponse({ error: 'File not found' }, 404, cors);
          }

          const { results: chunks } = await env.DB.prepare(
            'SELECT chunk_index, data FROM attachment_chunks WHERE attachment_id = ? ORDER BY chunk_index ASC'
          ).bind(id).all();

          const fullData = (chunks || []).map((c) => c.data).join('');
          return jsonResponse({ file: { ...meta, data: fullData } }, 200, cors);
        }

        // 6. Save / upload attachment (chunked Base64)
        if (url.pathname === '/api/files' && request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const company = url.searchParams.get('company') || body.company || 'Tijarahub';
          const id = String(body.id || ('f_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)));
          const owner = String(body.owner || '').trim();
          const name = String(body.name || 'file').trim();
          const cat = String(body.cat || '').trim();
          const type = String(body.type || 'application/octet-stream').trim();
          const size = Number(body.size || 0);
          const at = String(body.at || new Date().toISOString().slice(0, 10)).trim();
          const data = String(body.data || '');

          if (!owner) {
            return jsonResponse({ error: 'Owner is required' }, 400, cors);
          }

          // Save metadata
          await env.DB.prepare(
            'INSERT OR REPLACE INTO attachments (id, company, owner, cat, name, type, size, at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)'
          ).bind(id, company, owner, cat, name, type, size, at).run();

          // Save data chunks
          await env.DB.prepare('DELETE FROM attachment_chunks WHERE attachment_id = ?').bind(id).run();

          if (data && data.length > 0) {
            const CHUNK_LEN = 200000;
            const chunks = [];
            for (let i = 0; i < data.length; i += CHUNK_LEN) {
              chunks.push(data.slice(i, i + CHUNK_LEN));
            }

            const stmts = chunks.map((chunk, idx) =>
              env.DB.prepare(
                'INSERT INTO attachment_chunks (attachment_id, chunk_index, data) VALUES (?, ?, ?)'
              ).bind(id, idx, chunk)
            );

            for (let i = 0; i < stmts.length; i += 15) {
              await env.DB.batch(stmts.slice(i, i + 15));
            }
          }

          return jsonResponse({ success: true, id, owner }, 201, cors);
        }

        // 7. Delete attachment by ID
        if (url.pathname.startsWith('/api/files/') && request.method === 'DELETE') {
          const id = decodeURIComponent(url.pathname.replace('/api/files/', ''));
          await env.DB.prepare('DELETE FROM attachment_chunks WHERE attachment_id = ?').bind(id).run();
          await env.DB.prepare('DELETE FROM attachments WHERE id = ?').bind(id).run();
          return jsonResponse({ success: true, id }, 200, cors);
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
