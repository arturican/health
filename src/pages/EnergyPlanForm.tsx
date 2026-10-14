import { useEffect, useRef, useState, type SyntheticEvent } from 'react'
import { addEnergyPlan } from '../data/energyPlanRepository'
import { energyPlanInputSchema, type EnergyPlanInput } from '../domain/energyPlan'
import { localDate, parseNumber } from '../domain/input'
import { validate } from '../domain/schema'
import { Field, SelectField } from '../ui/Field'
import { Feedback, readField, useAction } from '../ui/actions'

export function EnergyPlanForm() {
  const action = useAction()
  const [method, setMethod] = useState<EnergyPlanInput['method']>('none')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [revision, setRevision] = useState(0)
  const formRef = useRef<HTMLFormElement>(null)
  const focusAfterSave = useRef(false)
  useEffect(() => {
    if (focusAfterSave.current && !action.pending) {
      focusAfterSave.current = false
      formRef.current?.querySelector<HTMLInputElement>('[name="effectiveFrom"]')?.focus()
    }
  }, [revision, action.pending])

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const fieldErrors: Record<string, string> = {}
    const effectiveFrom = readField(form, 'effectiveFrom', text => {
      const date = validate(energyPlanInputSchema.shape.effectiveFrom, text)
      if (date < localDate()) throw new Error('Новая версия действует с сегодняшнего или будущего дня')
      return date
    }, fieldErrors)
    const goalKcal = readField(form, 'goalKcal', text => validate(energyPlanInputSchema.shape.goalKcal, parseNumber(text, { optional: true })), fieldErrors)
    const selectedMethod = readField(form, 'method', text => validate(energyPlanInputSchema.shape.method, text), fieldErrors)
    const manualKcal = selectedMethod === 'manual' ? readField(form, 'manualKcal', text => validate(energyPlanInputSchema.shape.manualKcal, parseNumber(text)), fieldErrors) : null
    const factor = selectedMethod === 'factor' ? readField(form, 'factor', text => validate(energyPlanInputSchema.shape.factor, parseNumber(text)), fieldErrors) : null
    const source = readField(form, 'source', text => validate(energyPlanInputSchema.shape.source, text), fieldErrors)
    setErrors(fieldErrors)
    if (effectiveFrom === null || selectedMethod === null || source === null || Object.keys(fieldErrors).length > 0) {
      const first = Object.keys(fieldErrors)[0]
      if (first) event.currentTarget.querySelector<HTMLElement>(`[name="${first}"]`)?.focus()
      return
    }
    action.run(async () => {
      await addEnergyPlan({ effectiveFrom, goalKcal, method: selectedMethod, manualKcal, factor, source })
      setMethod('none')
      focusAfterSave.current = true
      setRevision(value => value + 1)
    }, 'Новая версия плана сохранена')
  }

  return <>
    <form ref={formRef} key={revision} className="form-grid" aria-label="Новая версия энергетического плана" onSubmit={submit} noValidate>
      <fieldset disabled={action.pending}>
        <legend>Новая версия плана</legend>
        <Field label="Дата начала действия плана" name="effectiveFrom" type="date" required min={localDate()} defaultValue={localDate()} error={errors['effectiveFrom']} />
        <Field label="Калорийная цель, ккал/сутки (необязательно)" name="goalKcal" inputMode="decimal" maxLength={12} error={errors['goalKcal']} />
        <p>Пустое поле означает, что цель не задана. Цель и оценка расхода задаются отдельно.</p>
        <SelectField label="Способ оценки суточного расхода" name="method" value={method} onChange={event => { setMethod(validate(energyPlanInputSchema.shape.method, event.target.value)) }} error={errors['method']}>
          <option value="none">Без оценки расхода</option>
          <option value="manual">Общая ручная оценка</option>
          <option value="factor">Расход в покое × коэффициент активности</option>
        </SelectField>
        {method === 'manual' && <Field label="Общая ручная оценка расхода, ккал/сутки" name="manualKcal" inputMode="decimal" maxLength={12} required error={errors['manualKcal']} />}
        {method === 'factor' && <Field label="Ваш коэффициент активности" name="factor" inputMode="decimal" maxLength={12} required error={errors['factor']} />}
        <Field label="Источник оценки расхода (необязательно)" name="source" maxLength={160} error={errors['source']} />
      </fieldset>
      <button type="submit" disabled={action.pending}>{action.pending ? 'Сохраняем…' : 'Сохранить новую версию'}</button>
    </form>
    <Feedback error={action.error} message={action.message} />
  </>
}
