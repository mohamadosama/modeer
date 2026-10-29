import { webcrypto as crypto } from 'crypto';
import { execSync } from 'child_process';

const AU = {
  enc: new TextEncoder(),
  b64: u => Buffer.from(u).toString('base64'),
  unb64: s => Buffer.from(s, 'base64'),
  async hash(pw, salt, iter) {
    const k = await crypto.subtle.importKey('raw', AU.enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
    const b = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, k, 256);
    return AU.b64(b);
  },
  async make(pw, iter = 120000) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    return { salt: AU.b64(salt), hash: await AU.hash(pw, salt, iter), iter };
  }
};

async function main() {
  const newPw = '123456';
  const pwRec = await AU.make(newPw);
  console.log('Generated PBKDF2 hash for password:', newPw);

  const cmd = `npx -y wrangler d1 execute modeer-db --remote --json --command="SELECT company, value FROM company_storage WHERE key = 'acc_users';"`;
  const output = execSync(cmd, { encoding: 'utf8' });
  const parsed = JSON.parse(output);
  const rows = parsed[0]?.results || [];

  for (const row of rows) {
    const company = row.company;
    let users = [];
    try {
      users = JSON.parse(row.value);
    } catch (e) {
      users = [];
    }

    if (!Array.isArray(users)) users = [];

    users.forEach(u => {
      u.pw = pwRec;
    });

    const updatedJson = JSON.stringify(users);
    const escaped = updatedJson.replace(/'/g, "''");
    const updateSql = `UPDATE company_storage SET value = '${escaped}' WHERE company = '${company}' AND key = 'acc_users';`;

    console.log(`Updating company [${company}] users: ${users.map(u => u.name).join(', ')}...`);
    execSync(`npx -y wrangler d1 execute modeer-db --remote --command="${updateSql}"`, { stdio: 'inherit' });
  }

  console.log('\nAll user passwords across all companies on remote Cloudflare D1 successfully set to: 123456');
}

main().catch(console.error);
