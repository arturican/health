import { db, type DiaryDatabase } from './db'

export async function clearDiary(database: DiaryDatabase = db): Promise<void> {
  await database.transaction('rw', database.tables, async () => {
    for (const table of database.tables) await table.clear()
  })
}
