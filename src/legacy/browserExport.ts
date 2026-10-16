import { readFullBackup, fullBackupSchema, type BackupFile } from '../domain/fullBackup'
import { readStoredFile } from '../domain/storedFile'
import { readPhoto } from '../domain/photo'
import { encodeBase64 } from '../domain/base64'
import { checkBackupFile } from '../media/checkBackupFile'

const stores = ['profiles', 'weights', 'products', 'foodEntries', 'nutritionDays', 'steps', 'workouts', 'energyPlans', 'metadata', 'photos', 'documents', 'labResults', 'files'] as const
type Snapshot = Record<(typeof stores)[number], unknown[]>

function openExisting(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open('health-diary')
    request.onupgradeneeded = () => { request.transaction?.abort() }
    request.onerror = () => { reject(new Error('Прежняя база недоступна или не найдена в этом браузере.')) }
    request.onsuccess = () => { resolve(request.result) }
  })
}

function readSnapshot(database: IDBDatabase): Promise<Snapshot> {
  return new Promise((resolve, reject) => {
    const result: Snapshot = { profiles: [], weights: [], products: [], foodEntries: [], nutritionDays: [], steps: [], workouts: [], energyPlans: [], metadata: [], photos: [], documents: [], labResults: [], files: [] }
    const present = stores.filter(name => database.objectStoreNames.contains(name))
    if (!present.length) { reject(new Error('В прежней базе нет таблиц дневника.')); return }
    const transaction = database.transaction(present, 'readonly')
    transaction.onabort = transaction.onerror = () => { reject(new Error('Не удалось прочитать прежний дневник.')) }
    transaction.oncomplete = () => { resolve(result) }
    for (const name of present) {
      const request = transaction.objectStore(name).getAll()
      request.onsuccess = () => {
        const value: unknown = request.result
        if (!Array.isArray(value)) { transaction.abort(); return }
        result[name] = value
      }
    }
  })
}

export async function exportBrowserDiary(factory = globalThis.indexedDB) {
  if (typeof factory === 'undefined') throw new Error('Этот браузер не предоставляет доступ к прежней базе.')
  const database = await openExisting(factory)
  let snapshot: Snapshot
  try { snapshot = await readSnapshot(database) }
  finally { database.close() }
  if (snapshot.profiles.length > 1) throw new Error('В прежней базе найдено несколько профилей.')
  const photos = snapshot.photos.map(readPhoto)
  const byFile = new Map(photos.map(photo => [photo.fileId, photo]))
  const files: BackupFile[] = []
  for (const record of snapshot.files) {
    const file = readStoredFile(record)
    files.push({ id: file.id, purpose: file.purpose, mime: file.mime, size: file.size, base64: encodeBase64(await checkBackupFile(file, byFile.get(file.id))) })
  }
  const metadata = fullBackupSchema.shape.metadata.parse(snapshot.metadata).filter(row => row.id !== 'diary-generation')
  return readFullBackup({
    format: 'health-diary-full', version: 1, metadata, photos, documents: snapshot.documents, labResults: snapshot.labResults, files,
    text: { format: 'health-diary-text', version: 1, exportedAt: new Date().toISOString(),
      profile: snapshot.profiles[0] ?? null, weights: snapshot.weights, products: snapshot.products, foodEntries: snapshot.foodEntries,
      nutritionDays: snapshot.nutritionDays, steps: snapshot.steps, workouts: snapshot.workouts, energyPlans: snapshot.energyPlans },
  })
}
