import Dexie, { type Table } from 'dexie'
import { type Profile, type Weight } from '../domain/profile'
import { type Product } from '../domain/nutrition'

export interface Metadata {
  id: string
  value: string
}

export class DiaryDatabase extends Dexie {
  declare metadata: Table<Metadata, string>
  declare profiles: Table<Profile, string>
  declare weights: Table<Weight, string>
  declare products: Table<Product, string>

  constructor(name = 'health-diary') {
    super(name)
    this.version(1).stores({ metadata: 'id' })
    this.version(2).stores({ profiles: 'id', weights: 'id,&date' })
    this.version(3).stores({ products: 'id,name' })
  }
}

export const db = new DiaryDatabase(import.meta.env.MODE === 'test' ? 'health-diary-tests' : 'health-diary')
