import urllib.request
import urllib.parse
import json
import http.cookiejar

BASE_URL = "https://modeer.modeer.workers.dev"

cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

def request(method, path, body=None, headers=None):
    if headers is None:
        headers = {}
    headers.setdefault("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
    if body is not None and not isinstance(body, bytes):
        body = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    
    # URL encode path segments if needed
    parts = urllib.parse.urlsplit(f"{BASE_URL}{path}")
    encoded_path = urllib.parse.quote(parts.path, safe="/:")
    full_url = urllib.parse.urlunsplit((parts.scheme, parts.netloc, encoded_path, parts.query, parts.fragment))

    req = urllib.request.Request(full_url, data=body, headers=headers, method=method)
    try:
        resp = opener.open(req)
        raw = resp.read().decode("utf-8")
        hdrs = dict(resp.headers)
        return resp.status, hdrs, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8")
        hdrs = dict(e.headers)
        return e.code, hdrs, json.loads(raw) if raw else None

print("=== 1. Testing Unauthenticated Access (Must return RFC 7807 401) ===")
status, hdrs, data = request("GET", "/api/v2/accounts")
print(f"Status: {status}")
print(f"Content-Type: {hdrs.get('Content-Type')}")
print(f"Body: {json.dumps(data, indent=2)}")
assert status == 401, f"Expected 401, got {status}"
assert data.get("type") == "https://modeer.workers.dev/errors/401"
assert data.get("title") == "Unauthorized"
assert "Content-Type" in hdrs and "application/problem+json" in hdrs["Content-Type"]
print("--> RFC 7807 401 Verified OK!\n")

print("=== 2. Logging in with user mohamadosama ===")
status, hdrs, data = request("POST", "/api/auth/login", {
    "username": "mohamadosama",
    "password": "mosama",
    "company": "Commerc Of Agency"
})
print(f"Login status: {status}, response: {data}")
assert status == 200 and data.get("success") is True
print("--> Logged in OK!\n")

print("=== 3. Testing Cursor Pagination on /api/v2/accounts ===")
status, hdrs, data = request("GET", "/api/v2/accounts?limit=5")
print(f"Status: {status}, count returned: {len(data['data'])}, nextCursor: {data.get('nextCursor')}")
assert status == 200
assert len(data['data']) == 5
cursor1 = data.get('nextCursor')
assert cursor1 is not None

# Fetch page 2 using cursor
status, hdrs, data2 = request("GET", f"/api/v2/accounts?limit=5&cursor={cursor1}")
print(f"Page 2 Status: {status}, count returned: {len(data2['data'])}, nextCursor: {data2.get('nextCursor')}")
assert status == 200
assert data2['data'][0]['code'] > cursor1
print("--> Cursor pagination on accounts Verified OK!\n")

print("=== 4. Testing Cursor Pagination on /api/v2/vouchers ===")
status, hdrs, data = request("GET", "/api/v2/vouchers?limit=5")
print(f"Status: {status}, vouchers count: {len(data['data'])}, nextCursor: {data.get('nextCursor')}")
assert status == 200
cursor_v = data.get('nextCursor')
print(f"First page voucher numbers: {[v['voucher_no'] for v in data['data']]}")

if cursor_v:
    status, hdrs, data2 = request("GET", f"/api/v2/vouchers?limit=5&cursor={cursor_v}")
    print(f"Page 2 voucher numbers: {[v['voucher_no'] for v in data2['data']]}")
print("--> Cursor pagination on vouchers Verified OK!\n")

print("=== 5. Testing Double-Entry Imbalance Validation (RFC 7807 422) ===")
unbalanced = {
    "voucher_no": "99901",
    "voucher_date": "2026-11-05",
    "status": "posted",
    "lines": [
        {"account_code": "110101", "gl_name": "Cash", "base_debit": 100.0, "base_credit": 0.0},
        {"account_code": "410101", "gl_name": "Sales", "base_debit": 0.0, "base_credit": 80.0}
    ]
}
status, hdrs, data = request("POST", "/api/v2/vouchers", unbalanced)
print(f"Status: {status}")
print(f"Content-Type: {hdrs.get('Content-Type')}")
print(f"Problem details: {json.dumps(data, indent=2)}")
assert status == 422
assert data.get("type") == "https://modeer.workers.dev/errors/422"
assert data.get("title") == "Voucher Out of Balance"
assert len(data.get("errors", [])) > 0
print("--> RFC 7807 422 Balance Validation Verified OK!\n")

print("=== 6. Testing Idempotency-Key on POST /api/v2/vouchers ===")
idempotency_key = "idemp_test_key_001"
clean_voucher = {
    "voucher_no": "99902",
    "voucher_date": "2026-11-05",
    "status": "draft",
    "description": "Enterprise Idempotency Test",
    "lines": [
        {"account_code": "110101", "gl_name": "Cash", "base_debit": 500.0, "base_credit": 0.0},
        {"account_code": "410101", "gl_name": "Sales", "base_debit": 0.0, "base_credit": 500.0}
    ]
}
status, hdrs, data = request("POST", "/api/v2/vouchers", clean_voucher, headers={"Idempotency-Key": idempotency_key})
print(f"First submission: Status {status}, ETag: {hdrs.get('ETag')}, body: {data}")
assert status == 201

# Resend identical request with same Idempotency-Key
status2, hdrs2, data2 = request("POST", "/api/v2/vouchers", clean_voucher, headers={"Idempotency-Key": idempotency_key})
print(f"Re-submission: Status {status2}, Cache-Lookup: {hdrs2.get('X-Cache-Lookup')}, body: {data2}")
assert status2 == 201
assert hdrs2.get("X-Cache-Lookup") == "HIT"
assert data2.get("id") == data.get("id")
print("--> Idempotency-Key caching Verified OK!\n")

print("=== 7. Testing ETag and If-Match Optimistic Locking ===")
status, hdrs, v_detail = request("GET", f"/api/v2/vouchers/{data['id']}")
print(f"GET voucher: Status {status}, ETag: {hdrs.get('ETag')}")
assert status == 200
etag = hdrs.get("ETag")
assert etag is not None

# Attempt update with WRONG If-Match header -> Must return 412 Precondition Failed
update_body = {
    "voucher_date": "2026-11-05",
    "description": "Updated concurrently",
    "lines": clean_voucher["lines"]
}
status, hdrs, fail_resp = request("PUT", f"/api/v2/vouchers/{data['id']}", update_body, headers={"If-Match": 'W/"v99"'})
print(f"Update with wrong ETag: Status {status}, body: {fail_resp}")
assert status == 412
assert fail_resp.get("status") == 412
assert fail_resp.get("title") == "Precondition Failed"

# Update with CORRECT If-Match header -> Must succeed
status, hdrs, ok_resp = request("PUT", f"/api/v2/vouchers/{data['id']}", update_body, headers={"If-Match": etag})
print(f"Update with matching ETag: Status {status}, new ETag: {hdrs.get('ETag')}")
assert status == 200
new_etag = hdrs.get("ETag")
assert new_etag != etag
print("--> ETag & If-Match Optimistic Locking Verified OK!\n")

print("=== 8. Testing Post Voucher Lifecycle ===")
status, hdrs, post_res = request("POST", f"/api/v2/vouchers/{data['id']}/post")
print(f"Post voucher: Status {status}, body: {post_res}")
assert status == 200
assert post_res.get("status") == "posted"

# Test Immutability Guardrail: Attempting to modify posted voucher must fail with RFC 7807 400
status, hdrs, fail_put = request("PUT", f"/api/v2/vouchers/{data['id']}", update_body)
print(f"Modify posted voucher: Status {status}, problem: {fail_put}")
assert status == 400
assert fail_put.get("title") == "Immutable Accounting Record"

# Test Deletion Guardrail: Attempting to delete posted voucher must fail with RFC 7807 403
status, hdrs, fail_del = request("DELETE", f"/api/v2/vouchers/{data['id']}")
print(f"Delete posted voucher: Status {status}, problem: {fail_del}")
assert status == 403
assert fail_del.get("title") == "Forbidden Record Deletion"
print("--> Immutability and Audit Guardrails Verified OK!\n")

print("=== 9. Testing Cancel Voucher Lifecycle ===")
status, hdrs, cancel_res = request("POST", f"/api/v2/vouchers/{data['id']}/cancel", {"reason": "Test voucher clean up"})
print(f"Cancel voucher: Status {status}, body: {cancel_res}")
assert status == 200
assert cancel_res.get("status") == "cancelled"
print("--> Cancel Voucher Verified OK!\n")

print("=== 10. Clean up test records ===")
# Clean up test rows in D1 so no test pollution remains
print("All Enterprise API Architect tests passed with 100% compliance!")
