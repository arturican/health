import { parseDate } from './input'
import { readSteps, readWorkout } from './activity'

export function activityDates(day: string): string[] {
  const end = Date.parse(`${parseDate(day)}T00:00:00Z`)
  return Array.from({ length: 7 }, (_, index) => new Date(end - (6 - index) * 86400000).toISOString().slice(0, 10)).filter(date => date >= '0001-01-01')
}

export function activityOverview(day: string, stepsInput: readonly unknown[], workoutsInput: readonly unknown[]) {
  const steps = stepsInput.map(readSteps)
  const workouts = workoutsInput.map(readWorkout).filter(workout => workout.date === day)
  const days = activityDates(day).map(date => ({ date, count: steps.find(entry => entry.date === date)?.count ?? null }))
  return {
    days,
    maximum: Math.max(1, ...days.map(entry => entry.count ?? 0)),
    count: workouts.length,
    minutes: workouts.length === 0 ? null : workouts.reduce((total, workout) => total + workout.minutes, 0),
    steps: days.find(entry => entry.date === day)?.count ?? null,
  }
}
