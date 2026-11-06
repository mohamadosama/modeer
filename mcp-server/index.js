#!/usr/bin/env node
/**
 * Modeer Model Context Protocol (MCP) Stdio Connector
 * Protocol Version: 2024-11-05
 * 
 * Works out-of-the-box with Claude Desktop, Claude Code, Cursor, Windsurf, and Antigravity.
 * Zero external dependencies: requires only Node.js >= 18.
 */

import readline from 'node:readline';

const API_URL = (process.env.MODEER_API_URL || 'https://modeer.modeer.workers.dev').replace(/\/+$/, '');
const API_KEY = process.env.MODEER_API_KEY || process.env.MODEER_TOKEN || 'modeer_sk_live_master_ai_agent_production_key_2026';
const DEFAULT_COMPANY = process.env.MODEER_DEFAULT_COMPANY || 'Commercial Agency';

// CLI flags for testing and status
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.error(`
Modeer MCP Server v2.0.0
Standard Model Context Protocol connector for Modeer ERP & Accounting.

Usage in Claude Desktop (claude_desktop_config.json):
{
  "mcpServers": {
    "modeer": {
      "command": "node",
      "args": ["${process.argv[1]}"],
      "env": {
        "MODEER_API_URL": "https://modeer.modeer.workers.dev",
        "MODEER_API_KEY": "${API_KEY}",
        "MODEER_DEFAULT_COMPANY": "Commercial Agency"
      }
    }
  }
}
`);
  process.exit(0);
}

if (process.argv.includes('--test') || process.argv.includes('--ping')) {
  console.error(`Testing connection to Modeer MCP at ${API_URL}/api/mcp...`);
  try {
    const res = await fetch(`${API_URL}/api/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2024-11-05' }
      })
    });
    const data = await res.json();
    console.error('✅ Connection successful!');
    console.error('Server Info:', JSON.stringify(data.result?.serverInfo, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
    process.exit(1);
  }
}

// Log start to stderr (stdout is strictly JSON-RPC messages)
console.error(`[Modeer MCP] Server started (Edge: ${API_URL}, Default Company: ${DEFAULT_COMPANY})`);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  try {
    const msg = JSON.parse(trimmed);

    // Auto-inject default company into tool arguments if omitted
    if (msg.method === 'tools/call' && msg.params && msg.params.arguments) {
      if (!msg.params.arguments.company) {
        msg.params.arguments.company = DEFAULT_COMPANY;
      }
    }

    // Forward JSON-RPC request to Modeer Edge Worker
    const response = await fetch(`${API_URL}/api/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'X-API-Key': API_KEY,
        'User-Agent': 'Modeer-MCP-Stdio/2.0'
      },
      body: JSON.stringify(msg)
    });

    if (response.status === 204) {
      // Notification, no content
      return;
    }

    const data = await response.json();
    process.stdout.write(JSON.stringify(data) + '\n');
  } catch (err) {
    console.error('[Modeer MCP Error]', err.message);
    const errResponse = {
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32603,
        message: `MCP Bridge Internal Error: ${err.message}`
      }
    };
    process.stdout.write(JSON.stringify(errResponse) + '\n');
  }
});

rl.on('close', () => {
  console.error('[Modeer MCP] Process stdin closed, exiting.');
  process.exit(0);
});
