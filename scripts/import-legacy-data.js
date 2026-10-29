#!/usr/bin/env node

/**
 * Generates SQL migration file to import legacy Modeer JSON data into Cloudflare D1
 */

import fs from 'fs';
import path from 'path';

const LEGACY_DIR = '/home/mosama/projects/modeer-legacy-reference/data';
const OUTPUT_SQL = path.resolve('migrations/0002_seed_legacy_data.sql');

function escapeSql(str) {
  if (typeof str !== 'string') {
    str = JSON.stringify(str);
  }
  return "'" + str.replace(/'/g, "''") + "'";
}

const companies = [
  { id: 'Tijarahub', name: 'Tijarahub', base: 'USD' },
  { id: 'VOOM', name: 'VOOM', base: 'USD' },
  { id: 'Commerc Of Agency', name: 'Commercial Agency', base: 'USD' },
];

let sql = `-- Seed Legacy Data into Modeer Cloudflare D1\n-- Generated on ${new Date().toISOString()}\n\n`;

for (const co of companies) {
  const jsonPath = path.join(LEGACY_DIR, co.id, 'accounting-data.json');
  if (!fs.existsSync(jsonPath)) {
    console.warn(`File not found: ${jsonPath}`);
    continue;
  }

  const raw = fs.readFileSync(jsonPath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error(`Error parsing JSON for ${co.id}:`, err);
    continue;
  }

  const data = parsed.data || {};
  let baseCur = co.base;
  if (data.acc_base) {
    baseCur = data.acc_base;
  }

  sql += `-- Company: ${co.name} (${co.id})\n`;
  sql += `INSERT OR REPLACE INTO companies (id, name, base_currency) VALUES (${escapeSql(co.id)}, ${escapeSql(co.name)}, ${escapeSql(baseCur)});\n`;

  let count = 0;
  for (const [k, v] of Object.entries(data)) {
    if (k.startsWith('acc_') || k.startsWith('disk_') || k.startsWith('co_')) {
      const valStr = typeof v === 'string' ? v : JSON.stringify(v);
      sql += `INSERT OR REPLACE INTO company_storage (company, key, value) VALUES (${escapeSql(co.id)}, ${escapeSql(k)}, ${escapeSql(valStr)});\n`;
      count++;
    }
  }

  sql += `\n`;
  console.log(`Company ${co.id}: imported ${count} keys.`);
}

fs.writeFileSync(OUTPUT_SQL, sql, 'utf8');
console.log(`Successfully generated: ${OUTPUT_SQL} (${(fs.statSync(OUTPUT_SQL).size / 1024).toFixed(1)} KB)`);
