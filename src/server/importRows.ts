import type { PoolClient } from 'pg'

type ImportTable = 'profiles' | 'weights' | 'products' | 'food_entries' | 'nutrition_days' | 'steps' | 'workouts' | 'energy_plans'
type Cell = string | number | boolean | null | Buffer

// Имена таблиц/колонок задаются только кодом; все данные идут параметрами.
export async function importRows(client: PoolClient, owner: string, table: ImportTable, columns: readonly string[], rows: readonly (readonly Cell[])[]) {
  for (let offset = 0; offset < rows.length; offset += 256) {
    const batch = rows.slice(offset, offset + 256)
    if (batch.some(row => row.length !== columns.length)) throw new Error('Неверная строка импорта')
    const tuples = batch.map((row, index) => `($1,${row.map((_value, column) => `$${String(2 + index * columns.length + column)}`).join(',')})`)
    await client.query(`INSERT INTO health.${table}(user_id,${columns.join(',')}) VALUES ${tuples.join(',')}`, [owner, ...batch.flat()])
  }
}
