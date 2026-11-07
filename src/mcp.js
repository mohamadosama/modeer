/**
 * Modeer Model Context Protocol (MCP) Server Implementation
 * Spec: Model Context Protocol (2024-11-05)
 * Compatible with Claude Desktop, Claude Code, ChatGPT Actions, Cursor, Antigravity, and AI Agents.
 */

export const MCP_SERVER_INFO = {
  name: 'modeer-mcp-server',
  version: '2.0.0',
  description: 'Enterprise ERP & Financial Accounting Model Context Protocol Server for Modeer running natively on Cloudflare Edge.'
};

export const MCP_TOOLS_DEFINITIONS = [
  {
    name: 'modeer_list_companies',
    description: 'List all companies registered in Modeer ERP with their IDs, names, base currencies, and creation timestamps.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'modeer_get_chart_of_accounts',
    description: 'Retrieve the Chart of Accounts (دليل الحسابات) for a company. Supports keyword search or classification filter (Asset, Liability, Equity, Revenue, Expense).',
    inputSchema: {
      type: 'object',
      properties: {
        company: { type: 'string', description: 'Company name or ID (e.g., "Commercial Agency" or "Tijarahub")' },
        classification: { type: 'string', enum: ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'], description: 'Filter by account classification' },
        query: { type: 'string', description: 'Keyword to search in account code or English/Arabic name' },
        limit: { type: 'integer', description: 'Maximum number of accounts to return (default: 100)', default: 100 }
      },
      required: ['company']
    }
  },
  {
    name: 'modeer_list_vouchers',
    description: 'List journal vouchers/entries (سجل القيود) with status, date, and pagination filters.',
    inputSchema: {
      type: 'object',
      properties: {
        company: { type: 'string', description: 'Company name or ID' },
        status: { type: 'string', enum: ['draft', 'posted', 'cancelled', 'all'], description: 'Filter by voucher status (default: all)', default: 'all' },
        period: { type: 'string', description: 'Period in YYYY-MM format (e.g., "2026-11")' },
        limit: { type: 'integer', description: 'Maximum number of vouchers to return (default: 50)', default: 50 }
      },
      required: ['company']
    }
  },
  {
    name: 'modeer_get_voucher',
    description: 'Retrieve full details of a specific journal voucher, including header status, posting metadata, and all debit/credit journal lines.',
    inputSchema: {
      type: 'object',
      properties: {
        company: { type: 'string', description: 'Company name or ID' },
        voucher_no: { type: 'string', description: 'Voucher number (e.g. "1", "2") or full voucher ID' }
      },
      required: ['company', 'voucher_no']
    }
  },
  {
    name: 'modeer_create_voucher',
    description: 'Create a new journal voucher (قيد يومية). Can be created as "draft" (recommended for review) or "posted" immediately. Enforces double-entry balance (Total Debits = Total Credits) and validates account codes against Chart of Accounts.',
    inputSchema: {
      type: 'object',
      properties: {
        company: { type: 'string', description: 'Company name or ID' },
        status: { type: 'string', enum: ['draft', 'posted'], description: 'Status: "draft" (pending review) or "posted" (posted to ledger)', default: 'draft' },
        voucher_no: { type: 'string', description: 'Optional voucher number (auto-assigned if omitted)' },
        date: { type: 'string', description: 'Voucher date in YYYY-MM-DD format (defaults to current date)' },
        description: { type: 'string', description: 'Explanation or narrative of the transaction' },
        lines: {
          type: 'array',
          description: 'Double-entry journal lines (must have at least 2 lines and debits equal credits if posted)',
          items: {
            type: 'object',
            properties: {
              account_code: { type: 'string', description: 'Account code from Chart of Accounts (e.g. "11010101" for Cash USD)' },
              debit: { type: 'number', description: 'Debit amount in base currency (0 if credit)', default: 0 },
              credit: { type: 'number', description: 'Credit amount in base currency (0 if debit)', default: 0 },
              notes: { type: 'string', description: 'Optional line explanation' },
              currency: { type: 'string', description: 'Currency code (default: "USD")', default: 'USD' },
              exchange_rate: { type: 'number', description: 'Exchange rate to base currency', default: 1.0 },
              party: { type: 'string', description: 'Customer, vendor, or third-party name' },
              branch: { type: 'string', description: 'Branch identifier' }
            },
            required: ['account_code']
          }
        }
      },
      required: ['company', 'lines']
    }
  },
  {
    name: 'modeer_post_voucher',
    description: 'Post a draft voucher to the General Ledger. Transitions status from "draft" to "posted" and immutably locks the ledger record according to IFRS standards.',
    inputSchema: {
      type: 'object',
      properties: {
        company: { type: 'string', description: 'Company name or ID' },
        voucher_id: { type: 'string', description: 'Voucher number or full ID to post' }
      },
      required: ['company', 'voucher_id']
    }
  },
  {
    name: 'modeer_cancel_voucher',
    description: 'Cancel a posted or draft voucher in accordance with IFRS audit trail standards. Status becomes "cancelled" and cannot be deleted or re-posted.',
    inputSchema: {
      type: 'object',
      properties: {
        company: { type: 'string', description: 'Company name or ID' },
        voucher_id: { type: 'string', description: 'Voucher number or ID to cancel' },
        reason: { type: 'string', description: 'Reason for cancellation (recorded in audit log)' }
      },
      required: ['company', 'voucher_id', 'reason']
    }
  },
  {
    name: 'modeer_amend_voucher',
    description: 'Amend an existing posted voucher: cancels the original voucher with reason and creates a new linked replacement voucher in a single atomic transaction.',
    inputSchema: {
      type: 'object',
      properties: {
        company: { type: 'string', description: 'Company name or ID' },
        voucher_id: { type: 'string', description: 'Voucher number or ID of the voucher to amend' },
        reason: { type: 'string', description: 'Reason for amendment' },
        description: { type: 'string', description: 'Updated transaction description' },
        lines: { type: 'array', description: 'New replacement journal lines', items: { type: 'object' } }
      },
      required: ['company', 'voucher_id', 'reason', 'lines']
    }
  },
  {
    name: 'modeer_get_cash_movement',
    description: 'Get Cash & Bank movement statement (حركة الخزينة والبنوك) showing total cash inflows (debits), outflows (credits), and closing cash balance for posted vouchers.',
    inputSchema: {
      type: 'object',
      properties: {
        company: { type: 'string', description: 'Company name or ID' },
        date_from: { type: 'string', description: 'Start date in YYYY-MM-DD format' },
        date_to: { type: 'string', description: 'End date in YYYY-MM-DD format' }
      },
      required: ['company']
    }
  },
  {
    name: 'modeer_get_trial_balance',
    description: 'Calculate Trial Balance (ميزان المراجعة) showing total debits, total credits, and net ending balances for all accounts in the Chart of Accounts.',
    inputSchema: {
      type: 'object',
      properties: {
        company: { type: 'string', description: 'Company name or ID' },
        period: { type: 'string', description: 'Optional period filter (YYYY-MM)' }
      },
      required: ['company']
    }
  },
  {
    name: 'modeer_get_financial_summary',
    description: 'Get executive financial overview and KPIs: Total Assets, Total Liabilities, Total Equity, Total Revenue, Total Expenses, Net Profit/Loss, and Cash on Hand.',
    inputSchema: {
      type: 'object',
      properties: {
        company: { type: 'string', description: 'Company name or ID' }
      },
      required: ['company']
    }
  },
  {
    name: 'modeer_create_company',
    description: 'Create a new company in Modeer. Automatically seeds the standard Chart of Accounts (254 accounts) and currencies.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Company name' },
        base_currency: { type: 'string', description: 'Base currency (default: "USD")', default: 'USD' }
      },
      required: ['name']
    }
  }
];

export const MCP_RESOURCES_DEFINITIONS = [
  {
    uri: 'modeer://companies',
    name: 'Registered Companies',
    description: 'List of all active business companies registered in the Modeer instance.',
    mimeType: 'application/json'
  },
  {
    uri: 'modeer://accounting-standards',
    name: 'Accounting Rules & Standards',
    description: 'Operational guidelines, IFRS double-entry rules, and 4-state voucher lifecycle definitions in Modeer ERP.',
    mimeType: 'text/markdown'
  }
];

// Helper: Resolve company name or ID
async function resolveCompany(env, input) {
  if (!input) return 'Tijarahub';
  const c = String(input).trim();
  try {
    const found = await env.DB.prepare(
      'SELECT id FROM companies WHERE id = ? OR name = ? LIMIT 1'
    ).bind(c, c).first();
    return found ? found.id : c;
  } catch (e) {
    return c;
  }
}

// Enterprise RBAC: Enforce user permissions
function enforceRole(session, allowedRoles, actionName) {
  const userRole = (session && session.role) || 'viewer';
  if (!allowedRoles.includes(userRole)) {
    throw new Error(`Permission Denied: Action "${actionName}" requires one of the following roles: [${allowedRoles.join(', ')}]. Current user "${session?.username || 'unknown'}" has role "${userRole}".`);
  }
}

// Enterprise Multi-Tenant Access: Ensure AI only accesses company user is authorized for
async function enforceCompanyAccess(env, session, requestedCompany) {
  const targetCompany = await resolveCompany(env, requestedCompany || (session && session.company));

  if (!session) {
    throw new Error('Authentication required.');
  }

  // Admin has global access across companies
  if (session.role === 'admin') {
    return targetCompany;
  }

  // Scoped user: can only operate on their authorized company
  const authorizedCompany = await resolveCompany(env, session.company);
  if (targetCompany !== authorizedCompany) {
    throw new Error(`Permission Denied: User "${session.username}" is authorized only for company "${authorizedCompany}". Access to "${targetCompany}" is prohibited.`);
  }

  return targetCompany;
}

// Tool Implementation Handlers
async function handleListCompanies(env, session) {
  if (!session) {
    throw new Error('Authentication required.');
  }
  let sql = 'SELECT id, name, base_currency, created_at FROM companies';
  const params = [];
  if (session && session.role !== 'admin' && session.company) {
    sql += ' WHERE id = ? OR name = ?';
    params.push(session.company, session.company);
  }
  sql += ' ORDER BY name ASC';
  const { results } = await env.DB.prepare(sql).bind(...params).all();
  return {
    total: (results || []).length,
    companies: results || []
  };
}

async function handleGetChartOfAccounts(env, args, session) {
  const company = await enforceCompanyAccess(env, session, args.company);
  let sql = 'SELECT code, name, name_ar, classification, sub, parent_code, is_active FROM accounts WHERE company_id = ?';
  const params = [company];

  if (args.classification) {
    sql += ' AND classification = ?';
    params.push(args.classification);
  }
  if (args.query) {
    sql += ' AND (code LIKE ? OR name LIKE ? OR name_ar LIKE ?)';
    const q = `%${args.query}%`;
    params.push(q, q, q);
  }

  const limit = Math.min(Math.max(parseInt(args.limit || 100, 10), 1), 500);
  sql += ' ORDER BY code ASC LIMIT ?';
  params.push(limit);

  const { results } = await env.DB.prepare(sql).bind(...params).all();
  return {
    company,
    count: (results || []).length,
    accounts: results || []
  };
}

async function handleListVouchers(env, args, session) {
  const company = await enforceCompanyAccess(env, session, args.company);
  let sql = `
    SELECT v.id, v.voucher_no, v.voucher_date, v.period, v.description, v.status, v.created_by, v.posted_at, v.version,
      COALESCE(SUM(l.base_debit), 0) as total_debit,
      COALESCE(SUM(l.base_credit), 0) as total_credit,
      COUNT(l.id) as lines_count
    FROM vouchers v
    LEFT JOIN voucher_lines l ON v.id = l.voucher_id
    WHERE v.company_id = ?
  `;
  const params = [company];

  if (args.status && args.status !== 'all') {
    sql += ' AND v.status = ?';
    params.push(args.status);
  }
  if (args.period) {
    sql += ' AND v.period = ?';
    params.push(args.period);
  }

  const limit = Math.min(Math.max(parseInt(args.limit || 50, 10), 1), 200);
  sql += ' GROUP BY v.id ORDER BY CAST(v.voucher_no AS INTEGER) DESC LIMIT ?';
  params.push(limit);

  const { results } = await env.DB.prepare(sql).bind(...params).all();
  return {
    company,
    count: (results || []).length,
    vouchers: results || []
  };
}

async function handleGetVoucher(env, args, session) {
  const company = await enforceCompanyAccess(env, session, args.company);
  const vNo = String(args.voucher_no || '').trim();

  const voucher = await env.DB.prepare(
    'SELECT * FROM vouchers WHERE company_id = ? AND (voucher_no = ? OR id = ?)'
  ).bind(company, vNo, vNo).first();

  if (!voucher) {
    throw new Error(`Voucher "${vNo}" not found for company "${company}".`);
  }

  const { results: lines } = await env.DB.prepare(
    'SELECT line_no, account_code, gl_name, sub_ledger, party, branch, currency, exchange_rate, original_debit, original_credit, base_debit, base_credit, notes, statement_type FROM voucher_lines WHERE voucher_id = ? ORDER BY line_no ASC'
  ).bind(voucher.id).all();

  return {
    voucher,
    lines: lines || []
  };
}

async function handleCreateVoucher(env, args, session) {
  const company = await enforceCompanyAccess(env, session, args.company);
  const status = args.status === 'posted' ? 'posted' : 'draft';

  // Role permissions check
  if (status === 'posted') {
    enforceRole(session, ['manager', 'admin'], 'Direct Posting to Ledger');
  } else {
    enforceRole(session, ['accountant', 'manager', 'admin'], 'Create Draft Voucher');
  }

  const lines = Array.isArray(args.lines) ? args.lines : [];

  if (lines.length < 2) {
    throw new Error('A voucher must have at least 2 journal lines according to double-entry standards.');
  }

  // Validate balance if posted immediately
  let totDr = 0;
  let totCr = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const dr = Number(l.base_debit ?? l.debit ?? l.dr ?? 0);
    const cr = Number(l.base_credit ?? l.credit ?? l.cr ?? 0);
    totDr += dr;
    totCr += cr;

    let code = String(l.account_code || l.accountCode || l.code || '').trim();
    if (!code && l.gl) {
      const s = String(l.gl).trim();
      const m = s.match(/^(\d+)/);
      code = m ? m[1] : s;
    }
    if (!code) {
      throw new Error(`Line ${i + 1} does not specify an account_code.`);
    }

    if (status === 'posted') {
      let codeClean = code;
      const m = code.match(/^(\d+)/);
      if (m) codeClean = m[1];

      const acc = await env.DB.prepare(
        'SELECT code, is_active FROM accounts WHERE company_id = ? AND (code = ? OR code = ? OR LOWER(name) = LOWER(?) OR name_ar = ? OR (code || " - " || name) = ? OR (code || " - " || name_ar) = ?)'
      ).bind(company, code, codeClean, code, code, code, code).first();

      if (!acc) throw new Error(`Account code "${code}" does not exist in Chart of Accounts for "${company}".`);
      if (acc.is_active === 0) throw new Error(`Account "${code}" is deactivated.`);
    }
  }

  if (status === 'posted' && Math.abs(totDr - totCr) > 0.005) {
    throw new Error(`Voucher out of balance: Total Debits (${totDr.toFixed(2)}) != Total Credits (${totCr.toFixed(2)}). Difference: ${(totDr - totCr).toFixed(4)}`);
  }

  let vNo = String(args.voucher_no || '').trim();
  if (!vNo) {
    const row = await env.DB.prepare('SELECT voucher_no FROM vouchers WHERE company_id = ? ORDER BY CAST(voucher_no AS INTEGER) DESC LIMIT 1').bind(company).first();
    const num = row && row.voucher_no ? parseInt(row.voucher_no, 10) : 0;
    vNo = isNaN(num) ? String(Date.now()).slice(-6) : String(num + 1);
  }

  const vId = `${company}_${vNo}`;
  const vDate = args.date || new Date().toISOString().slice(0, 10);
  const vPeriod = vDate.slice(0, 7);
  const vDesc = args.description || '';
  const vUser = (session && session.username) || 'ai-agent';
  const postedAt = status === 'posted' ? new Date().toISOString() : null;
  const postedBy = status === 'posted' ? vUser : null;

  const stmts = [
    env.DB.prepare(
      'INSERT INTO vouchers (id, company_id, voucher_no, voucher_date, period, description, created_by, status, posted_at, posted_by, version, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)'
    ).bind(vId, company, vNo, vDate, vPeriod, vDesc, vUser, status, postedAt, postedBy),
    env.DB.prepare('DELETE FROM voucher_lines WHERE voucher_id = ?').bind(vId)
  ];

  const { results: accListMcp } = await env.DB.prepare(
    'SELECT code, name, name_ar FROM accounts WHERE company_id = ?'
  ).bind(company).all();
  const accByCodeMcp = new Map();
  const accByNameMcp = new Map();
  for (const a of accListMcp || []) {
    if (a.code) accByCodeMcp.set(a.code, a);
    if (a.name) accByNameMcp.set(a.name.toLowerCase(), a);
    if (a.name_ar) accByNameMcp.set(a.name_ar, a);
  }

  lines.forEach((l, idx) => {
    const lineId = `${vId}_${idx + 1}`;
    let code = String(l.account_code || l.accountCode || l.code || '').trim();
    let name = String(l.gl_name || l.accountName || '').trim();

    if (!code && l.gl) {
      const s = String(l.gl).trim();
      const m = s.match(/^(\d+)/);
      if (m) {
        code = m[1];
        name = s.replace(/^\d+\s*[-:]*\s*/, '').trim() || name;
      } else {
        name = s;
      }
    }

    if (code && accByCodeMcp.has(code)) {
      const matched = accByCodeMcp.get(code);
      if (!name || name === code) name = matched.name || matched.name_ar;
    } else if (!code && name && accByNameMcp.has(name.toLowerCase())) {
      const matched = accByNameMcp.get(name.toLowerCase());
      code = matched.code;
      name = matched.name || matched.name_ar;
    }

    stmts.push(
      env.DB.prepare(
        'INSERT INTO voucher_lines (id, voucher_id, company_id, line_no, account_code, gl_name, sub_ledger, party, branch, currency, exchange_rate, original_debit, original_credit, base_debit, base_credit, notes, statement_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        lineId, vId, company, idx + 1,
        code,
        name || code || 'Unclassified Account',
        String(l.sub_ledger || l.subLedger || ''),
        String(l.party || ''),
        String(l.branch || ''),
        String(l.currency || 'USD'),
        Number(l.exchange_rate || l.exchangeRate || 1.0),
        Number(l.original_debit ?? l.debit ?? 0.0),
        Number(l.original_credit ?? l.credit ?? 0.0),
        Number(l.base_debit ?? l.debit ?? 0.0),
        Number(l.base_credit ?? l.credit ?? 0.0),
        String(l.notes || ''),
        String(l.statement_type || 'BS')
      )
    );
  });

  await env.DB.batch(stmts);

  return {
    success: true,
    id: vId,
    voucherNo: vNo,
    status,
    totalDebit: totDr,
    totalCredit: totCr,
    linesCount: lines.length,
    createdAt: new Date().toISOString()
  };
}

async function handlePostVoucher(env, args, session) {
  const company = await enforceCompanyAccess(env, session, args.company);
  enforceRole(session, ['manager', 'admin'], 'Post Voucher to Ledger');
  const vId = String(args.voucher_id || '').trim();

  const voucher = await env.DB.prepare(
    'SELECT * FROM vouchers WHERE company_id = ? AND (id = ? OR voucher_no = ?)'
  ).bind(company, vId, vId).first();

  if (!voucher) throw new Error(`Voucher "${vId}" not found in company "${company}".`);
  if (voucher.status === 'posted') return { success: true, message: `Voucher "${vId}" is already posted.`, voucher };
  if (voucher.status === 'cancelled') throw new Error(`Cannot post cancelled voucher "${vId}".`);

  const { results: lines } = await env.DB.prepare('SELECT * FROM voucher_lines WHERE voucher_id = ?').bind(voucher.id).all();
  if (!lines || lines.length < 2) throw new Error('Cannot post: Voucher must have at least 2 lines.');

  let totDr = 0, totCr = 0;
  for (const l of lines) {
    totDr += Number(l.base_debit || 0);
    totCr += Number(l.base_credit || 0);
  }
  if (Math.abs(totDr - totCr) > 0.005) {
    throw new Error(`Cannot post: Imbalance between debits (${totDr.toFixed(2)}) and credits (${totCr.toFixed(2)}).`);
  }

  const actualUser = (session && session.username) || 'AI Assistant';
  const vUser = `${actualUser} (via AI Assistant)`;
  const now = new Date().toISOString();
  await env.DB.prepare(
    'UPDATE vouchers SET status = "posted", posted_at = ?, posted_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind(now, vUser, voucher.id).run();

  return {
    success: true,
    id: voucher.id,
    voucherNo: voucher.voucher_no,
    status: 'posted',
    postedAt: now,
    postedBy: vUser
  };
}

async function handleCancelVoucher(env, args, session) {
  const company = await enforceCompanyAccess(env, session, args.company);
  enforceRole(session, ['manager', 'admin'], 'Cancel Voucher');
  const vId = String(args.voucher_id || '').trim();
  const reason = String(args.reason || '').trim();
  if (!reason) throw new Error('Reason for cancellation is required for audit trail.');

  const voucher = await env.DB.prepare(
    'SELECT * FROM vouchers WHERE company_id = ? AND (id = ? OR voucher_no = ?)'
  ).bind(company, vId, vId).first();

  if (!voucher) throw new Error(`Voucher "${vId}" not found in company "${company}".`);
  if (voucher.status === 'cancelled') return { success: true, message: `Voucher is already cancelled.`, voucher };

  const actualUser = (session && session.username) || 'AI Assistant';
  const updatedDesc = `${voucher.description || ''} [Cancelled by ${actualUser} via AI Assistant: ${reason}]`.trim();
  await env.DB.prepare(
    'UPDATE vouchers SET status = "cancelled", description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind(updatedDesc, voucher.id).run();

  return {
    success: true,
    id: voucher.id,
    voucherNo: voucher.voucher_no,
    status: 'cancelled',
    reason
  };
}

async function handleAmendVoucher(env, args, session) {
  const company = await enforceCompanyAccess(env, session, args.company);
  enforceRole(session, ['manager', 'admin'], 'Amend Voucher');
  const vId = String(args.voucher_id || '').trim();
  const reason = String(args.reason || '').trim();
  const lines = Array.isArray(args.lines) ? args.lines : [];

  if (!reason) throw new Error('Reason is required when amending a voucher.');
  if (lines.length < 2) throw new Error('Replacement voucher must have at least 2 lines.');

  const original = await env.DB.prepare(
    'SELECT * FROM vouchers WHERE company_id = ? AND (id = ? OR voucher_no = ?)'
  ).bind(company, vId, vId).first();
  if (!original) throw new Error(`Original voucher "${vId}" not found.`);

  // Cancel original
  const actualUser = (session && session.username) || 'AI Assistant';
  const cancelNote = `${original.description || ''} [Amended by ${actualUser} via AI Assistant: ${reason}]`.trim();
  await env.DB.prepare('UPDATE vouchers SET status = "cancelled", description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(cancelNote, original.id).run();

  // Create new voucher with amended_from
  const newVoucherResult = await handleCreateVoucher(env, {
    company,
    status: 'posted',
    date: new Date().toISOString().slice(0, 10),
    description: args.description || `Amended replacement for ${original.voucher_no}: ${reason}`,
    lines
  }, session);

  await env.DB.prepare('UPDATE vouchers SET amended_from = ? WHERE id = ?').bind(original.id, newVoucherResult.id).run();

  return {
    success: true,
    amendedVoucherId: original.id,
    newVoucher: newVoucherResult,
    reason
  };
}

async function handleGetCashMovement(env, args, session) {
  const company = await enforceCompanyAccess(env, session, args.company);
  let sql = `
    SELECT l.line_no, l.account_code, l.gl_name, l.base_debit, l.base_credit, l.notes, v.voucher_no, v.voucher_date
    FROM voucher_lines l
    JOIN vouchers v ON l.voucher_id = v.id
    WHERE l.company_id = ? AND v.status = 'posted'
      AND (l.account_code LIKE '1101%' OR l.sub_ledger = 'Cash' OR l.sub_ledger = 'Bank')
  `;
  const params = [company];

  if (args.date_from) {
    sql += ' AND v.voucher_date >= ?';
    params.push(args.date_from);
  }
  if (args.date_to) {
    sql += ' AND v.voucher_date <= ?';
    params.push(args.date_to);
  }

  sql += ' ORDER BY v.voucher_date DESC, CAST(v.voucher_no AS INTEGER) DESC LIMIT 100';

  const { results: txs } = await env.DB.prepare(sql).bind(...params).all();

  let totalReceipts = 0;
  let totalDisbursements = 0;
  (txs || []).forEach(t => {
    totalReceipts += Number(t.base_debit || 0);
    totalDisbursements += Number(t.base_credit || 0);
  });

  return {
    company,
    totalReceipts: Number(totalReceipts.toFixed(2)),
    totalDisbursements: Number(totalDisbursements.toFixed(2)),
    netCashMovement: Number((totalReceipts - totalDisbursements).toFixed(2)),
    transactionsCount: (txs || []).length,
    recentTransactions: txs || []
  };
}

async function handleGetTrialBalance(env, args, session) {
  const company = await enforceCompanyAccess(env, session, args.company);
  let sql = `
    SELECT a.code, a.name, a.name_ar, a.classification,
      COALESCE(SUM(l.base_debit), 0) as total_debit,
      COALESCE(SUM(l.base_credit), 0) as total_credit
    FROM accounts a
    LEFT JOIN voucher_lines l ON a.company_id = l.company_id AND a.code = l.account_code
    LEFT JOIN vouchers v ON l.voucher_id = v.id AND v.status = 'posted'
    WHERE a.company_id = ?
  `;
  const params = [company];
  if (args.period) {
    sql += ' AND v.period = ?';
    params.push(args.period);
  }
  sql += ' GROUP BY a.code ORDER BY a.code ASC';

  const { results } = await env.DB.prepare(sql).bind(...params).all();

  let totDr = 0;
  let totCr = 0;
  const accountsWithBalances = (results || []).map(r => {
    const dr = Number(r.total_debit || 0);
    const cr = Number(r.total_credit || 0);
    totDr += dr;
    totCr += cr;
    const balance = dr - cr;
    return {
      code: r.code,
      name: r.name,
      nameAr: r.name_ar,
      classification: r.classification,
      totalDebit: Number(dr.toFixed(2)),
      totalCredit: Number(cr.toFixed(2)),
      netBalance: Number(balance.toFixed(2))
    };
  });

  return {
    company,
    totalDebit: Number(totDr.toFixed(2)),
    totalCredit: Number(totCr.toFixed(2)),
    difference: Number(Math.abs(totDr - totCr).toFixed(4)),
    isBalanced: Math.abs(totDr - totCr) < 0.01,
    accountsCount: accountsWithBalances.length,
    accounts: accountsWithBalances
  };
}

async function handleGetFinancialSummary(env, args, session) {
  const company = await enforceCompanyAccess(env, session, args.company);

  // Vouchers breakdown
  const vStats = await env.DB.prepare(
    'SELECT status, COUNT(*) as cnt FROM vouchers WHERE company_id = ? GROUP BY status'
  ).bind(company).all();

  const counts = { draft: 0, posted: 0, cancelled: 0 };
  (vStats.results || []).forEach(r => { counts[r.status] = r.cnt; });

  // P&L and Balance Sheet summary from posted lines
  const tb = await handleGetTrialBalance(env, { company }, session);

  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalEquity = 0;
  let totalRevenue = 0;
  let totalExpenses = 0;
  let cashOnHand = 0;

  tb.accounts.forEach(a => {
    if (a.classification === 'Asset') {
      totalAssets += a.netBalance;
      if (a.code.startsWith('1101')) cashOnHand += a.netBalance;
    } else if (a.classification === 'Liability') {
      totalLiabilities += (-a.netBalance);
    } else if (a.classification === 'Equity') {
      totalEquity += (-a.netBalance);
    } else if (a.classification === 'Revenue') {
      totalRevenue += (-a.netBalance);
    } else if (a.classification === 'Expense') {
      totalExpenses += a.netBalance;
    }
  });

  const netProfit = totalRevenue - totalExpenses;

  return {
    company,
    kpis: {
      totalAssets: Number(totalAssets.toFixed(2)),
      totalLiabilities: Number(totalLiabilities.toFixed(2)),
      totalEquity: Number(totalEquity.toFixed(2)),
      totalRevenue: Number(totalRevenue.toFixed(2)),
      totalExpenses: Number(totalExpenses.toFixed(2)),
      netProfit: Number(netProfit.toFixed(2)),
      cashOnHand: Number(cashOnHand.toFixed(2)),
      workingCapital: Number((totalAssets - totalLiabilities).toFixed(2))
    },
    vouchersStats: counts,
    trialBalanceStatus: {
      isBalanced: tb.isBalanced,
      totalDebit: tb.totalDebit,
      totalCredit: tb.totalCredit
    }
  };
}

async function handleCreateCompany(env, args, session) {
  enforceRole(session, ['admin'], 'Create New Company');
  const name = String(args.name || '').trim();
  const id = name.slice(0, 50);
  const baseCurrency = String(args.base_currency || 'USD').toUpperCase().slice(0, 3);

  if (!name) throw new Error('Company name is required.');

  const existing = await env.DB.prepare('SELECT id, name FROM companies WHERE id = ? OR name = ? LIMIT 1').bind(id, name).first();
  if (existing) {
    return { success: true, message: 'Company already exists.', company: existing };
  }

  await env.DB.prepare('INSERT INTO companies (id, name, base_currency) VALUES (?, ?, ?)').bind(id, name, baseCurrency).run();

  // Auto-seed COA and currencies from Commercial Agency
  try {
    await env.DB.batch([
      env.DB.prepare(`
        INSERT OR IGNORE INTO accounts (id, company_id, code, name, name_ar, classification, sub, parent_code)
        SELECT ? || '_' || code, ?, code, name, name_ar, classification, sub, parent_code
        FROM accounts WHERE company_id = 'Commerc Of Agency'
      `).bind(id, id),
      env.DB.prepare(`
        INSERT OR IGNORE INTO currencies (id, company_id, code, name, rate)
        SELECT ? || '_' || code, ?, code, name, rate
        FROM currencies WHERE company_id = 'Commerc Of Agency'
      `).bind(id, id)
    ]);
  } catch (e) {}

  return {
    success: true,
    company: { id, name, base_currency: baseCurrency }
  };
}

// Dispatch tool call to handler
async function dispatchToolCall(env, name, args, session) {
  switch (name) {
    case 'modeer_list_companies':
      return await handleListCompanies(env, session);
    case 'modeer_get_chart_of_accounts':
      return await handleGetChartOfAccounts(env, args, session);
    case 'modeer_list_vouchers':
      return await handleListVouchers(env, args, session);
    case 'modeer_get_voucher':
      return await handleGetVoucher(env, args, session);
    case 'modeer_create_voucher':
      return await handleCreateVoucher(env, args, session);
    case 'modeer_post_voucher':
      return await handlePostVoucher(env, args, session);
    case 'modeer_cancel_voucher':
      return await handleCancelVoucher(env, args, session);
    case 'modeer_amend_voucher':
      return await handleAmendVoucher(env, args, session);
    case 'modeer_get_cash_movement':
      return await handleGetCashMovement(env, args, session);
    case 'modeer_get_trial_balance':
      return await handleGetTrialBalance(env, args, session);
    case 'modeer_get_financial_summary':
      return await handleGetFinancialSummary(env, args, session);
    case 'modeer_create_company':
      return await handleCreateCompany(env, args, session);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// Dispatch resource read
async function dispatchResourceRead(env, uri, session) {
  if (uri === 'modeer://companies') {
    const data = await handleListCompanies(env, session);
    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(data, null, 2)
      }]
    };
  }
  if (uri === 'modeer://accounting-standards') {
    const text = `# Modeer ERP Accounting Standards & Guidelines
1. Double-Entry Principle: Every journal voucher must have Total Debits = Total Credits.
2. 4-State Lifecycle: Draft -> Posted -> Cancelled / Amended.
3. Immutability: Posted vouchers cannot be modified or deleted. To adjust, use Cancel or Amend.
4. Auto-Seeding: New companies automatically inherit standard COA (254 accounts) and currencies.
5. Multi-Tenant Isolation: Each company's ledger is strictly segregated.`;
    return {
      contents: [{
        uri,
        mimeType: 'text/markdown',
        text
      }]
    };
  }
  throw new Error(`Resource not found: ${uri}`);
}

/**
 * Process a single JSON-RPC 2.0 MCP message
 */
export async function processMcpMessage(msg, env, session) {
  if (!msg || typeof msg !== 'object') {
    return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } };
  }

  const { id, method, params } = msg;

  try {
    switch (method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: { listChanged: false },
              resources: { subscribe: false, listChanged: false }
            },
            serverInfo: MCP_SERVER_INFO
          }
        };

      case 'notifications/initialized':
      case 'initialized':
        return null; // Notifications do not send a response

      case 'ping':
        return { jsonrpc: '2.0', id, result: {} };

      case 'tools/list':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools: MCP_TOOLS_DEFINITIONS
          }
        };

      case 'resources/list':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            resources: MCP_RESOURCES_DEFINITIONS
          }
        };

      case 'resources/read': {
        const uri = params && params.uri;
        if (!uri) throw new Error('Missing uri parameter');
        if (!session) {
          throw new Error('Authentication required to read resources. Please configure MODEER_API_KEY or authenticate via OAuth 2.0.');
        }
        const res = await dispatchResourceRead(env, uri, session);
        return { jsonrpc: '2.0', id, result: res };
      }

      case 'tools/call': {
        const toolName = params && params.name;
        const toolArgs = (params && params.arguments) || {};
        if (!toolName) throw new Error('Missing tool name');
        if (!session) {
          throw new Error('Authentication required to invoke tools. Please configure MODEER_API_KEY or authenticate via OAuth 2.0.');
        }

        const output = await dispatchToolCall(env, toolName, toolArgs, session);
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: typeof output === 'string' ? output : JSON.stringify(output, null, 2)
              }
            ]
          }
        };
      }

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`
          }
        };
    }
  } catch (err) {
    if (id === undefined || id === null) return null;
    return {
      jsonrpc: '2.0',
      id,
      result: {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Error: ${err.message || String(err)}`
          }
        ]
      }
    };
  }
}

/**
 * Handle incoming MCP POST or SSE requests
 */
export async function handleMcpRequest(request, env, session, cors) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error: Request body must be valid JSON' }
    }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors } });
  }

  // Support batch requests
  if (Array.isArray(body)) {
    const responses = (await Promise.all(body.map(m => processMcpMessage(m, env, session)))).filter(Boolean);
    return new Response(JSON.stringify(responses), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...cors }
    });
  }

  const response = await processMcpMessage(body, env, session);
  if (!response) {
    return new Response(null, { status: 204, headers: cors });
  }

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...cors }
  });
}

