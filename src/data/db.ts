import Dexie, { type Table } from 'dexie'
import { type Profile, type Weight } from '../domain/profile'
import { type Product, type FoodEntry, type NutritionDay } from '../domain/nutrition'
import { type Steps, type Workout } from '../domain/activity'

export interface Metadata {
  id: string
  value: string
}

export class DiaryDatabase extends Dexie {
  declare metadata: Table<Metadata, string>
  declare profiles: Table<Profile, string>
  declare weights: Table<Weight, string>
  declare products: Table<Product, string>
  declare foodEntries: Table<FoodEntry, string>
  declare nutritionDays: Table<NutritionDay, string>
  declare steps: Table<Steps, string>
  declare workouts: Table<Workout, string>

  constructor(name = 'health-diary') {
    super(name)
    this.version(1).stores({ metadata: 'id' })
    this.version(2).stores({ profiles: 'id', weights: 'id,&date' })
    this.version(3).stores({ products: 'id,name' })
    this.version(4).stores({ foodEntries: 'id,date,[date+meal]' })
    this.version(5).stores({ nutritionDays: 'date' })
    this.version(6).stores({ steps: 'date' })
    this.version(7).stores({ workouts: 'id,date' })
  }
}

export const db = new DiaryDatabase(import.meta.env.MODE === 'test' ? 'health-diary-tests' : 'health-diary')
