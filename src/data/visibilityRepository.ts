import { z } from 'zod'
import { db, type DiaryDatabase } from './db'
import { validate } from '../domain/schema'
import { DEFAULT_VISIBILITY, readVisibility, readVisibilityValue, VISIBILITY_SETTING_ID, type Visibility } from '../domain/visibility'
import { assertRecordCapacity } from './recordLimit'
import { DIARY_GENERATION_ID } from './clearDiary'

export async function getVisibility(database: DiaryDatabase = db): Promise<Visibility> {
  const record: unknown = await database.metadata.get(VISIBILITY_SETTING_ID)
  if (record === undefined) return readVisibility(DEFAULT_VISIBILITY)
  const row = validate(z.strictObject({ id: z.literal(VISIBILITY_SETTING_ID), value: z.string() }), record)
  return readVisibilityValue(row.value)
}

export async function saveVisibility(input: unknown, database: DiaryDatabase = db): Promise<void> {
  const visibility = readVisibility(input)
  await database.transaction('rw', database.metadata, async () => {
    if (await database.metadata.get(VISIBILITY_SETTING_ID) === undefined) {
      assertRecordCapacity(await database.metadata.where('id').notEqual(DIARY_GENERATION_ID).count())
    }
    await database.metadata.put({ id: VISIBILITY_SETTING_ID, value: JSON.stringify(visibility) })
  })
}
