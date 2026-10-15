import { checkAttachment } from '../domain/attachment'
import { readStoredFile, type StoredFile } from '../domain/storedFile'

export async function prepareFile(input: unknown, purposeInput: unknown): Promise<StoredFile> {
  const checked = await checkAttachment(input, purposeInput)
  return readStoredFile({ ...checked, id: crypto.randomUUID(), purpose: purposeInput })
}
