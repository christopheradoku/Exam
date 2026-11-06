# Vercel persistent storage

The portal uses a local JSON-file store during local development. Vercel Functions have a read-only filesystem (apart from temporary `/tmp` scratch space), so deployed exam and student data must use an external persistent database.

## Connect a database

1. In the Vercel project, open **Storage** and add a **Neon Postgres** database from the Marketplace.
2. Connect it to the project and enable the environments you deploy (Production and Preview, at minimum). Confirm the project has a Postgres connection variable such as `DATABASE_URL`.
3. Redeploy. The app creates its `exam_portal_documents` table automatically on first use.

The app accepts `DATABASE_URL`, `POSTGRES_URL`, or `NEON_DATABASE_URL`. It never falls back to writing local files on Vercel; if no Postgres URL is configured, API calls return a setup error instead.

## Import local exam and student data

If the local `data/exams.json` and `data/students.json` files contain records you want in production, copy the database URL into the local `.env.local`, then run:

```powershell
pnpm migrate:portal-data
```

Or, if the Vercel CLI is linked and its production database variables have been pulled into `.env.local`:

```powershell
vercel env pull .env.local --environment=production
pnpm migrate:portal-data
```

The importer only adds each document when that document key is absent in Postgres. It leaves existing database records and local JSON files unchanged. Do not commit `.env.local` or share the database connection string.
