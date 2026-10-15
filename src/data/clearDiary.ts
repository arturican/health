import { db, type DiaryDatabase } from './db'

export const DIARY_GENERATION_ID = 'diary-generation'

export async function readDiaryGeneration(database: DiaryDatabase): Promise<string | null> {
  return (await database.metadata.get(DIARY_GENERATION_ID))?.value ?? null
}

export async function assertDiaryGeneration(expected: string | null, database: DiaryDatabase): Promise<void> {
  if (await readDiaryGeneration(database) !== expected) {
    throw new Error('Дневник был удалён или восстановлен. Повторите действие с актуальными данными.')
  }
}

export async function advanceDiaryGeneration(database: DiaryDatabase): Promise<void> {
  await database.metadata.put({ id: DIARY_GENERATION_ID, value: crypto.randomUUID() })
}

export async function clearDiary(database: DiaryDatabase = db): Promise<void> {
  await database.transaction('rw', database.tables, async () => {
    for (const table of database.tables) await table.clear()
    await advanceDiaryGeneration(database)
  })
}
