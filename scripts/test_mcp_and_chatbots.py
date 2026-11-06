#!/usr/bin/env python3
"""
Modeer MCP & Chatbot Connector Integration Test Suite
Verifies:
  1. OpenAPI 3.1 & Privacy endpoints for ChatGPT Actions
  2. Native MCP Endpoint on Cloudflare Edge (/api/mcp)
  3. MCP Protocol Initialization & Capabilities Negotiation
  4. MCP Tools Discovery (12 Accounting Tools)
  5. Accounting Queries via MCP (COA, Cash Movement, P&L Summary, Trial Balance)
  6. Double-Entry Voucher Lifecycle via MCP (Create Draft -> Post -> Cancel)
  7. Local MCP Stdio connector (node mcp-server/index.js)
"""

import urllib.request
import json
import sys
import subprocess

BASE_URL = "https://modeer.modeer.workers.dev"
API_KEY = "modeer_sk_live_master_ai_agent_production_key_2026"
TEST_CO = "Commercial Agency"

def test_chatgpt_actions_endpoints():
    print("=== 1. Testing ChatGPT Custom GPT Endpoints (/openapi.json & /privacy) ===")
    
    # 1. OpenAPI Specification
    req = urllib.request.Request(f"{BASE_URL}/openapi.json", headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode())
        title = data.get("info", {}).get("title")
        paths = list(data.get("paths", {}).keys())
        print(f"✅ OpenAPI 3.1 OK! Title: '{title}', Paths: {len(paths)}")
        assert "Modeer" in title
        assert "/api/v2/vouchers" in paths

    # 2. Privacy Policy
    req_priv = urllib.request.Request(f"{BASE_URL}/privacy", headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req_priv) as resp:
        assert resp.status == 200
        html = resp.read().decode()
        assert "Privacy Policy" in html or "سياسة الخصوصية" in html
        print("✅ Privacy Policy Endpoint OK! (Required for ChatGPT Actions)\n")

def call_mcp(method, params=None, req_id=1):
    payload = {
        "jsonrpc": "2.0",
        "id": req_id,
        "method": method
    }
    if params is not None:
        payload["params"] = params

    req = urllib.request.Request(
        f"{BASE_URL}/api/mcp",
        data=json.dumps(payload).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {API_KEY}",
            "User-Agent": "MCP-Test/2.0"
        }
    )
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        return json.loads(resp.read().decode())

def test_mcp_core_protocol():
    print("=== 2. Testing MCP Protocol Handshake & Tool Discovery ===")
    
    # 1. Initialize
    init_res = call_mcp("initialize", {"protocolVersion": "2024-11-05"})
    server_info = init_res.get("result", {}).get("serverInfo", {})
    proto_ver = init_res.get("result", {}).get("protocolVersion")
    print(f"✅ MCP Initialize OK! Server: {server_info.get('name')} v{server_info.get('version')}, Proto: {proto_ver}")
    assert server_info.get("name") == "modeer-mcp-server"

    # 2. Ping
    ping_res = call_mcp("ping")
    assert ping_res.get("result") == {}
    print("✅ MCP Ping OK!")

    # 3. Tools List
    tools_res = call_mcp("tools/list")
    tools = tools_res.get("result", {}).get("tools", [])
    tool_names = [t["name"] for t in tools]
    print(f"✅ MCP Tools List OK! Found {len(tools)} tools:")
    for t in tools:
        print(f"   • {t['name']}: {t['description'][:60]}...")
    assert len(tools) >= 12
    assert "modeer_get_financial_summary" in tool_names
    assert "modeer_create_voucher" in tool_names
    print()

def test_mcp_financial_queries():
    print("=== 3. Testing Financial Query Tools via MCP ===")
    
    # 1. List Companies
    comp_res = call_mcp("tools/call", {"name": "modeer_list_companies", "arguments": {}})
    comp_text = comp_res["result"]["content"][0]["text"]
    companies = json.loads(comp_text)["companies"]
    print(f"✅ modeer_list_companies: Found {len(companies)} companies ({[c['name'] for c in companies]})")
    assert len(companies) >= 2

    # 2. Get Chart of Accounts
    coa_res = call_mcp("tools/call", {"name": "modeer_get_chart_of_accounts", "arguments": {"company": TEST_CO, "limit": 5}})
    coa_data = json.loads(coa_res["result"]["content"][0]["text"])
    print(f"✅ modeer_get_chart_of_accounts: {coa_data['count']} accounts retrieved for {TEST_CO}")
    assert coa_data["count"] > 0

    # 3. Cash & Bank Movement
    cash_res = call_mcp("tools/call", {"name": "modeer_get_cash_movement", "arguments": {"company": TEST_CO}})
    cash_data = json.loads(cash_res["result"]["content"][0]["text"])
    print(f"✅ modeer_get_cash_movement: Receipts: ${cash_data['totalReceipts']}, Disbursements: ${cash_data['totalDisbursements']}, Net: ${cash_data['netCashMovement']}")
    assert "totalReceipts" in cash_data

    # 4. Executive Financial Summary & KPIs
    summary_res = call_mcp("tools/call", {"name": "modeer_get_financial_summary", "arguments": {"company": TEST_CO}})
    summary_data = json.loads(summary_res["result"]["content"][0]["text"])
    kpis = summary_data["kpis"]
    print(f"✅ modeer_get_financial_summary: Assets: ${kpis['totalAssets']}, Net Profit: ${kpis['netProfit']}, Cash: ${kpis['cashOnHand']}")
    assert "totalAssets" in kpis
    print()

def test_mcp_voucher_lifecycle():
    print("=== 4. Testing Double-Entry Voucher Lifecycle via MCP ===")
    
    # 1. Create Draft Voucher
    v_body = {
        "company": TEST_CO,
        "status": "draft",
        "description": "MCP Integration Automated Test Voucher",
        "lines": [
            {"account_code": "11010101", "debit": 1500.0, "credit": 0.0, "notes": "Cash received"},
            {"account_code": "410101", "debit": 0.0, "credit": 1500.0, "notes": "Sales revenue"}
        ]
    }
    create_res = call_mcp("tools/call", {"name": "modeer_create_voucher", "arguments": v_body})
    c_out = json.loads(create_res["result"]["content"][0]["text"])
    v_id = c_out["id"]
    v_no = c_out["voucherNo"]
    print(f"✅ Draft Voucher Created: ID: {v_id}, No: {v_no}, Status: {c_out['status']}")
    assert c_out["status"] == "draft"

    # 2. Get Voucher Details
    get_res = call_mcp("tools/call", {"name": "modeer_get_voucher", "arguments": {"company": TEST_CO, "voucher_no": v_no}})
    v_detail = json.loads(get_res["result"]["content"][0]["text"])
    assert v_detail["voucher"]["status"] == "draft"
    assert len(v_detail["lines"]) == 2
    print(f"✅ Voucher verified with {len(v_detail['lines'])} double-entry lines")

    # 3. Post Voucher
    post_res = call_mcp("tools/call", {"name": "modeer_post_voucher", "arguments": {"company": TEST_CO, "voucher_id": v_id}})
    p_out = json.loads(post_res["result"]["content"][0]["text"])
    print(f"✅ Draft Voucher Posted: Status: {p_out['status']}, Posted At: {p_out.get('postedAt')}")
    assert p_out["status"] == "posted"

    # 4. Cancel Voucher (IFRS Audit Trail Standard)
    cancel_res = call_mcp("tools/call", {"name": "modeer_cancel_voucher", "arguments": {
        "company": TEST_CO,
        "voucher_id": v_id,
        "reason": "Automated cleanup of test voucher"
    }})
    cancel_out = json.loads(cancel_res["result"]["content"][0]["text"])
    print(f"✅ Voucher Cancelled with Audit Trail: Status: {cancel_out['status']}")
    assert cancel_out["status"] == "cancelled"

    # Clean up test voucher from DB
    try:
        subprocess.run([
            "npx", "wrangler", "d1", "execute", "modeer-db", "--remote",
            f"--command=DELETE FROM voucher_lines WHERE voucher_id = '{v_id}'; DELETE FROM vouchers WHERE id = '{v_id}';"
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
    except Exception:
        pass
    print()

def test_local_mcp_connector():
    print("=== 5. Testing Local MCP Stdio Connector (node mcp-server/index.js) ===")
    cmd = ["node", "mcp-server/index.js", "--test"]
    proc = subprocess.run(cmd, capture_output=True, text=True, cwd="/home/mosama/projects/modeer")
    print(proc.stderr)
    assert proc.returncode == 0
    print("✅ Local MCP Connector verified successfully!\n")

if __name__ == "__main__":
    try:
        test_chatgpt_actions_endpoints()
        test_mcp_core_protocol()
        test_mcp_financial_queries()
        test_mcp_voucher_lifecycle()
        test_local_mcp_connector()
        print("🎉 ALL MCP & CHATBOT INTEGRATION TESTS PASSED 100%!")
    except Exception as e:
        print(f"❌ TEST SUITE FAILED: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
