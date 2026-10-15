import { BACKUP_MAX_RECORDS } from '../domain/backup'

export function hasRecordCapacity(count: number, additional = 1): boolean {
  return count + additional <= BACKUP_MAX_RECORDS
}

/** Check inside the same read-write transaction as the insertion. */
export function assertRecordCapacity(count: number, additional = 1): void {
  if (!hasRecordCapacity(count, additional)) throw new Error(`Достигнут лимит записей раздела (${String(BACKUP_MAX_RECORDS)}). Новые записи не сохранены.`)
}
