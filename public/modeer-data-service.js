/**
 * Modeer Data Service
 * Client-side Data Access Layer implementing the Enterprise API Architect contract.
 * Interacts with /api/v2/* REST endpoints with RFC 7807 error parsing, cursor pagination,
 * ETag/If-Match optimistic locking, and real-time multi-user delta synchronization.
 */

(function (window) {
  'use strict';

  async function handleResponse(res) {
    const contentType = res.headers.get('Content-Type') || '';
    let body = null;
    try {
      body = await res.json();
    } catch (e) {
      body = null;
    }

    if (!res.ok) {
      const err = new Error(
        (body && (body.detail || body.error || body.message)) ||
        `HTTP request failed with status ${res.status}`
      );
      err.status = res.status;
      err.problem = body;
      err.title = body && body.title;
      err.detail = body && body.detail;
      err.errors = (body && body.errors) || [];
      throw err;
    }

    const etag = res.headers.get('ETag');
    return { data: body, etag, status: res.status };
  }

  const ModeerDataService = {
    /**
     * Get Chart of Accounts with cursor-based pagination
     */
    async getAccounts(company, { limit = 100, cursor = null } = {}) {
      const params = new URLSearchParams();
      if (company) params.set('company', company);
      if (limit) params.set('limit', limit);
      if (cursor) params.set('cursor', cursor);

      const res = await fetch(`/api/v2/accounts?${params.toString()}`);
      const { data } = await handleResponse(res);
      return data;
    },

    /**
     * Create or update account in Chart of Accounts
     */
    async upsertAccount(company, account) {
      const res = await fetch(`/api/v2/accounts?company=${encodeURIComponent(company)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(account)
      });
      const { data } = await handleResponse(res);
      return data;
    },

    /**
     * Safely delete account (blocked if historical journal lines exist)
     */
    async deleteAccount(company, code) {
      const res = await fetch(`/api/v2/accounts/${encodeURIComponent(code)}?company=${encodeURIComponent(company)}`, {
        method: 'DELETE'
      });
      const { data } = await handleResponse(res);
      return data;
    },

    /**
     * List journal vouchers with cursor pagination and optional status filter
     */
    async getVouchers(company, { status = null, limit = 50, cursor = null, v = null } = {}) {
      const params = new URLSearchParams();
      if (company) params.set('company', company);
      if (status) params.set('status', status);
      if (limit) params.set('limit', limit);
      if (cursor) params.set('cursor', cursor);
      if (v) params.set('v', v);

      const res = await fetch(`/api/v2/vouchers?${params.toString()}`);
      const { data } = await handleResponse(res);
      return data;
    },

    /**
     * Get single voucher by ID or Number (includes ETag)
     */
    async getVoucher(company, id) {
      const res = await fetch(`/api/v2/vouchers/${encodeURIComponent(id)}?company=${encodeURIComponent(company)}`);
      const { data, etag } = await handleResponse(res);
      return { ...data, etag };
    },

    /**
     * Create new journal voucher (Draft or Posted with Double-Entry Balance Validation)
     */
    async createVoucher(company, voucherData, { idempotencyKey = null } = {}) {
      const headers = { 'Content-Type': 'application/json' };
      if (idempotencyKey) {
        headers['Idempotency-Key'] = idempotencyKey;
      } else {
        headers['Idempotency-Key'] = 'vch_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      }

      const res = await fetch(`/api/v2/vouchers?company=${encodeURIComponent(company)}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(voucherData)
      });
      const { data, etag } = await handleResponse(res);
      return { ...data, etag };
    },

    /**
     * Update DRAFT voucher with Optimistic Locking (If-Match)
     */
    async updateVoucher(company, id, voucherData, version = null) {
      const headers = { 'Content-Type': 'application/json' };
      if (version != null) {
        headers['If-Match'] = `W/"v${version}"`;
      }

      const res = await fetch(`/api/v2/vouchers/${encodeURIComponent(id)}?company=${encodeURIComponent(company)}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(voucherData)
      });
      const { data, etag } = await handleResponse(res);
      return { ...data, etag };
    },

    /**
     * Transition voucher from Draft -> Posted
     */
    async postVoucher(company, id) {
      const res = await fetch(`/api/v2/vouchers/${encodeURIComponent(id)}/post?company=${encodeURIComponent(company)}`, {
        method: 'POST'
      });
      const { data, etag } = await handleResponse(res);
      return { ...data, etag };
    },

    /**
     * Cancel Posted voucher with mandatory auditing reason
     */
    async cancelVoucher(company, id, reason) {
      const res = await fetch(`/api/v2/vouchers/${encodeURIComponent(id)}/cancel?company=${encodeURIComponent(company)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });
      const { data, etag } = await handleResponse(res);
      return { ...data, etag };
    },

    /**
     * Amend voucher lifecycle: Cancels original posted record and creates linked draft
     */
    async amendVoucher(company, id) {
      const res = await fetch(`/api/v2/vouchers/${encodeURIComponent(id)}/amend?company=${encodeURIComponent(company)}`, {
        method: 'POST'
      });
      const { data, etag } = await handleResponse(res);
      return { ...data, etag };
    },

    /**
     * Delete Draft voucher only (Posted records cannot be erased)
     */
    async deleteVoucher(company, id) {
      const res = await fetch(`/api/v2/vouchers/${encodeURIComponent(id)}?company=${encodeURIComponent(company)}`, {
        method: 'DELETE'
      });
      const { data } = await handleResponse(res);
      return data;
    },

    /**
     * Fetch Live Trial Balance from D1 (Strictly over posted vouchers)
     */
    async getTrialBalance(company) {
      const res = await fetch(`/api/v2/reports/trial-balance?company=${encodeURIComponent(company)}`);
      const { data } = await handleResponse(res);
      return data;
    },

    /**
     * Ultra-lightweight ping: checks if vouchers changed on server (only 1 fast D1 read)
     */
    async checkUpdates(company, since) {
      const params = new URLSearchParams();
      if (company) params.set('company', company);
      if (since) params.set('since', since);
      const res = await fetch(`/api/v2/updates?${params.toString()}`);
      const { data } = await handleResponse(res);
      return data;
    },

    /**
     * Multi-user Ledger Delta Sync:
     * Uses ultra-lightweight server pinging before fetching.
     * Only transfers full voucher data when changes actually occur.
     */
    async syncLedgerDelta(company) {
      try {
        let lastSync = localStorage.getItem('modeer_last_v_sync') || '1970-01-01T00:00:00.000Z';

        // 1. FAST PING: Ask server if any changes happened since last sync
        const ping = await this.checkUpdates(company, lastSync);
        if (!ping || !ping.has_updates) {
          // Server reports no updates! Exit immediately without downloading vouchers.
          return { updated: false, count: 0, checked: true };
        }

        // 2. Fetch vouchers only when updates exist
        const remote = await this.getVouchers(company, { limit: 50 });
        const remoteVouchers = remote.vouchers || remote.data || [];
        const remoteLines = remote.lines || [];

        if (!remoteVouchers.length) {
          localStorage.setItem('modeer_last_v_sync', ping.last_updated);
          return { updated: false, count: 0 };
        }

        let localRows = [];
        try {
          localRows = JSON.parse(localStorage.getItem('acc_rows') || '[]');
        } catch (e) {
          localRows = [];
        }

        const localVoucherMap = new Map();
        localRows.forEach(r => {
          if (r.v) {
            let list = localVoucherMap.get(r.v);
            if (!list) {
              list = [];
              localVoucherMap.set(r.v, list);
            }
            list.push(r);
          }
        });

        // Group remote lines by voucher_no
        const remoteLinesMap = new Map();
        const vHeaderMap = new Map();
        remoteVouchers.forEach(v => {
          vHeaderMap.set(v.id, v);
          vHeaderMap.set(v.voucher_no, v);
        });

        remoteLines.forEach(l => {
          const vHeader = vHeaderMap.get(l.voucher_id);
          const vNo = vHeader ? vHeader.voucher_no : l.voucher_id.split('_').slice(1).join('_');
          let list = remoteLinesMap.get(vNo);
          if (!list) {
            list = [];
            remoteLinesMap.set(vNo, list);
          }
          list.push({
            v: vNo,
            date: vHeader ? vHeader.voucher_date : '',
            p: vHeader ? vHeader.period : '',
            cur: l.currency,
            rate: l.exchange_rate,
            od: l.original_debit,
            oc: l.original_credit,
            dr: l.base_debit,
            cr: l.base_credit,
            gl: l.gl_name,
            sl: l.sub_ledger,
            party: l.party,
            sup: l.party,
            br: l.branch,
            notes: l.notes,
            st: l.statement_type,
            status: vHeader ? vHeader.status : 'posted'
          });
        });

        let changed = false;
        let newCount = 0;

        for (const v of remoteVouchers) {
          const vNo = v.voucher_no;
          const remoteVLines = remoteLinesMap.get(vNo) || [];
          const localVLines = localVoucherMap.get(vNo);

          if (!localVLines) {
            // New voucher added by another user!
            if (remoteVLines.length > 0) {
              localRows.push(...remoteVLines);
              changed = true;
              newCount++;
            }
          } else {
            // Check if status changed (e.g. cancelled)
            const currentStatus = localVLines[0].status || 'posted';
            if (v.status !== currentStatus) {
              localVLines.forEach(l => { l.status = v.status; });
              changed = true;
            }
          }
        }

        localStorage.setItem('modeer_last_v_sync', ping.last_updated);

        if (changed) {
          localStorage.setItem('acc_rows', JSON.stringify(localRows));
          window.dispatchEvent(new CustomEvent('modeer:data-updated', { detail: { newCount } }));
        }

        return { updated: changed, count: newCount };
      } catch (err) {
        return { updated: false, error: err.message };
      }
    }
  };

  window.ModeerDataService = ModeerDataService;
})(window);

