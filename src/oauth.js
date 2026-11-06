/**
 * Modeer OAuth 2.0 Server Implementation (RFC 6749, RFC 7636 PKCE, RFC 8414)
 * Enables zero-trust, browser-based web authentication for ChatGPT, Claude, and AI Assistants.
 */

// Helper: Base64URL encode buffer
function base64UrlEncode(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Verify PKCE code_verifier against code_challenge
async function verifyPkce(verifier, challenge, method = 'S256') {
  if (!challenge) return true; // No PKCE requested
  if (!verifier) return false;

  if (method === 'plain') {
    return verifier === challenge;
  }

  // Default: S256
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const calculatedChallenge = base64UrlEncode(hash);
  return calculatedChallenge === challenge;
}

// Render the authorization HTML page
export function renderAuthorizeHtml({ clientId, redirectUri, state, scope, codeChallenge, codeChallengeMethod, companies, activeUser, error }) {
  const compOptions = companies.map(c => 
    `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)} (${escapeHtml(c.base_currency || 'USD')})</option>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>تفويض الوصول لنظام مدير | Modeer AI Authorization</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #1b4166;
      --primary-dark: #0f263e;
      --accent: #2563eb;
      --accent-hover: #1d4ed8;
      --bg: #f8fafc;
      --card: #ffffff;
      --border: #e2e8f0;
      --text: #0f172a;
      --text-muted: #64748b;
      --success: #15803d;
      --danger: #b91c1c;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Cairo', system-ui, -apple-system, sans-serif;
      background: linear-gradient(135deg, #13304d, #1b4166);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .auth-card {
      background: var(--card);
      width: 100%;
      max-width: 460px;
      border-radius: 20px;
      box-shadow: 0 20px 25px -5px rgba(0,0,0,0.25), 0 8px 10px -6px rgba(0,0,0,0.2);
      padding: 32px;
      position: relative;
    }
    .logo-header {
      text-align: center;
      margin-bottom: 24px;
    }
    .logo-badge {
      display: inline-block;
      background: #eff6ff;
      color: var(--accent);
      padding: 6px 16px;
      border-radius: 9999px;
      font-size: 13px;
      font-weight: 700;
      margin-bottom: 8px;
    }
    h1 {
      font-size: 20px;
      font-weight: 800;
      color: #0f263e;
      margin-bottom: 6px;
    }
    p.subtitle {
      font-size: 13.5px;
      color: var(--text-muted);
      line-height: 1.6;
    }
    .client-badge {
      background: #f1f5f9;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 12px 16px;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .client-icon {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      background: #10a37f;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 18px;
    }
    .client-info h3 {
      font-size: 14px;
      font-weight: 700;
      color: #0f172a;
    }
    .client-info p {
      font-size: 12px;
      color: var(--text-muted);
      direction: ltr;
      text-align: right;
    }
    .scopes-list {
      background: #f8fafc;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 14px;
      margin-bottom: 20px;
    }
    .scopes-title {
      font-size: 13px;
      font-weight: 700;
      margin-bottom: 8px;
      color: #334155;
    }
    .scope-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12.5px;
      color: #475569;
      margin-bottom: 6px;
    }
    .scope-item:last-child { margin-bottom: 0; }
    .scope-check {
      color: var(--success);
      font-weight: bold;
    }
    .form-group {
      margin-bottom: 16px;
      text-align: right;
    }
    label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: #334155;
      margin-bottom: 6px;
    }
    input, select {
      width: 100%;
      padding: 11px 14px;
      border: 1.5px solid var(--border);
      border-radius: 10px;
      font-family: inherit;
      font-size: 14px;
      color: #0f172a;
      outline: none;
      transition: border-color 0.15s ease;
      background: #fff;
    }
    input:focus, select:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px rgba(37,99,235,0.12);
    }
    .btn-submit {
      width: 100%;
      padding: 13px;
      background: var(--primary);
      color: white;
      border: none;
      border-radius: 12px;
      font-family: inherit;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.15s ease;
      margin-top: 8px;
    }
    .btn-submit:hover {
      background: var(--primary-dark);
    }
    .btn-cancel {
      width: 100%;
      padding: 10px;
      background: transparent;
      color: var(--text-muted);
      border: none;
      font-family: inherit;
      font-size: 13.5px;
      font-weight: 600;
      cursor: pointer;
      margin-top: 8px;
      text-decoration: none;
      display: block;
      text-align: center;
    }
    .btn-cancel:hover {
      color: var(--danger);
    }
    .alert-error {
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: var(--danger);
      padding: 10px 14px;
      border-radius: 10px;
      font-size: 13px;
      margin-bottom: 16px;
      text-align: right;
    }
    .user-pill {
      background: #e0f2fe;
      color: #0369a1;
      padding: 4px 10px;
      border-radius: 6px;
      font-weight: 700;
      font-size: 12px;
      display: inline-block;
      margin-bottom: 12px;
    }
  </style>
</head>
<body>
  <div class="auth-card">
    <div class="logo-header">
      <div class="logo-badge">نظام مدير ERP • تكامل الذكاء الاصطناعي</div>
      <h1>تفويض وصول المساعد الذكي</h1>
      <p class="subtitle">يطلب الروبوت صلاحية قراءة واستعراض الحسابات وإعداد قيود اليومية المحاسبية نيابة عنك.</p>
    </div>

    <div class="client-badge">
      <div class="client-icon">AI</div>
      <div class="client-info">
        <h3>${escapeHtml(clientId || 'ChatGPT / Claude Assistant')}</h3>
        <p>Model Context Protocol Client</p>
      </div>
    </div>

    ${error ? `<div class="alert-error">${escapeHtml(error)}</div>` : ''}

    <form method="POST" action="/oauth/authorize">
      <input type="hidden" name="client_id" value="${escapeHtml(clientId || '')}">
      <input type="hidden" name="redirect_uri" value="${escapeHtml(redirectUri || '')}">
      <input type="hidden" name="state" value="${escapeHtml(state || '')}">
      <input type="hidden" name="scope" value="${escapeHtml(scope || 'read write')}">
      <input type="hidden" name="code_challenge" value="${escapeHtml(codeChallenge || '')}">
      <input type="hidden" name="code_challenge_method" value="${escapeHtml(codeChallengeMethod || '')}">

      ${activeUser ? `
        <div style="margin-bottom: 16px; text-align: right;">
          <span class="user-pill">مسجل دخول كـ: ${escapeHtml(activeUser.username)}</span>
          <input type="hidden" name="logged_in_user" value="${escapeHtml(activeUser.username)}">
        </div>
      ` : `
        <div class="form-group">
          <label>اسم المستخدم (Username):</label>
          <input type="text" name="username" required autocomplete="username" placeholder="مثال: admin أو mohamadosama">
        </div>
        <div class="form-group">
          <label>كلمة السر (Password):</label>
          <input type="password" name="password" required autocomplete="current-password" placeholder="••••••••">
        </div>
      `}

      <div class="form-group">
        <label>الشركة المراد ربطها مع الروبوت (Select Company):</label>
        <select name="company" required>
          ${compOptions}
        </select>
      </div>

      <div class="scopes-list">
        <div class="scopes-title">الصلاحيات الممنوحة للروبوت:</div>
        <div class="scope-item"><span class="scope-check">✓</span> استعراض دليل الحسابات وأرصدة الأستاذ العام</div>
        <div class="scope-item"><span class="scope-check">✓</span> إعداد ومراجعة قيود اليومية (مسودة Draft)</div>
        <div class="scope-item"><span class="scope-check">✓</span> استخراج حركة الخزينة والبنوك والتقارير المالية</div>
      </div>

      <button type="submit" class="btn-submit">تفويض وسماح بالوصول (Authorize)</button>
      <a href="${escapeHtml(redirectUri || '#')}?error=access_denied&state=${escapeHtml(state || '')}" class="btn-cancel">إلغاء والعودة</a>
    </form>
  </div>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Handle GET & POST /oauth/authorize
 */
export async function handleAuthorizeRequest(request, env, authenticateRequest, resolveCompanyId, verifyPassword) {
  const url = new URL(request.url);

  // 1. GET Request: Render Authorization Form
  if (request.method === 'GET') {
    const clientId = url.searchParams.get('client_id') || 'chatgpt-modeer';
    const redirectUri = url.searchParams.get('redirect_uri') || '';
    const state = url.searchParams.get('state') || '';
    const scope = url.searchParams.get('scope') || 'read write';
    const codeChallenge = url.searchParams.get('code_challenge') || '';
    const codeChallengeMethod = url.searchParams.get('code_challenge_method') || 'S256';

    const activeUser = await authenticateRequest(request, env);

    const { results: companies } = await env.DB.prepare(
      'SELECT id, name, base_currency FROM companies ORDER BY name ASC'
    ).all();

    const html = renderAuthorizeHtml({
      clientId,
      redirectUri,
      state,
      scope,
      codeChallenge,
      codeChallengeMethod,
      companies: companies || [],
      activeUser,
      error: url.searchParams.get('error_msg') || null
    });

    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    });
  }

  // 2. POST Request: Process Form Submission & Issue Authorization Code
  if (request.method === 'POST') {
    let formData;
    try {
      formData = await request.formData();
    } catch (e) {
      const json = await request.json().catch(() => ({}));
      formData = new Map(Object.entries(json));
    }

    const clientId = String(formData.get('client_id') || 'chatgpt-modeer').trim();
    const redirectUri = String(formData.get('redirect_uri') || '').trim();
    const state = String(formData.get('state') || '').trim();
    const scope = String(formData.get('scope') || 'read write').trim();
    const codeChallenge = String(formData.get('code_challenge') || '').trim();
    const codeChallengeMethod = String(formData.get('code_challenge_method') || 'S256').trim();
    const companyInput = String(formData.get('company') || 'Commerc Of Agency').trim();
    const company = await resolveCompanyId(env, companyInput);

    let username = '';
    let role = 'admin';
    let userId = 'user';

    const activeUser = await authenticateRequest(request, env);
    if (activeUser && (formData.get('logged_in_user') === activeUser.username)) {
      username = activeUser.username;
      role = activeUser.role || 'admin';
      userId = activeUser.user_id || 'user';
    } else {
      const u = String(formData.get('username') || '').trim();
      const p = String(formData.get('password') || '');

      if (!u || !p) {
        return new Response(null, {
          status: 302,
          headers: {
            'Location': `/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}&error_msg=${encodeURIComponent('يرجى إدخال اسم المستخدم وكلمة السر')}`
          }
        });
      }

      // Verify user from company_storage
      const row = await env.DB.prepare('SELECT value FROM company_storage WHERE company = ? AND key = ?').bind(company, 'acc_users').first();
      let authenticated = false;
      if (row && row.value) {
        try {
          const users = JSON.parse(row.value);
          if (Array.isArray(users)) {
            const match = users.find(x => (x.name || x.user || x.u || x.username || '').toLowerCase() === u.toLowerCase());
            if (match) {
              const ok = await verifyPassword(p, match.pw || match.p || match.password);
              if (ok) {
                authenticated = true;
                username = match.name || match.user || match.u || match.username || u;
                role = match.role || match.r || 'admin';
                userId = String(match.id || username);
              }
            }
          }
        } catch (e) {}
      }

      if (!authenticated) {
        return new Response(null, {
          status: 302,
          headers: {
            'Location': `/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}&company=${encodeURIComponent(company)}&error_msg=${encodeURIComponent('اسم المستخدم أو كلمة السر غير صحيحة لهذه الشركة')}`
          }
        });
      }
    }

    // Generate single-use authorization code
    const authCode = `modeer_code_${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

    await env.DB.prepare(`
      INSERT INTO oauth_codes (code, client_id, user_id, username, company, role, redirect_uri, code_challenge, code_challenge_method, scope, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      authCode, clientId, userId, username, company, role, redirectUri,
      codeChallenge || null, codeChallengeMethod || 'S256', scope, expiresAt
    ).run();

    // Redirect to redirect_uri with code & state
    let target = redirectUri;
    const delim = target.includes('?') ? '&' : '?';
    target += `${delim}code=${encodeURIComponent(authCode)}`;
    if (state) {
      target += `&state=${encodeURIComponent(state)}`;
    }

    return new Response(null, {
      status: 302,
      headers: {
        'Location': target,
        'Cache-Control': 'no-store'
      }
    });
  }

  return new Response('Method Not Allowed', { status: 405 });
}

/**
 * Handle POST /oauth/token (Exchange Code for Bearer Token)
 */
export async function handleTokenRequest(request, env, cors) {
  let body = {};
  const contentType = request.headers.get('Content-Type') || '';

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const text = await request.text();
    const params = new URLSearchParams(text);
    params.forEach((v, k) => { body[k] = v; });
  } else {
    body = await request.json().catch(() => ({}));
  }

  const grantType = body.grant_type || '';

  if (grantType === 'authorization_code') {
    const code = String(body.code || '').trim();
    const clientSecret = body.client_secret || '';
    const codeVerifier = body.code_verifier || '';
    const redirectUri = body.redirect_uri || '';

    if (!code) {
      return new Response(JSON.stringify({
        error: 'invalid_request',
        error_description: 'Missing code parameter'
      }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors } });
    }

    // Look up authorization code in D1
    const codeRow = await env.DB.prepare(`
      SELECT * FROM oauth_codes WHERE code = ? AND expires_at > datetime('now')
    `).bind(code).first();

    if (!codeRow) {
      return new Response(JSON.stringify({
        error: 'invalid_grant',
        error_description: 'Authorization code is invalid or has expired.'
      }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors } });
    }

    // Verify PKCE if code_challenge was provided
    if (codeRow.code_challenge) {
      const validPkce = await verifyPkce(codeVerifier, codeRow.code_challenge, codeRow.code_challenge_method);
      if (!validPkce) {
        return new Response(JSON.stringify({
          error: 'invalid_grant',
          error_description: 'PKCE code_verifier verification failed.'
        }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors } });
      }
    }

    // Burn code (single use)
    await env.DB.prepare('DELETE FROM oauth_codes WHERE code = ?').bind(code).run().catch(() => {});

    // Generate Access Token (30-day validity) and Refresh Token
    const accessToken = `modeer_at_${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`;
    const refreshToken = `modeer_rt_${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`;
    const expiresInSeconds = 30 * 24 * 3600; // 30 days
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

    // Store in sessions table
    await env.DB.prepare(`
      INSERT INTO sessions (token, company, user_id, username, role, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
    `).bind(accessToken, codeRow.company, codeRow.user_id, codeRow.username, codeRow.role, expiresAt).run();

    return new Response(JSON.stringify({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: expiresInSeconds,
      refresh_token: refreshToken,
      scope: codeRow.scope || 'read write',
      company: codeRow.company,
      username: codeRow.username
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Pragma': 'no-cache',
        ...cors
      }
    });
  }

  return new Response(JSON.stringify({
    error: 'unsupported_grant_type',
    error_description: `Grant type '${grantType}' is not supported. Use 'authorization_code'.`
  }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors } });
}

/**
 * Handle RFC 8414 OAuth 2.0 Authorization Server Metadata
 */
export function handleOAuthMetadata(request, cors) {
  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;

  return new Response(JSON.stringify({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    userinfo_endpoint: `${baseUrl}/api/auth/me`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic', 'none'],
    code_challenge_methods_supported: ['S256', 'plain'],
    scopes_supported: ['read', 'write']
  }, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      ...cors
    }
  });
}
