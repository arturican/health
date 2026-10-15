import { expect } from 'vitest'
import type { DiaryDatabase, Metadata } from '../src/data/db'
import { DIARY_GENERATION_ID } from '../src/data/clearDiary'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function expectDiaryMetadata(database: DiaryDatabase, expected: readonly Metadata[] = []): Promise<void> {
  const actual = await database.metadata.toArray()
  const marker = actual.find(row => row.id === DIARY_GENERATION_ID)
  expect(marker?.value).toMatch(uuid)
  expect(marker).toEqual({ id: DIARY_GENERATION_ID, value: marker?.value })
  expect(actual).toHaveLength(expected.length + 1)
  expect(actual).toEqual(expect.arrayContaining([...expected]))
}

export async function expectDiaryUserDataEmpty(database: DiaryDatabase): Promise<void> {
  const counts = await Promise.all(database.tables.filter(table => table.name !== 'metadata').map(table => table.count()))
  expect(counts).toEqual(Array.from({ length: 12 }, () => 0))
  await expectDiaryMetadata(database)
}
