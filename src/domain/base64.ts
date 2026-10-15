import { DOCUMENT_MAX_BYTES } from './attachment'

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
export function isCanonicalBase64(input: unknown, size: number): input is string {
  if (!Number.isInteger(size) || size < 1 || size > DOCUMENT_MAX_BYTES || typeof input !== 'string' || input.length !== 4 * Math.ceil(size / 3)) return false
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(input)) return false
  const padding = (3 - size % 3) % 3
  if (input.indexOf('=') !== (padding ? input.length - padding : -1)) return false
  const last = alphabet.indexOf(input[input.length - padding - 1] ?? '')
  return padding === 2 ? (last & 15) === 0 : padding === 1 ? (last & 3) === 0 : true
}
export function encodeBase64(input: unknown): string {
  if (!(input instanceof Uint8Array) || input.byteLength < 1 || input.byteLength > DOCUMENT_MAX_BYTES) throw new Error('Некорректный размер двоичного файла')
  const chunks: string[] = []
  // Divisible by 3: only the last chunk may contain padding; spread stays bounded.
  for (let start = 0; start < input.length; start += 32766) {
    chunks.push(btoa(String.fromCharCode(...input.subarray(start, start + 32766))))
  }
  return chunks.join('')
}
export function decodeBase64(input: unknown, size: number): Uint8Array {
  if (!isCanonicalBase64(input, size)) throw new Error('Некорректные данные Base64 файла')
  let binary: string
  try { binary = atob(input) }
  catch { throw new Error('Не удалось декодировать файл копии') }
  if (binary.length !== size) throw new Error('Размер файла не соответствует данным')
  const bytes = new Uint8Array(size)
  for (let index = 0; index < size; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}
