import { z } from 'zod'
import { productSchema, snapshotSchema, type Product } from '../domain/nutrition'
import { entityId } from '../domain/schema'
import { ApiError, requestJSON } from './http'
import { readPages } from './pages'
import { mutateJSON } from './mutations'
import { recordRevision, recordSchema } from './records'

const schema = recordSchema(productSchema)
export async function listProducts(includeArchived = false) {
  return (await readPages(`/api/v1/products?archived=${String(includeArchived)}`, schema)).sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}
export async function getProduct(idInput: unknown) {
  try { return await requestJSON(`/api/v1/products/${entityId.parse(idInput)}`, schema) }
  catch (error) { if (error instanceof ApiError && error.status === 404) return null; throw error }
}
export async function addProduct(input: unknown) {
  const product = { ...productSchema.parse(input), id: null }
  await mutateJSON('createProduct', product, schema, id => ({ path: '/api/v1/products', method: 'POST', value: { value: { ...product, id }, revision: null } }))
}
async function saveProduct(original: Product, product: Product) {
  const value = { value: product, revision: recordRevision(original) }
  await mutateJSON('updateProduct', value, schema, () => ({ path: `/api/v1/products/${original.id}`, method: 'PUT', value }))
}
export const updateProduct = (original: Product, input: unknown) => saveProduct(original, { ...snapshotSchema.parse(input), id: original.id, archived: original.archived })
export const archiveProduct = (original: Product, archived: unknown) => saveProduct(original, { ...original, archived: z.boolean().parse(archived) })
export async function seedProducts() {
  await mutateJSON('seedProducts', {}, z.object({ added: z.number().int().nonnegative() }), () => ({ path: '/api/v1/products/seed', method: 'POST', value: {} }))
}
