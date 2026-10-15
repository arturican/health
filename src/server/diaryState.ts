import type { PoolClient } from 'pg'
import { z } from 'zod'
import { entityId } from '../domain/schema'
import { visibilitySchema } from '../domain/visibility'
import { BACKUP_MAX_RECORDS } from '../domain/backup'
import { DataError, inputValue } from './httpErrors.js'
import { revisionInput, storedRevision } from './profileRecords.js'

const counter = z.string().regex(/^(0|[1-9]\d{0,15})$/).transform(Number).pipe(z.number().int().max(Number.MAX_SAFE_INTEGER))
const stateSchema = z.object({ generation: entityId, value: visibilitySchema, revision: storedRevision,
  changeRevision: counter, catalogSeeded: z.boolean(),
})

export const readChangeRevision = (input: unknown) => inputValue(() => counter.parse(input))

// Вызывается под блокировкой владельца: первый GET создаёт только настройки.
export async function ensureDiaryState(client: PoolClient, owner: string) {
  await client.query('INSERT INTO health.settings(user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [owner])
  const result = await client.query<Record<string, unknown>>(`SELECT generation,revision::text,change_revision::text AS "changeRevision",catalog_seeded AS "catalogSeeded",
    jsonb_build_object('version',1,'showPhotos',show_photos,'showDocuments',show_documents) AS value FROM health.settings`)
  return stateSchema.parse(result.rows[0])
}

export async function saveSettings(client: PoolClient, owner: string, input: unknown) {
  const { value, revision } = inputValue(() => z.strictObject({ value: visibilitySchema, revision: revisionInput }).parse(input))
  const previous = await ensureDiaryState(client, owner)
  if (previous.revision !== revision) throw new DataError(409)
  const capacity = await client.query<Record<string, unknown>>(`SELECT visibility_defined OR
    (SELECT count(*) FROM health.legacy_metadata) + catalog_seeded::int < $1 AS available FROM health.settings`, [BACKUP_MAX_RECORDS])
  if (!z.object({ available: z.boolean() }).parse(capacity.rows[0]).available) throw new DataError(400)
  const result = await client.query(`UPDATE health.settings SET show_photos=$1,show_documents=$2,visibility_defined=true,revision=revision+1,updated_at=now()
    WHERE revision=$3`, [value.showPhotos, value.showDocuments, revision])
  if (result.rowCount !== 1) throw new DataError(409)
  return ensureDiaryState(client, owner)
}
