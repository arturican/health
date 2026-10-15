import type { PoolClient } from 'pg'
import { initialProducts } from '../domain/initialProducts'
import { BACKUP_MAX_RECORDS } from '../domain/backup'
import { ensureDiaryState } from './diaryState.js'
import { getProductRecord, saveProductRecord } from './productRecords.js'

export async function seedProductRecords(client: PoolClient, owner: string) {
  if ((await ensureDiaryState(client, owner)).catalogSeeded) return { added: 0 }
  let added = 0
  for (const value of initialProducts()) {
    if (await getProductRecord(client, value.id)) continue
    await saveProductRecord(client, owner, { value, revision: null })
    added++
  }
  // Существующая локальная семантика: при полной квоте маркер не добавляется.
  await client.query(`UPDATE health.settings SET catalog_seeded=true,updated_at=now()
    WHERE (SELECT count(*) FROM health.legacy_metadata)+visibility_defined::int < $1`, [BACKUP_MAX_RECORDS])
  return { added }
}
