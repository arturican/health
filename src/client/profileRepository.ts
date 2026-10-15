import { profileSchema, weightSchema, type Profile } from '../domain/profile'
import { requestJSON } from './http'
import { mutateJSON } from './mutations'
import { recordRevision, recordSchema } from './records'

const schema = recordSchema(profileSchema)
export const getProfile = () => requestJSON('/api/v1/profile', schema.nullable())
export async function createProfile(profileInput: unknown, weightInput: unknown) {
  const profile = profileSchema.parse(profileInput)
  const { date, kg } = weightSchema.parse(weightInput)
  const weight = { date, kg }
  await mutateJSON('createProfile', { profile, weight }, schema, id => ({ path: '/api/v1/profile', method: 'POST', value: { profile, weight: { ...weight, id } } }))
}
export async function updateProfile(input: unknown, original: Profile) {
  const value = { value: profileSchema.parse(input), revision: recordRevision(original) }
  await mutateJSON('updateProfile', value, schema, () => ({ path: '/api/v1/profile', method: 'PUT', value }))
}
