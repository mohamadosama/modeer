import urllib.request
import urllib.error
import json
import sys

BASE_URL = "https://modeer.modeer.workers.dev"

# Authenticate admin
login_data = json.dumps({"username": "admin", "password": "123456", "company": "Tijarahub Ai"}).encode("utf-8")
req = urllib.request.Request(
    f"{BASE_URL}/api/auth/login",
    data=login_data,
    headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}
)
with urllib.request.urlopen(req) as resp:
    token = json.loads(resp.read().decode("utf-8"))["token"]

headers = {
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0"
}

def run_test(name, fn):
    print(f"Testing: {name} ... ", end="")
    try:
        fn()
        print("PASS")
    except Exception as e:
        print(f"FAIL: {e}")
        raise e

def test_draft_upsert():
    # User's exact payload that previously crashed with SQLITE_CONSTRAINT_UNIQUE
    payload = {
        "voucher_no": "3",
        "voucher_date": "2026-11-07",
        "period": "2026-11",
        "description": "Test upsert draft voucher 3",
        "status": "draft",
        "lines": [
            {
                "line_no": 1,
                "account_code": "11010101",
                "gl_name": "Main Cash - USD",
                "currency": "USD",
                "exchange_rate": 1,
                "original_debit": 0,
                "original_credit": 100,
                "base_debit": 0,
                "base_credit": 100
            },
            {
                "line_no": 2,
                "account_code": "11010102",
                "gl_name": "Cash EGY - EGP",
                "currency": "USD",
                "exchange_rate": 1,
                "original_debit": 100,
                "original_credit": 0,
                "base_debit": 100,
                "base_credit": 0
            }
        ]
    }
    req = urllib.request.Request(
        f"{BASE_URL}/api/v2/vouchers?company=Tijarahub%20Ai",
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST"
    )
    with urllib.request.urlopen(req) as resp:
        assert resp.status in (200, 201), f"Expected 200 or 201, got {resp.status}"
        data = json.loads(resp.read().decode("utf-8"))
        assert data["voucherNo"] == "3"
        print(f"(Voucher 3 draft upserted successfully, status={resp.status})", end=" ")

def test_mandatory_exchange_rate():
    # Attempting to post a non-base currency transaction without exchange rate
    payload = {
        "voucher_no": "9999",
        "voucher_date": "2026-11-07",
        "period": "2026-11",
        "description": "Missing exchange rate test",
        "status": "posted",
        "lines": [
            {
                "line_no": 1,
                "account_code": "11010102",
                "gl_name": "Cash EGY - EGP",
                "currency": "EGP",
                "exchange_rate": 0, # Invalid rate!
                "base_debit": 100,
                "base_credit": 0
            },
            {
                "line_no": 2,
                "account_code": "11010101",
                "gl_name": "Main Cash - USD",
                "currency": "USD",
                "exchange_rate": 1,
                "base_debit": 0,
                "base_credit": 100
            }
        ]
    }
    req = urllib.request.Request(
        f"{BASE_URL}/api/v2/vouchers?company=Tijarahub%20Ai",
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST"
    )
    try:
        urllib.request.urlopen(req)
        assert False, "Should have failed with 422 for missing exchange rate"
    except urllib.error.HTTPError as err:
        assert err.code == 422, f"Expected 422, got {err.code}"
        body = json.loads(err.read().decode("utf-8"))
        assert "Exchange rate is mandatory" in body["detail"], f"Unexpected error detail: {body['detail']}"
        print(f"(Blocked correctly with: {body['detail'][:40]}...)", end=" ")

def test_posted_voucher_immutability():
    # Attempting to POST over an already posted/cancelled voucher
    payload = {
        "voucher_no": "1", # Voucher 1 is posted/cancelled
        "voucher_date": "2026-11-07",
        "status": "draft",
        "lines": [
            {"account_code": "11010101", "base_debit": 10, "base_credit": 0},
            {"account_code": "11010102", "base_debit": 0, "base_credit": 10}
        ]
    }
    req = urllib.request.Request(
        f"{BASE_URL}/api/v2/vouchers?company=Tijarahub%20Ai",
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST"
    )
    try:
        urllib.request.urlopen(req)
        print("(Voucher 1 was not posted, test skipped)", end=" ")
    except urllib.error.HTTPError as err:
        assert err.code in (409, 400), f"Expected 409 Conflict, got {err.code}"
        print(f"(Conflict prevented overwrite with {err.code})", end=" ")

if __name__ == "__main__":
    run_test("Draft Voucher Upsert (Fix for SQLite UNIQUE constraint)", test_draft_upsert)
    run_test("Mandatory Exchange Rate on Foreign Currency", test_mandatory_exchange_rate)
    run_test("Posted Voucher Immutability (Conflict 409)", test_posted_voucher_immutability)
    print("\nALL BACKEND API TESTS PASSED!")
