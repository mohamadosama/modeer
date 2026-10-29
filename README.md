# Modeer Dashboard | مدير

Web-based Financial Accounting & Management Dashboard, running on **Cloudflare Pages / Workers** backed by **Cloudflare D1 (Serverless SQLite)**.

## Architecture

* **Frontend:** Single-page React application (`public/index.html` + `public/modeer-sync.js`) served from Cloudflare Edge Assets with zero build step.
* **Edge API:** Cloudflare Worker (`src/worker.js`) handling company data synchronization and company switching.
* **Database:** Cloudflare D1 SQL database (`migrations/0001_init.sql`) storing each company's accounting records (`company_storage`).

---

## Local Development & Testing

1. **Run Local Database Migrations:**
   ```bash
   npx wrangler d1 execute modeer-db --local --file=migrations/0001_init.sql
   ```

2. **Seed Initial Data (Tijarahub, VOOM, Commercial Agency):**
   ```bash
   npx wrangler d1 execute modeer-db --local --file=migrations/0002_seed_legacy_data.sql
   ```

3. **Start the Local Development Server:**
   ```bash
   npx wrangler dev
   ```
   Open `http://localhost:8787` in your browser.

---

## Deploying to Cloudflare (workers.dev & CI/CD)

### Step 1: Create the Cloudflare D1 Database
In your terminal, log in to Cloudflare and create the production database:
```bash
npx wrangler login
npx wrangler d1 create modeer-db
```
Wrangler will output the `database_id`. Update `wrangler.jsonc` with that ID:
```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "modeer-db",
    "database_id": "<YOUR-DATABASE-ID>"
  }
]
```

### Step 2: Run Production Migrations
```bash
npx wrangler d1 execute modeer-db --remote --file=migrations/0001_init.sql
npx wrangler d1 execute modeer-db --remote --file=migrations/0002_seed_legacy_data.sql
```

### Step 3: Connect GitHub for Continuous Deployment (CI/CD)
1. Push this repository to GitHub: `https://github.com/mohamadosama/modeer.git`.
2. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/) $\rightarrow$ **Workers & Pages** $\rightarrow$ **Create** $\rightarrow$ **Connect to Git**.
3. Select `mohamadosama/modeer`.
4. In Project Settings, ensure the D1 Database `modeer-db` is bound as `DB`.
5. Every `git push` to `main` will automatically build and deploy to your `*.workers.dev` URL.
