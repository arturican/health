import { workoutSchema, workoutInputSchema, type Workout } from '../domain/activity'
import { calendarDate } from '../domain/schema'
import { localDate } from '../domain/input'
import { readPages } from './pages'
import { deleteRecord, mutateJSON } from './mutations'
import { recordRevision, recordSchema } from './records'

const schema = recordSchema(workoutSchema)
export async function listWorkouts(date: unknown = localDate()) {
  return (await readPages(`/api/v1/workouts?date=${calendarDate.parse(date)}`, schema)).sort((a, b) => a.kind.localeCompare(b.kind, 'ru') || a.id.localeCompare(b.id))
}
export function addWorkout(input: unknown) {
  const value = workoutInputSchema.parse(input)
  return mutateJSON('createWorkout', value, schema, id => ({ path: '/api/v1/workouts', method: 'POST', value: { value: { ...value, id }, revision: null } }))
}
export async function updateWorkout(original: Workout, input: unknown) {
  const value = { value: { ...workoutInputSchema.parse(input), id: original.id }, revision: recordRevision(original) }
  await mutateJSON('updateWorkout', value, schema, () => ({ path: `/api/v1/workouts/${original.id}`, method: 'PUT', value }))
}
export const deleteWorkout = (original: Workout) => deleteRecord(`/api/v1/workouts/${original.id}`, original)
