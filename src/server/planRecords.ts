import type { PoolClient } from 'pg'
import { z } from 'zod'
import { BACKUP_MAX_RECORDS } from '../domain/backup'
import { energyPlanSchema, readEnergyPlanInput } from '../domain/energyPlan'
import { ageOn } from '../domain/input'
import { calendarDate, entityId } from '../domain/schema'
import { runCommand } from './commands.js'
import { DataError, inputValue } from './httpErrors.js'
import { getProfileRecord, revisionInput, storedRevision } from './profileRecords.js'
import { listWeightRecords } from './weightRecords.js'

const recordSchema = z.object({ value: energyPlanSchema, revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) })
const projection = `jsonb_build_object('id',id,'effectiveFrom',effective_from,'createdOn',created_on,'revision',revision,
  'goalKcal',goal_kcal,'method',method,'manualKcal',manual_kcal,'factor',factor,'source',source,'restingFormula',resting_formula,
  'snapshot',jsonb_build_object('kg',snapshot_kg,'weightDate',snapshot_weight_date,'heightCm',snapshot_height_cm,
  'age',snapshot_age,'formulaSex',snapshot_formula_sex)) AS value,revision::text`
const readRow = (input: unknown) => z.object({ value: energyPlanSchema, revision: storedRevision }).parse(input)

export async function listPlanRecords(client: PoolClient, input: unknown) {
  const query = inputValue(() => z.strictObject({ before: storedRevision.optional(),
    limit: z.string().regex(/^[1-9]\d{0,2}$/).transform(Number).pipe(z.number().max(100)).default(100),
  }).parse(input))
  const result = await client.query<Record<string, unknown>>(`SELECT ${projection} FROM health.energy_plans
    WHERE ($1::bigint IS NULL OR revision < $1) ORDER BY revision DESC LIMIT $2`, [query.before ?? null, query.limit + 1])
  const records = result.rows.map(readRow)
  const items = records.slice(0, query.limit)
  return { items, nextBefore: records.length > query.limit ? items.at(-1)?.revision ?? null : null }
}

export async function effectivePlanRecord(client: PoolClient, dateInput: unknown) {
  const date = inputValue(() => calendarDate.parse(dateInput))
  const result = await client.query<Record<string, unknown>>(`SELECT ${projection} FROM health.energy_plans
    WHERE effective_from <= $1 ORDER BY effective_from DESC,revision DESC LIMIT 1`, [date])
  return result.rows[0] ? readRow(result.rows[0]) : null
}

export async function createPlanRecord(client: PoolClient, owner: string, input: unknown, today: string) {
  const { id, value, expectedRevision } = inputValue(() => {
    const body = z.strictObject({ id: entityId, value: z.unknown(), expectedRevision: revisionInput.nullable() }).parse(input)
    return { ...body, value: readEnergyPlanInput(body.value) }
  })
  return runCommand(client, owner, id, { operation: 'createPlan', id, value, expectedRevision }, recordSchema, async () => {
    if (value.effectiveFrom < today) throw new DataError(400)
    const counts = await client.query<Record<string, unknown>>('SELECT max(revision)::text AS revision,count(*)::text AS count FROM health.energy_plans')
    const state = z.object({ revision: storedRevision.nullable(), count: z.coerce.number() }).parse(counts.rows[0])
    if (state.revision !== expectedRevision) throw new DataError(409)
    if (state.count >= BACKUP_MAX_RECORDS) throw new DataError(400)
    if ((await client.query('SELECT 1 FROM health.energy_plans WHERE id=$1', [id])).rowCount !== 0) throw new DataError(409)
    const profile = (await getProfileRecord(client, today))?.value
    const weight = (await listWeightRecords(client, { asOf: today, limit: '1' }, today)).items[0]?.value
    const plan = energyPlanSchema.parse({ ...value, id, revision: (state.revision ?? 0) + 1,
      createdOn: today, restingFormula: 'mifflin-st-jeor-1990', snapshot: {
        kg: weight?.kg ?? null, weightDate: weight?.date ?? null, heightCm: profile?.heightCm ?? null,
        age: profile?.birthDate ? ageOn(profile.birthDate, today) : null, formulaSex: profile?.formulaSex ?? 'none',
      },
    })
    await client.query(`INSERT INTO health.energy_plans(user_id,id,effective_from,created_on,revision,goal_kcal,method,
      manual_kcal,factor,source,resting_formula,snapshot_kg,snapshot_weight_date,snapshot_height_cm,snapshot_age,snapshot_formula_sex)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [owner, id, plan.effectiveFrom, today, plan.revision, plan.goalKcal, plan.method, plan.manualKcal, plan.factor,
      plan.source, plan.restingFormula, plan.snapshot.kg, plan.snapshot.weightDate, plan.snapshot.heightCm, plan.snapshot.age, plan.snapshot.formulaSex])
    return { value: plan, revision: plan.revision }
  })
}
