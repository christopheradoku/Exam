import { neon, type NeonQueryFunction } from "@neondatabase/serverless"

type Sql = NeonQueryFunction<false, false>
type VersionedDocument<T> = { payload: T; revision: string | number }

const tableName = "exam_portal_documents"
let sqlClient: Sql | undefined
let sqlClientUrl: string | undefined
let schemaReady: Promise<void> | undefined

function databaseClient() {
  const url = [process.env.DATABASE_URL, process.env.POSTGRES_URL, process.env.NEON_DATABASE_URL]
    .map((value) => value?.trim())
    .find((value) => value && /^postgres(?:ql)?:\/\//i.test(value))
  const hosted = process.env.VERCEL === "1" || Boolean(process.env.VERCEL_URL)
  if (!url) {
    if (hosted)
      throw new Error(
        "Persistent storage is not configured. Connect a Neon Postgres database to this Vercel project and set DATABASE_URL, then redeploy.",
      )
    return undefined
  }
  if (!sqlClient || sqlClientUrl !== url) {
    sqlClientUrl = url
    sqlClient = neon<false, false>(url)
    schemaReady = undefined
  }
  return sqlClient
}

async function ensureSchema(sql: Sql) {
  if (!schemaReady) {
    schemaReady = sql`
      CREATE TABLE IF NOT EXISTS ${sql.unsafe(tableName)} (
        document_key text PRIMARY KEY,
        payload jsonb NOT NULL,
        revision bigint NOT NULL DEFAULT 1,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `
      .then(() => undefined)
      .catch((error) => {
        schemaReady = undefined
        throw error
      })
  }
  await schemaReady
}

async function getOrCreateDocument<T>(sql: Sql, key: string, fallback: T) {
  await sql`
    INSERT INTO ${sql.unsafe(tableName)} (document_key, payload)
    VALUES (${key}, ${JSON.stringify(fallback)}::jsonb)
    ON CONFLICT (document_key) DO NOTHING
  `
  const rows = await sql`
    SELECT payload, revision
    FROM ${sql.unsafe(tableName)}
    WHERE document_key = ${key}
  `
  const row = rows[0] as VersionedDocument<T> | undefined
  if (!row) throw new Error(`Persistent document "${key}" could not be loaded.`)
  return row
}

export async function readPortalDocument<T>(
  key: string,
  fallback: T,
  readLocal: () => Promise<T>,
) {
  const sql = databaseClient()
  if (!sql) return readLocal()
  await ensureSchema(sql)
  const row = await getOrCreateDocument(sql, key, fallback)
  return row.payload
}

export async function updatePortalDocument<T, R>(
  key: string,
  fallback: T,
  update: (document: T) => R | Promise<R>,
  updateLocal: () => Promise<R>,
) {
  const sql = databaseClient()
  if (!sql) return updateLocal()
  await ensureSchema(sql)

  // Compare-and-swap prevents concurrent Vercel function instances from
  // overwriting each other's updates to the same JSON document.
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const current = await getOrCreateDocument<T>(sql, key, fallback)
    const result = await update(current.payload)
    const saved = await sql`
      UPDATE ${sql.unsafe(tableName)}
      SET payload = ${JSON.stringify(current.payload)}::jsonb,
          revision = revision + 1,
          updated_at = now()
      WHERE document_key = ${key} AND revision = ${current.revision}
      RETURNING revision
    `
    if (saved.length) return result
    await new Promise((resolve) => setTimeout(resolve, 15 + Math.floor(Math.random() * 35)))
  }

  throw new Error(`The ${key} data changed repeatedly. Please retry the operation.`)
}
