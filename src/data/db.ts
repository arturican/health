import Dexie, { type Table } from 'dexie'

export interface Metadata {
  id: string
  value: string
}

export class DiaryDatabase extends Dexie {
  declare metadata: Table<Metadata, string>

  constructor(name = 'health-diary') {
    super(name)
    this.version(1).stores({ metadata: 'id' })
  }
}

export const db = new DiaryDatabase(import.meta.env.MODE === 'test' ? 'health-diary-tests' : 'health-diary')
