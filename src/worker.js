/**
 * Modeer Cloudflare Worker
 * Bridges Modeer SPA frontend with Cloudflare D1 database.
 * Includes server-side session authentication & RBAC protection.
 */

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Allow-Credentials': 'true',
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

/**
 * RFC 7807 Problem Details for HTTP APIs
 */
function problemDetails(title, status, detail, instance, errors = [], extraHeaders = {}) {
  const payload = {
    type: `https://modeer.workers.dev/errors/${status}`,
    title,
    status,
    detail,
    instance,
    timestamp: new Date().toISOString()
  };
  if (errors && errors.length) payload.errors = errors;

  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/problem+json; charset=utf-8',
      ...extraHeaders,
    },
  });
}

/**
 * Verify user password against stored PBKDF2 hash
 */
async function verifyPassword(password, pwRecord) {
  if (!pwRecord || !pwRecord.salt || !pwRecord.hash) return false;
  try {
    const salt = Uint8Array.from(atob(pwRecord.salt), (c) => c.charCodeAt(0));
    const iter = pwRecord.iter || 120000;
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        hash: 'SHA-256',
        salt,
        iterations: iter,
      },
      keyMaterial,
      256
    );
    const hashBase64 = btoa(String.fromCharCode(...new Uint8Array(derivedBits)));
    return hashBase64 === pwRecord.hash;
  } catch (e) {
    return false;
  }
}

/**
 * Extract session token from cookie or Authorization header
 */
function getSessionToken(request) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(/modeer_session=([a-zA-Z0-9_\-]+)/);
  if (match) return match[1];

  const authHeader = request.headers.get('Authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  return null;
}

/**
 * Validate session against D1 sessions table
 */
async function authenticateRequest(request, env) {
  const token = getSessionToken(request);
  if (!token) return null;

  try {
    const session = await env.DB.prepare(
      'SELECT token, company, user_id, username, role, expires_at FROM sessions WHERE token = ? AND expires_at > datetime("now")'
    ).bind(token).first();
    return session || null;
  } catch (e) {
    return null;
  }
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

        // ----------------- Auth API -----------------

        // 1. Login endpoint (server-side verification)
        if (url.pathname === '/api/auth/login' && request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const username = String(body.username || '').trim();
          const password = String(body.password || '');
          const company = String(body.company || '').trim() || 'Tijarahub';

          if (!username || !password) {
            return jsonResponse({ error: 'Username and password are required' }, 400, cors);
          }

          // Fetch users list from D1 for this company
          const row = await env.DB.prepare(
            'SELECT value FROM company_storage WHERE company = ? AND key = ?'
          ).bind(company, 'acc_users').first();

          if (!row || !row.value) {
            return jsonResponse({ error: 'اسم المستخدم أو كلمة السر غير صحيحة' }, 401, cors);
          }

          let users = [];
          try {
            users = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
          } catch (e) {
            return jsonResponse({ error: 'اسم المستخدم أو كلمة السر غير صحيحة' }, 401, cors);
          }

          const user = users.find(
            (u) => u.name && u.name.toLowerCase() === username.toLowerCase()
          );

          if (!user) {
            return jsonResponse({ error: 'اسم المستخدم أو كلمة السر غير صحيحة' }, 401, cors);
          }

          const valid = await verifyPassword(password, user.pw);
          if (!valid) {
            return jsonResponse({ error: 'اسم المستخدم أو كلمة السر غير صحيحة' }, 401, cors);
          }

          // Generate random session token
          const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
          const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

          await env.DB.prepare(
            'INSERT INTO sessions (token, company, user_id, username, role, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
          ).bind(token, company, String(user.id), user.name, user.role || 'admin', expiresAt).run();

          const cookie = `modeer_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`;

          return jsonResponse(
            {
              success: true,
              user: { id: user.id, name: user.name, role: user.role || 'admin' },
              company,
              token,
            },
            200,
            {
              ...cors,
              'Set-Cookie': cookie,
            }
          );
        }

        // 2. Current user session verification
        if (url.pathname === '/api/auth/me' && request.method === 'GET') {
          const session = await authenticateRequest(request, env);
          if (!session) {
            return jsonResponse({ authenticated: false }, 200, cors);
          }
          return jsonResponse(
            {
              authenticated: true,
              user: { id: session.user_id, name: session.username, role: session.role },
              company: session.company,
            },
            200,
            cors
          );
        }

        // 3. Logout endpoint
        if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
          const token = getSessionToken(request);
          if (token) {
            await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run().catch(() => {});
          }
          const clearCookie = `modeer_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
          return jsonResponse({ success: true }, 200, { ...cors, 'Set-Cookie': clearCookie });
        }

        // ----------------- Company Management -----------------

        // List companies (public list of company names for selector)
        if (url.pathname === '/api/companies' && request.method === 'GET') {
          const { results } = await env.DB.prepare(
            'SELECT id, name, base_currency, created_at FROM companies ORDER BY name ASC'
          ).all();
          return jsonResponse({ companies: results || [] }, 200, cors);
        }

        // Create company (requires active session)
        if (url.pathname === '/api/companies' && request.method === 'POST') {
          const session = await authenticateRequest(request, env);
          if (!session) {
            return jsonResponse({ error: 'Authentication required' }, 401, cors);
          }

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

        // ----------------- Protected Company Data API -----------------

        // Fetch company data (PROTECTED: requires active session)
        if (url.pathname === '/api/data' && request.method === 'GET') {
          const session = await authenticateRequest(request, env);
          if (!session) {
            return jsonResponse({ error: 'Authentication required. Please log in.' }, 401, cors);
          }

          const company = url.searchParams.get('company') || session.company || 'Tijarahub';
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

        // Save company data (PROTECTED: requires active session)
        if (url.pathname === '/api/data' && (request.method === 'POST' || request.method === 'PUT')) {
          const session = await authenticateRequest(request, env);
          if (!session) {
            return jsonResponse({ error: 'Authentication required. Please log in.' }, 401, cors);
          }

          const company = url.searchParams.get('company') || session.company || 'Tijarahub';
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

        // ----------------- Relational Accounting API (v2) -----------------

        // Helper: Validate voucher lines (Balance & Chart of Accounts existence)
        async function validateVoucherLines(company, lines) {
          if (!Array.isArray(lines) || lines.length < 2) {
            return {
              valid: false,
              title: 'Double-Entry Violation',
              error: 'A voucher must have at least 2 journal lines (Double-entry principle).',
              errors: [{ field: 'lines', message: 'At least 2 lines are required.' }]
            };
          }

          let totDr = 0;
          let totCr = 0;
          const codes = [];

          for (let i = 0; i < lines.length; i++) {
            const l = lines[i];
            const dr = Number(l.base_debit || l.dr || 0);
            const cr = Number(l.base_credit || l.cr || 0);
            totDr += dr;
            totCr += cr;
            const c = String(l.account_code || l.code || l.gl || '').trim();
            if (!c) {
              return {
                valid: false,
                title: 'Missing Account Code',
                error: `Line ${i + 1} does not specify an account code.`,
                errors: [{ field: `lines[${i}].account_code`, message: 'Account code is required.' }]
              };
            }
            codes.push(c);
          }

          if (Math.abs(totDr - totCr) > 0.005) {
            return {
              valid: false,
              title: 'Voucher Out of Balance',
              error: `Voucher is not balanced: Total Debits (${totDr.toFixed(2)}) != Total Credits (${totCr.toFixed(2)}). Difference: ${(totDr - totCr).toFixed(4)}`,
              errors: [
                { field: 'total_debit', message: `Total debit is ${totDr.toFixed(2)}` },
                { field: 'total_credit', message: `Total credit is ${totCr.toFixed(2)}` },
                { field: 'imbalance', message: `Imbalance is ${(totDr - totCr).toFixed(4)}` }
              ]
            };
          }

          const uniqueCodes = [...new Set(codes)];
          for (const code of uniqueCodes) {
            const acc = await env.DB.prepare(
              'SELECT code, is_active FROM accounts WHERE company_id = ? AND (code = ? OR name = ?)'
            ).bind(company, code, code).first();

            if (!acc) {
              return {
                valid: false,
                title: 'Unknown Account Code',
                error: `Account "${code}" does not exist in Chart of Accounts for company "${company}".`,
                errors: [{ field: 'account_code', message: `Account "${code}" not found in COA.` }]
              };
            }
            if (acc.is_active === 0) {
              return {
                valid: false,
                title: 'Inactive Account Code',
                error: `Account "${code}" is deactivated and cannot accept new ledger postings.`,
                errors: [{ field: 'account_code', message: `Account "${code}" is deactivated.` }]
              };
            }
          }

          return { valid: true, totDr, totCr };
        }

        // Helper: Compute next sequential voucher number
        async function getNextVoucherNo(company) {
          const row = await env.DB.prepare(
            'SELECT voucher_no FROM vouchers WHERE company_id = ? ORDER BY CAST(voucher_no AS INTEGER) DESC LIMIT 1'
          ).bind(company).first();

          if (!row || !row.voucher_no) return '1';
          const num = parseInt(row.voucher_no, 10);
          return isNaN(num) ? String(Date.now()).slice(-6) : String(num + 1);
        }

        // 1. Accounts (COA) - GET with Cursor Pagination
        if (url.pathname === '/api/v2/accounts' && request.method === 'GET') {
          const session = await authenticateRequest(request, env);
          if (!session) return problemDetails('Unauthorized', 401, 'Authentication required to access Chart of Accounts.', url.pathname, [], cors);
          const company = url.searchParams.get('company') || session.company || 'Tijarahub';
          const limitParam = parseInt(url.searchParams.get('limit') || '50', 10);
          const limit = isNaN(limitParam) ? 50 : Math.min(Math.max(limitParam, 1), 200);
          const cursor = url.searchParams.get('cursor');

          let query = 'SELECT code, name, name_ar as ar, classification as cls, sub, parent_code, is_active as active FROM accounts WHERE company_id = ?';
          const params = [company];

          if (cursor) {
            query += ' AND code > ?';
            params.push(cursor);
          }
          query += ' ORDER BY code ASC LIMIT ?';
          params.push(limit + 1);

          const { results } = await env.DB.prepare(query).bind(...params).all();
          const rows = results || [];
          let nextCursor = null;
          let pageRows = rows;

          if (rows.length > limit) {
            pageRows = rows.slice(0, limit);
            nextCursor = pageRows[pageRows.length - 1].code;
          }

          return jsonResponse({
            company,
            limit,
            nextCursor,
            data: pageRows,
            accounts: pageRows
          }, 200, cors);
        }

        // 2. Accounts (COA) - POST (Create / Update)
        if (url.pathname === '/api/v2/accounts' && request.method === 'POST') {
          const session = await authenticateRequest(request, env);
          if (!session) return problemDetails('Unauthorized', 401, 'Authentication required.', url.pathname, [], cors);
          const company = url.searchParams.get('company') || session.company || 'Tijarahub';
          const body = await request.json().catch(() => ({}));
          const code = String(body.code || '').trim();
          const name = String(body.name || '').trim();
          const cls = String(body.cls || body.classification || 'Asset').trim();
          const ar = String(body.ar || body.name_ar || '').trim();
          const sub = String(body.sub || '').trim();
          const active = body.active === false || body.is_active === 0 ? 0 : 1;

          if (!code || !name) {
            return problemDetails('Validation Failed', 400, 'Account code and name are required.', url.pathname, [
              { field: 'code', message: 'Account code is required' },
              { field: 'name', message: 'Account name is required' }
            ], cors);
          }

          const accId = `${company}_${code}`;
          const parent = code.length > 2 ? code.slice(0, -2) : '';

          await env.DB.prepare(
            'INSERT OR REPLACE INTO accounts (id, company_id, code, name, name_ar, classification, sub, parent_code, is_active, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)'
          ).bind(accId, company, code, name, ar, cls, sub, parent, active).run();

          return jsonResponse({ success: true, account: { code, name, cls, ar, active } }, 200, cors);
        }

        // 3. Accounts (COA) - DELETE (Safe Delete with Foreign Key Referential Guardrail)
        if (url.pathname.startsWith('/api/v2/accounts/') && request.method === 'DELETE') {
          const session = await authenticateRequest(request, env);
          if (!session) return problemDetails('Unauthorized', 401, 'Authentication required.', url.pathname, [], cors);
          const company = url.searchParams.get('company') || session.company || 'Tijarahub';
          const code = decodeURIComponent(url.pathname.replace('/api/v2/accounts/', '')).trim();

          // Referential Integrity Guardrail: Prevent deleting if referenced by any voucher lines
          const refCheck = await env.DB.prepare(
            'SELECT COUNT(*) as cnt FROM voucher_lines WHERE company_id = ? AND account_code = ?'
          ).bind(company, code).first();

          if (refCheck && refCheck.cnt > 0) {
            return problemDetails(
              'Referential Integrity Conflict',
              409,
              `Cannot delete account "${code}": It is referenced by ${refCheck.cnt} historical journal lines. To retire this account, deactivate it instead.`,
              url.pathname,
              [{ field: 'code', message: `Referenced by ${refCheck.cnt} journal lines.` }],
              cors
            );
          }

          await env.DB.prepare('DELETE FROM accounts WHERE company_id = ? AND code = ?').bind(company, code).run();
          return jsonResponse({ success: true, deletedCode: code }, 200, cors);
        }

        // 4. Vouchers - GET (List with Cursor Pagination & Status Filtering)
        if (url.pathname === '/api/v2/vouchers' && request.method === 'GET') {
          const session = await authenticateRequest(request, env);
          if (!session) return problemDetails('Unauthorized', 401, 'Authentication required.', url.pathname, [], cors);
          const company = url.searchParams.get('company') || session.company || 'Tijarahub';
          const vNo = url.searchParams.get('v');
          const status = url.searchParams.get('status'); // 'draft', 'posted', 'cancelled'

          if (vNo) {
            const vHeader = await env.DB.prepare(
              'SELECT * FROM vouchers WHERE company_id = ? AND voucher_no = ?'
            ).bind(company, vNo).first();
            if (!vHeader) {
              return problemDetails('Not Found', 404, `Voucher #${vNo} not found in company "${company}".`, url.pathname, [], cors);
            }
            const { results: lines } = await env.DB.prepare(
              'SELECT * FROM voucher_lines WHERE company_id = ? AND voucher_id = ? ORDER BY line_no ASC'
            ).bind(company, vHeader.id).all();
            return jsonResponse({ voucher: vHeader, lines: lines || [] }, 200, {
              ETag: `W/"v${vHeader.version || 1}"`,
              ...cors
            });
          }

          const limitParam = parseInt(url.searchParams.get('limit') || '50', 10);
          const limit = isNaN(limitParam) ? 50 : Math.min(Math.max(limitParam, 1), 200);
          const cursor = url.searchParams.get('cursor');

          let query = 'SELECT * FROM vouchers WHERE company_id = ?';
          const params = [company];

          if (status) {
            query += ' AND status = ?';
            params.push(status);
          }

          if (cursor) {
            const cursorNum = parseInt(cursor, 10);
            if (!isNaN(cursorNum)) {
              query += ' AND CAST(voucher_no AS INTEGER) < ?';
              params.push(cursorNum);
            }
          }

          query += ' ORDER BY CAST(voucher_no AS INTEGER) DESC LIMIT ?';
          params.push(limit + 1);

          const { results: vouchers } = await env.DB.prepare(query).bind(...params).all();
          const vList = vouchers || [];
          let nextCursor = null;
          let pageVouchers = vList;

          if (vList.length > limit) {
            pageVouchers = vList.slice(0, limit);
            nextCursor = String(pageVouchers[pageVouchers.length - 1].voucher_no);
          }

          let lines = [];
          if (pageVouchers.length > 0) {
            const placeholders = pageVouchers.map(() => '?').join(',');
            const vIds = pageVouchers.map((v) => v.id);
            const { results: lRes } = await env.DB.prepare(
              `SELECT * FROM voucher_lines WHERE company_id = ? AND voucher_id IN (${placeholders}) ORDER BY line_no ASC`
            ).bind(company, ...vIds).all();
            lines = lRes || [];
          }

          return jsonResponse({
            company,
            limit,
            nextCursor,
            data: pageVouchers,
            vouchers: pageVouchers,
            lines
          }, 200, cors);
        }

        // 5. Vouchers - GET by ID
        if (url.pathname.match(/^\/api\/v2\/vouchers\/([^/]+)$/) && request.method === 'GET') {
          const session = await authenticateRequest(request, env);
          if (!session) return problemDetails('Unauthorized', 401, 'Authentication required.', url.pathname, [], cors);
          const company = url.searchParams.get('company') || session.company || 'Tijarahub';
          const id = decodeURIComponent(url.pathname.split('/')[4]);

          const voucher = await env.DB.prepare(
            'SELECT * FROM vouchers WHERE (id = ? OR voucher_no = ?) AND company_id = ?'
          ).bind(id, id, company).first();

          if (!voucher) {
            return problemDetails('Not Found', 404, `Voucher "${id}" not found.`, url.pathname, [], cors);
          }

          const { results: lines } = await env.DB.prepare(
            'SELECT * FROM voucher_lines WHERE voucher_id = ? ORDER BY line_no ASC'
          ).bind(voucher.id).all();

          return jsonResponse({ voucher, lines: lines || [] }, 200, {
            ETag: `W/"v${voucher.version || 1}"`,
            ...cors
          });
        }

        // 6. Vouchers - POST (Create new voucher: 'draft' or 'posted' with Idempotency Support)
        if (url.pathname === '/api/v2/vouchers' && request.method === 'POST') {
          const session = await authenticateRequest(request, env);
          if (!session) return problemDetails('Unauthorized', 401, 'Authentication required.', url.pathname, [], cors);
          const company = url.searchParams.get('company') || session.company || 'Tijarahub';

          // Idempotency-Key Check
          const idempotencyKey = request.headers.get('Idempotency-Key');
          if (idempotencyKey) {
            const cached = await env.DB.prepare(
              'SELECT response_status, response_body FROM idempotency_keys WHERE key = ? AND company_id = ?'
            ).bind(idempotencyKey, company).first();
            if (cached) {
              return new Response(cached.response_body, {
                status: cached.response_status,
                headers: {
                  'Content-Type': 'application/json; charset=utf-8',
                  'X-Cache-Lookup': 'HIT',
                  ...cors
                }
              });
            }
          }

          const body = await request.json().catch(() => ({}));
          const status = body.status === 'posted' ? 'posted' : 'draft';
          const lines = Array.isArray(body.lines) ? body.lines : [];

          // If posting immediately, validate balance and account existence
          if (status === 'posted') {
            const check = await validateVoucherLines(company, lines);
            if (!check.valid) {
              return problemDetails(
                check.title || 'Unprocessable Entity',
                422,
                check.error,
                url.pathname,
                check.errors || [],
                cors
              );
            }
          }

          let vNo = String(body.voucher_no || body.v || '').trim();
          if (!vNo) {
            vNo = await getNextVoucherNo(company);
          }

          const vId = `${company}_${vNo}`;
          const vDate = body.voucher_date || body.date || new Date().toISOString().slice(0, 10);
          const vPeriod = body.period || body.p || vDate.slice(0, 7);
          const vDesc = body.description || body.notes || '';
          const vUser = session.username || 'admin';
          const postedAt = status === 'posted' ? new Date().toISOString() : null;
          const postedBy = status === 'posted' ? vUser : null;
          const amendedFrom = body.amended_from || null;

          const stmts = [
            env.DB.prepare(
              'INSERT INTO vouchers (id, company_id, voucher_no, voucher_date, period, description, created_by, status, posted_at, posted_by, amended_from, version, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)'
            ).bind(vId, company, vNo, vDate, vPeriod, vDesc, vUser, status, postedAt, postedBy, amendedFrom),
            env.DB.prepare('DELETE FROM voucher_lines WHERE voucher_id = ?').bind(vId)
          ];

          lines.forEach((l, idx) => {
            const lineId = `${vId}_${idx + 1}`;
            stmts.push(
              env.DB.prepare(
                'INSERT INTO voucher_lines (id, voucher_id, company_id, line_no, account_code, gl_name, sub_ledger, party, branch, currency, exchange_rate, original_debit, original_credit, base_debit, base_credit, notes, statement_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
              ).bind(
                lineId, vId, company, idx + 1,
                String(l.account_code || l.code || l.gl || ''),
                String(l.gl_name || l.gl || ''),
                String(l.sub_ledger || l.sl || ''),
                String(l.party || l.sup || ''),
                String(l.branch || l.br || ''),
                String(l.currency || l.cur || 'USD'),
                Number(l.exchange_rate || l.rate || 1.0),
                Number(l.original_debit || l.od || 0.0),
                Number(l.original_credit || l.oc || 0.0),
                Number(l.base_debit || l.dr || 0.0),
                Number(l.base_credit || l.cr || 0.0),
                String(l.notes || ''),
                String(l.statement_type || l.st || 'BS')
              )
            );
          });

          await env.DB.batch(stmts);

          const responsePayload = {
            id: vId,
            voucherNo: vNo,
            status,
            linesCount: lines.length,
            createdAt: new Date().toISOString(),
            version: 1
          };
          const responseBody = JSON.stringify(responsePayload);

          if (idempotencyKey) {
            try {
              await env.DB.prepare(
                'INSERT OR REPLACE INTO idempotency_keys (key, company_id, endpoint, response_status, response_body) VALUES (?, ?, ?, 201, ?)'
              ).bind(idempotencyKey, company, url.pathname, responseBody).run();
            } catch (e) {}
          }

          return jsonResponse(responsePayload, 201, {
            ETag: 'W/"v1"',
            ...cors
          });
        }

        // 7. Vouchers - PUT (Update DRAFT voucher only - Optimistic Concurrency with If-Match)
        if (url.pathname.match(/^\/api\/v2\/vouchers\/([^/]+)$/) && request.method === 'PUT') {
          const session = await authenticateRequest(request, env);
          if (!session) return problemDetails('Unauthorized', 401, 'Authentication required.', url.pathname, [], cors);
          const company = url.searchParams.get('company') || session.company || 'Tijarahub';
          const id = decodeURIComponent(url.pathname.split('/')[4]);

          const current = await env.DB.prepare(
            'SELECT * FROM vouchers WHERE (id = ? OR voucher_no = ?) AND company_id = ?'
          ).bind(id, id, company).first();

          if (!current) {
            return problemDetails('Not Found', 404, `Voucher "${id}" not found.`, url.pathname, [], cors);
          }

          // Accounting Immutability Guardrail
          if (current.status !== 'draft') {
            return problemDetails(
              'Immutable Accounting Record',
              400,
              `Cannot directly modify a ${current.status} voucher. Accounting standards require an immutable audit trail. Use Amend or Cancel instead.`,
              url.pathname,
              [{ field: 'status', message: `Current status is ${current.status}` }],
              cors
            );
          }

          // Optimistic Locking Check (If-Match header)
          const ifMatch = request.headers.get('If-Match');
          if (ifMatch) {
            const cleanMatch = ifMatch.replace(/^[Ww]\//, '').replace(/"/g, '').replace(/^v/, '').trim();
            const currentVer = String(current.version || 1);
            if (cleanMatch !== currentVer && cleanMatch !== '*') {
              return problemDetails(
                'Precondition Failed',
                412,
                `Optimistic lock failed: Voucher version is ${currentVer}, but If-Match specified "${ifMatch}". Concurrent modification prevented.`,
                url.pathname,
                [{ field: 'If-Match', message: `Mismatch: DB has v${currentVer}` }],
                cors
              );
            }
          }

          const body = await request.json().catch(() => ({}));
          const vDate = body.voucher_date || body.date || current.voucher_date;
          const vPeriod = body.period || body.p || vDate.slice(0, 7);
          const vDesc = body.description !== undefined ? body.description : current.description;
          const lines = Array.isArray(body.lines) ? body.lines : [];
          const nextVer = (current.version || 1) + 1;

          const stmts = [
            env.DB.prepare(
              'UPDATE vouchers SET voucher_date = ?, period = ?, description = ?, version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
            ).bind(vDate, vPeriod, vDesc, nextVer, current.id),
            env.DB.prepare('DELETE FROM voucher_lines WHERE voucher_id = ?').bind(current.id)
          ];

          lines.forEach((l, idx) => {
            const lineId = `${current.id}_${idx + 1}`;
            stmts.push(
              env.DB.prepare(
                'INSERT INTO voucher_lines (id, voucher_id, company_id, line_no, account_code, gl_name, sub_ledger, party, branch, currency, exchange_rate, original_debit, original_credit, base_debit, base_credit, notes, statement_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
              ).bind(
                lineId, current.id, company, idx + 1,
                String(l.account_code || l.code || l.gl || ''),
                String(l.gl_name || l.gl || ''),
                String(l.sub_ledger || l.sl || ''),
                String(l.party || l.sup || ''),
                String(l.branch || l.br || ''),
                String(l.currency || l.cur || 'USD'),
                Number(l.exchange_rate || l.rate || 1.0),
                Number(l.original_debit || l.od || 0.0),
                Number(l.original_credit || l.oc || 0.0),
                Number(l.base_debit || l.dr || 0.0),
                Number(l.base_credit || l.cr || 0.0),
                String(l.notes || ''),
                String(l.statement_type || l.st || 'BS')
              )
            );
          });

          await env.DB.batch(stmts);
          return jsonResponse({ success: true, id: current.id, version: nextVer }, 200, {
            ETag: `W/"v${nextVer}"`,
            ...cors
          });
        }

        // 8. Vouchers - POST :id/post (Transition Draft -> Posted)
        if (url.pathname.match(/^\/api\/v2\/vouchers\/([^/]+)\/post$/) && request.method === 'POST') {
          const session = await authenticateRequest(request, env);
          if (!session) return problemDetails('Unauthorized', 401, 'Authentication required.', url.pathname, [], cors);
          const company = url.searchParams.get('company') || session.company || 'Tijarahub';
          const id = decodeURIComponent(url.pathname.split('/')[4]);

          const current = await env.DB.prepare(
            'SELECT * FROM vouchers WHERE (id = ? OR voucher_no = ?) AND company_id = ?'
          ).bind(id, id, company).first();

          if (!current) return problemDetails('Not Found', 404, `Voucher "${id}" not found.`, url.pathname, [], cors);
          if (current.status === 'posted') return problemDetails('Bad Request', 400, 'Voucher is already posted.', url.pathname, [], cors);
          if (current.status === 'cancelled') return problemDetails('Bad Request', 400, 'Cannot post a cancelled voucher.', url.pathname, [], cors);

          const { results: lines } = await env.DB.prepare(
            'SELECT * FROM voucher_lines WHERE voucher_id = ? ORDER BY line_no ASC'
          ).bind(current.id).all();

          // Full balance and account validation
          const check = await validateVoucherLines(company, lines);
          if (!check.valid) {
            return problemDetails(
              check.title || 'Unprocessable Entity',
              422,
              check.error,
              url.pathname,
              check.errors || [],
              cors
            );
          }

          const now = new Date().toISOString();
          const nextVer = (current.version || 1) + 1;
          await env.DB.prepare(
            'UPDATE vouchers SET status = ?, posted_at = ?, posted_by = ?, version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
          ).bind('posted', now, session.username || 'admin', nextVer, current.id).run();

          return jsonResponse({ success: true, id: current.id, status: 'posted', postedAt: now, version: nextVer }, 200, {
            ETag: `W/"v${nextVer}"`,
            ...cors
          });
        }

        // 9. Vouchers - POST :id/cancel (Cancel Posted Voucher with Reason)
        if (url.pathname.match(/^\/api\/v2\/vouchers\/([^/]+)\/cancel$/) && request.method === 'POST') {
          const session = await authenticateRequest(request, env);
          if (!session) return problemDetails('Unauthorized', 401, 'Authentication required.', url.pathname, [], cors);
          const company = url.searchParams.get('company') || session.company || 'Tijarahub';
          const id = decodeURIComponent(url.pathname.split('/')[4]);
          const body = await request.json().catch(() => ({}));
          const reason = String(body.reason || '').trim();

          if (!reason) {
            return problemDetails('Bad Request', 400, 'Cancellation reason is mandatory for auditing compliance.', url.pathname, [
              { field: 'reason', message: 'Cancellation reason is required.' }
            ], cors);
          }

          const current = await env.DB.prepare(
            'SELECT * FROM vouchers WHERE (id = ? OR voucher_no = ?) AND company_id = ?'
          ).bind(id, id, company).first();

          if (!current) return problemDetails('Not Found', 404, `Voucher "${id}" not found.`, url.pathname, [], cors);
          if (current.status === 'cancelled') return problemDetails('Bad Request', 400, 'Voucher is already cancelled.', url.pathname, [], cors);

          const now = new Date().toISOString();
          const nextVer = (current.version || 1) + 1;
          await env.DB.prepare(
            'UPDATE vouchers SET status = ?, cancelled_at = ?, cancelled_by = ?, cancelled_reason = ?, version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
          ).bind('cancelled', now, session.username || 'admin', reason, nextVer, current.id).run();

          return jsonResponse({ success: true, id: current.id, status: 'cancelled', reason, cancelledAt: now, version: nextVer }, 200, {
            ETag: `W/"v${nextVer}"`,
            ...cors
          });
        }

        // 10. Vouchers - POST :id/amend (Amend Voucher Lifecycle)
        if (url.pathname.match(/^\/api\/v2\/vouchers\/([^/]+)\/amend$/) && request.method === 'POST') {
          const session = await authenticateRequest(request, env);
          if (!session) return problemDetails('Unauthorized', 401, 'Authentication required.', url.pathname, [], cors);
          const company = url.searchParams.get('company') || session.company || 'Tijarahub';
          const id = decodeURIComponent(url.pathname.split('/')[4]);

          const current = await env.DB.prepare(
            'SELECT * FROM vouchers WHERE (id = ? OR voucher_no = ?) AND company_id = ?'
          ).bind(id, id, company).first();

          if (!current) return problemDetails('Not Found', 404, `Voucher "${id}" not found.`, url.pathname, [], cors);

          // If original is posted, cancel it
          if (current.status === 'posted') {
            await env.DB.prepare(
              'UPDATE vouchers SET status = ?, cancelled_at = CURRENT_TIMESTAMP, cancelled_by = ?, cancelled_reason = ? WHERE id = ?'
            ).bind('cancelled', session.username || 'admin', `Amended by new draft`, current.id).run();
          }

          // Generate next voucher number
          const nextNo = await getNextVoucherNo(company);
          const newId = `${company}_${nextNo}`;
          const now = new Date().toISOString().slice(0, 10);
          const desc = `Amended from #${current.voucher_no}: ${current.description || ''}`;

          const { results: lines } = await env.DB.prepare(
            'SELECT * FROM voucher_lines WHERE voucher_id = ? ORDER BY line_no ASC'
          ).bind(current.id).all();

          const stmts = [
            env.DB.prepare(
              'INSERT INTO vouchers (id, company_id, voucher_no, voucher_date, period, description, created_by, status, amended_from, version, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)'
            ).bind(newId, company, nextNo, now, now.slice(0, 7), desc, session.username || 'admin', 'draft', current.id)
          ];

          lines.forEach((l, idx) => {
            stmts.push(
              env.DB.prepare(
                'INSERT INTO voucher_lines (id, voucher_id, company_id, line_no, account_code, gl_name, sub_ledger, party, branch, currency, exchange_rate, original_debit, original_credit, base_debit, base_credit, notes, statement_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
              ).bind(
                `${newId}_${idx + 1}`, newId, company, idx + 1,
                l.account_code, l.gl_name, l.sub_ledger, l.party, l.branch,
                l.currency, l.exchange_rate, l.original_debit, l.original_credit,
                l.base_debit, l.base_credit, l.notes, l.statement_type
              )
            );
          });

          await env.DB.batch(stmts);
          return jsonResponse({
            success: true,
            newId,
            voucherNo: nextNo,
            amendedFrom: current.voucher_no,
            status: 'draft',
            version: 1
          }, 201, {
            ETag: 'W/"v1"',
            ...cors
          });
        }

        // 11. Vouchers - DELETE (Draft Only - Auditing Guardrail)
        if (url.pathname.match(/^\/api\/v2\/vouchers\/([^/]+)$/) && request.method === 'DELETE') {
          const session = await authenticateRequest(request, env);
          if (!session) return problemDetails('Unauthorized', 401, 'Authentication required.', url.pathname, [], cors);
          const company = url.searchParams.get('company') || session.company || 'Tijarahub';
          const id = decodeURIComponent(url.pathname.split('/')[4]);

          const current = await env.DB.prepare(
            'SELECT * FROM vouchers WHERE (id = ? OR voucher_no = ?) AND company_id = ?'
          ).bind(id, id, company).first();

          if (!current) return problemDetails('Not Found', 404, `Voucher "${id}" not found.`, url.pathname, [], cors);

          if (current.status !== 'draft') {
            return problemDetails(
              'Forbidden Record Deletion',
              403,
              `Forbidden: Only draft vouchers can be deleted. Accounting records with status "${current.status}" cannot be erased. Use Cancel instead.`,
              url.pathname,
              [{ field: 'status', message: `Current status is ${current.status}` }],
              cors
            );
          }

          await env.DB.batch([
            env.DB.prepare('DELETE FROM voucher_lines WHERE voucher_id = ?').bind(current.id),
            env.DB.prepare('DELETE FROM vouchers WHERE id = ?').bind(current.id)
          ]);

          return jsonResponse({ success: true, deletedId: current.id }, 200, cors);
        }

        // 12. Live Financial Reports: Trial Balance (Posted Only)
        if (url.pathname === '/api/v2/reports/trial-balance' && request.method === 'GET') {
          const session = await authenticateRequest(request, env);
          if (!session) return problemDetails('Unauthorized', 401, 'Authentication required.', url.pathname, [], cors);
          const company = url.searchParams.get('company') || session.company || 'Tijarahub';

          const { results } = await env.DB.prepare(`
            SELECT 
              a.code, a.name, a.name_ar, a.classification,
              COALESCE(SUM(vl.base_debit), 0) as total_debit,
              COALESCE(SUM(vl.base_credit), 0) as total_credit,
              COALESCE(SUM(vl.base_debit - vl.base_credit), 0) as net_balance
            FROM accounts a
            JOIN voucher_lines vl ON a.company_id = vl.company_id AND a.code = vl.account_code
            JOIN vouchers v ON vl.voucher_id = v.id
            WHERE a.company_id = ? AND v.status = 'posted'
            GROUP BY a.code, a.name, a.name_ar, a.classification
            HAVING total_debit != 0 OR total_credit != 0
            ORDER BY a.code ASC;
          `).bind(company).all();

          let sumDr = 0;
          let sumCr = 0;
          const formattedAccounts = (results || []).map((r) => {
            sumDr += r.total_debit;
            sumCr += r.total_credit;
            return {
              code: String(r.code),
              name: r.name,
              name_ar: r.name_ar,
              classification: r.classification,
              total_debit: Number(r.total_debit.toFixed(2)),
              total_credit: Number(r.total_credit.toFixed(2)),
              net_balance: Number(r.net_balance.toFixed(2))
            };
          });

          return jsonResponse({
            company,
            total_debit: Number(sumDr.toFixed(2)),
            total_credit: Number(sumCr.toFixed(2)),
            is_balanced: Math.abs(sumDr - sumCr) < 0.005,
            accounts: formattedAccounts
          }, 200, cors);
        }

        // 13. Fixed Assets - GET
        if (url.pathname === '/api/v2/assets' && request.method === 'GET') {
          const session = await authenticateRequest(request, env);
          if (!session) return problemDetails('Unauthorized', 401, 'Authentication required.', url.pathname, [], cors);
          const company = url.searchParams.get('company') || session.company || 'Tijarahub';
          const { results } = await env.DB.prepare(
            'SELECT * FROM fixed_assets WHERE company_id = ? ORDER BY code ASC'
          ).bind(company).all();
          return jsonResponse({ company, assets: results || [] }, 200, cors);
        }

        // 14. Contacts - GET
        if (url.pathname === '/api/v2/contacts' && request.method === 'GET') {
          const session = await authenticateRequest(request, env);
          if (!session) return problemDetails('Unauthorized', 401, 'Authentication required.', url.pathname, [], cors);
          const company = url.searchParams.get('company') || session.company || 'Tijarahub';
          const { results } = await env.DB.prepare(
            'SELECT * FROM contacts WHERE company_id = ? ORDER BY name ASC'
          ).bind(company).all();
          return jsonResponse({ company, contacts: results || [] }, 200, cors);
        }

        // 15. Currencies - GET
        if (url.pathname === '/api/v2/currencies' && request.method === 'GET') {
          const session = await authenticateRequest(request, env);
          if (!session) return problemDetails('Unauthorized', 401, 'Authentication required.', url.pathname, [], cors);
          const company = url.searchParams.get('company') || session.company || 'Tijarahub';
          const { results } = await env.DB.prepare(
            'SELECT code as c, name, rate FROM currencies WHERE company_id = ? ORDER BY code ASC'
          ).bind(company).all();
          return jsonResponse({ company, currencies: results || [] }, 200, cors);
        }

        // ----------------- Protected Attachments API -----------------

        // 1. Get attachment counts (PROTECTED)
        if (url.pathname === '/api/files/counts' && request.method === 'GET') {
          const session = await authenticateRequest(request, env);
          if (!session) {
            return jsonResponse({ error: 'Authentication required' }, 401, cors);
          }

          const company = url.searchParams.get('company') || session.company || 'Tijarahub';
          const { results } = await env.DB.prepare(
            'SELECT owner, COUNT(*) as cnt FROM attachments WHERE company = ? GROUP BY owner'
          ).bind(company).all();
          const counts = {};
          for (const r of results || []) {
            counts[r.owner] = r.cnt;
          }
          return jsonResponse({ counts }, 200, cors);
        }

        // 2. Get lightweight all attachments list (PROTECTED)
        if (url.pathname === '/api/files/all' && request.method === 'GET') {
          const session = await authenticateRequest(request, env);
          if (!session) {
            return jsonResponse({ error: 'Authentication required' }, 401, cors);
          }

          const company = url.searchParams.get('company') || session.company || 'Tijarahub';
          const { results } = await env.DB.prepare(
            'SELECT id, owner FROM attachments WHERE company = ?'
          ).bind(company).all();
          return jsonResponse({ files: results || [] }, 200, cors);
        }

        // 3. Clear all attachments for company (PROTECTED - admin only)
        if (url.pathname === '/api/files/clear' && request.method === 'POST') {
          const session = await authenticateRequest(request, env);
          if (!session || session.role !== 'admin') {
            return jsonResponse({ error: 'Admin permission required' }, 403, cors);
          }

          const company = url.searchParams.get('company') || session.company || 'Tijarahub';
          await env.DB.prepare(
            'DELETE FROM attachment_chunks WHERE attachment_id IN (SELECT id FROM attachments WHERE company = ?)'
          ).bind(company).run();
          await env.DB.prepare('DELETE FROM attachments WHERE company = ?').bind(company).run();
          return jsonResponse({ success: true, company }, 200, cors);
        }

        // 4. List attachments (PROTECTED)
        if (url.pathname === '/api/files' && request.method === 'GET') {
          const session = await authenticateRequest(request, env);
          if (!session) {
            return jsonResponse({ error: 'Authentication required' }, 401, cors);
          }

          const company = url.searchParams.get('company') || session.company || 'Tijarahub';
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

        // 5. Get single attachment by ID (PROTECTED)
        if (url.pathname.startsWith('/api/files/') && request.method === 'GET') {
          const session = await authenticateRequest(request, env);
          if (!session) {
            return jsonResponse({ error: 'Authentication required' }, 401, cors);
          }

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

        // 6. Save / upload attachment (chunked Base64) (PROTECTED)
        if (url.pathname === '/api/files' && request.method === 'POST') {
          const session = await authenticateRequest(request, env);
          if (!session) {
            return jsonResponse({ error: 'Authentication required' }, 401, cors);
          }

          const body = await request.json().catch(() => ({}));
          const company = url.searchParams.get('company') || session.company || 'Tijarahub';
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

        // 7. Delete attachment by ID (PROTECTED)
        if (url.pathname.startsWith('/api/files/') && request.method === 'DELETE') {
          const session = await authenticateRequest(request, env);
          if (!session) {
            return jsonResponse({ error: 'Authentication required' }, 401, cors);
          }

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
