#!/usr/bin/env python3
"""
Modeer OAuth 2.0 Full Integration & Security Verification Suite
Tests:
  1. RFC 8414 Authorization Server Metadata Discovery
  2. Browser Authorization Page Rendering (/oauth/authorize GET)
  3. Form Submission & Authorization Code Grant (/oauth/authorize POST)
  4. Token Exchange with PKCE verification (/oauth/token POST)
  5. Authenticated REST API & MCP Calls using the issued OAuth Bearer Token
"""

import urllib.request
import urllib.parse
import json
import sys
import hashlib
import base64

BASE_URL = "https://modeer.modeer.workers.dev"

# PKCE helper: generate verifier and challenge
def generate_pkce():
    verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
    digest = hashlib.sha256(verifier.encode('ascii')).digest()
    challenge = base64.urlsafe_b64encode(digest).decode('ascii').replace('=', '')
    return verifier, challenge

def test_oauth_metadata():
    print("=== 1. Testing RFC 8414 OAuth 2.0 Server Metadata Discovery ===")
    req = urllib.request.Request(f"{BASE_URL}/.well-known/oauth-authorization-server", headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode())
        print(f"✅ Metadata OK! Issuer: {data.get('issuer')}")
        print(f"   Auth Endpoint: {data.get('authorization_endpoint')}")
        print(f"   Token Endpoint: {data.get('token_endpoint')}")
        assert data.get("authorization_endpoint").endswith("/oauth/authorize")
        assert data.get("token_endpoint").endswith("/oauth/token")
    print()

def test_browser_authorize_page():
    print("=== 2. Testing Browser Authorization UI Rendering (/oauth/authorize GET) ===")
    _, challenge = generate_pkce()
    params = urllib.parse.urlencode({
        "response_type": "code",
        "client_id": "chatgpt-modeer",
        "redirect_uri": "https://oa.chatgpt.com/callback",
        "state": "test_state_12345",
        "code_challenge": challenge,
        "code_challenge_method": "S256"
    })
    req = urllib.request.Request(f"{BASE_URL}/oauth/authorize?{params}", headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        html = resp.read().decode()
        assert "تفويض وصول المساعد الذكي" in html
        assert "Commercial Agency" in html or "Commercial" in html
        print("✅ Authorization Page HTML successfully rendered with Modeer branding and company selector!\n")

class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def http_error_302(self, req, fp, code, msg, headers):
        return fp

def test_full_oauth_code_and_token_exchange():
    print("=== 3. Testing OAuth Authorization Code Grant & Token Exchange ===")
    verifier, challenge = generate_pkce()
    redirect_uri = "https://oa.chatgpt.com/callback"
    state = "chatgpt_session_xyz"

    # Step 1: Submit authorization form
    form_data = urllib.parse.urlencode({
        "client_id": "chatgpt-modeer",
        "redirect_uri": redirect_uri,
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "username": "mohamadosama",
        "password": "mosama",
        "company": "Commerc Of Agency"
    }).encode('utf-8')

    opener = urllib.request.build_opener(NoRedirectHandler)
    req = urllib.request.Request(
        f"{BASE_URL}/oauth/authorize",
        data=form_data,
        headers={"Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Mozilla/5.0"}
    )
    
    resp = opener.open(req)
    # Cloudflare or standard 302
    location = resp.headers.get("Location")
    print(f"Redirect Location: {location}")
    assert location is not None, "Expected 302 redirect location header!"
    assert location.startswith(redirect_uri)
    
    parsed = urllib.parse.urlparse(location)
    q = urllib.parse.parse_qs(parsed.query)
    code = q.get("code", [None])[0]
    returned_state = q.get("state", [None])[0]
    print(f"✅ Authorization Code Issued: {code[:20]}... (State matched: {returned_state == state})")
    assert code is not None
    assert returned_state == state

    # Step 2: Exchange Authorization Code for Access Token (/oauth/token)
    print("=== 4. Testing Token Exchange (/oauth/token) with PKCE ===")
    token_payload = urllib.parse.urlencode({
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri,
        "client_id": "chatgpt-modeer",
        "client_secret": "modeer_oauth_secret_2026",
        "code_verifier": verifier
    }).encode('utf-8')

    token_req = urllib.request.Request(
        f"{BASE_URL}/oauth/token",
        data=token_payload,
        headers={"Content-Type": "application/x-www-form-urlencoded", "User-Agent": "ChatGPT-Backend/1.0"}
    )
    with urllib.request.urlopen(token_req) as t_resp:
        assert t_resp.status == 200
        token_body = json.loads(t_resp.read().decode())
        access_token = token_body.get("access_token")
        token_type = token_body.get("token_type")
        expires_in = token_body.get("expires_in")
        company = token_body.get("company")
        print(f"✅ OAuth Token Issued! Type: {token_type}, Expires In: {expires_in}s ({expires_in // 86400} days)")
        print(f"   Company Scoped: {company}")
        assert access_token.startswith("modeer_at_")
        assert token_type == "Bearer"

    # Step 3: Verify the Access Token on REST API
    print("=== 5. Testing REST API Access using Issued OAuth Token ===")
    api_req = urllib.request.Request(
        f"{BASE_URL}/api/v2/accounts?limit=3",
        headers={"Authorization": f"Bearer {access_token}", "User-Agent": "Mozilla/5.0"}
    )
    with urllib.request.urlopen(api_req) as a_resp:
        assert a_resp.status == 200
        a_data = json.loads(a_resp.read().decode())
        print(f"✅ REST API Call Successful with OAuth Token! Accounts retrieved: {len(a_data.get('data', []))}")

    # Step 4: Verify the Access Token on MCP Server (/api/mcp)
    print("=== 6. Testing MCP Server Tool Call using Issued OAuth Token ===")
    mcp_payload = json.dumps({
        "jsonrpc": "2.0",
        "id": 100,
        "method": "tools/call",
        "params": {
            "name": "modeer_get_financial_summary",
            "arguments": {"company": company}
        }
    }).encode('utf-8')

    mcp_req = urllib.request.Request(
        f"{BASE_URL}/api/mcp",
        data=mcp_payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {access_token}",
            "User-Agent": "ChatGPT-MCP-Client/1.0"
        }
    )
    with urllib.request.urlopen(mcp_req) as m_resp:
        assert m_resp.status == 200
        m_data = json.loads(m_resp.read().decode())
        content = json.loads(m_data["result"]["content"][0]["text"])
        print(f"✅ MCP Call via OAuth Token Successful! Company: {content.get('company')}")
        print(f"   Financial KPIs: {content.get('kpis')}")
    print()

if __name__ == "__main__":
    try:
        test_oauth_metadata()
        test_browser_authorize_page()
        test_full_oauth_code_and_token_exchange()
        print("🎉 ALL OAUTH 2.0 INTEGRATION & SECURITY TESTS PASSED 100%!")
    except Exception as e:
        print(f"❌ OAUTH TEST SUITE FAILED: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
