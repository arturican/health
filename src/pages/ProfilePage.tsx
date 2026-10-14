import { useState, type SyntheticEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { createProfile, getProfile, updateProfile } from '../data/profileRepository'
import { profileSchema, weightSchema } from '../domain/profile'
import { localDate, parseDate, parseNumber } from '../domain/input'
import { validate } from '../domain/schema'
import { Field, SelectField } from '../ui/Field'
import { Feedback, readField, useAction } from '../ui/actions'

const coefficientNames = { none: 'Не указан', male: 'Мужской', female: 'Женский' }

export function ProfilePage() {
  const profile = useLiveQuery(() => getProfile(), [])
  const action = useAction()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState(false)

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const fieldErrors: Record<string, string> = {}
    const birthControl = event.currentTarget.elements.namedItem('birthDate')
    const name = readField(form, 'name', text => validate(profileSchema.shape.name, text), fieldErrors)
    const heightCm = readField(form, 'heightCm', text => validate(profileSchema.shape.heightCm, parseNumber(text)), fieldErrors)
    const birthDate = readField(form, 'birthDate', text => {
      if (birthControl instanceof HTMLInputElement && birthControl.validity.badInput) throw new Error('Проверьте дату рождения')
      return validate(profileSchema.shape.birthDate, text || null)
    }, fieldErrors)
    const formulaSex = readField(form, 'formulaSex', text => validate(profileSchema.shape.formulaSex, text), fieldErrors)
    const kg = editing ? null : readField(form, 'kg', text => validate(weightSchema.shape.kg, parseNumber(text)), fieldErrors)
    const date = editing ? null : readField(form, 'date', text => {
      const value = parseDate(text)
      if (value > localDate()) throw new Error('Дата измерения не может быть в будущем')
      return value
    }, fieldErrors)
    if (birthDate && date && date < birthDate) fieldErrors['date'] = 'Дата измерения раньше даты рождения'
    setErrors(fieldErrors)
    if (name === null || heightCm === null || formulaSex === null || Object.keys(fieldErrors).length > 0) {
      const first = Object.keys(fieldErrors)[0]
      if (first) event.currentTarget.querySelector<HTMLElement>(`[name="${first}"]`)?.focus()
      return
    }
    const nextProfile = { id: 'self', name, heightCm, birthDate, formulaSex }
    if (editing) {
      action.run(async () => {
        await updateProfile(nextProfile)
        setEditing(false)
      }, 'Профиль обновлён')
      return
    }
    if (kg === null || date === null) return
    action.run(() => createProfile(
      nextProfile,
      { id: crypto.randomUUID(), date, kg },
    ), 'Профиль и первое измерение сохранены')
  }

  return (
    <section className="page" aria-labelledby="profile-title">
      <h1 id="profile-title">Профиль</h1>
      {profile === undefined ? <p role="status">Загружаем локальные данные…</p> : profile === null || editing ? (
        <form className="form-grid" onSubmit={submit} noValidate aria-label={editing ? 'Редактирование профиля' : 'Создание профиля'} aria-busy={action.pending}>
          <p>{editing ? 'Изменение профиля сохраняет историю измерений.' : 'Создайте профиль и сохраните первое измерение.'} Дата рождения и параметр формулы необязательны.</p>
          <fieldset disabled={action.pending}>
            <legend>Личные параметры</legend>
            <Field label="Имя (необязательно)" name="name" maxLength={80} defaultValue={profile?.name ?? ''} error={errors['name']} />
            <Field label="Рост, см" name="heightCm" inputMode="decimal" maxLength={12} defaultValue={profile?.heightCm ?? ''} required error={errors['heightCm']} />
            <Field label="Дата рождения (необязательно)" name="birthDate" type="date" max={localDate()} defaultValue={profile?.birthDate ?? ''} error={errors['birthDate']} />
            <SelectField label="Пол для формулы расхода (необязательно)" name="formulaSex" defaultValue={profile?.formulaSex ?? 'none'} error={errors['formulaSex']}>
              <option value="none">Не указывать</option><option value="male">Мужской</option><option value="female">Женский</option>
            </SelectField>
          </fieldset>
          {!editing && <fieldset disabled={action.pending}>
            <legend>Первое измерение</legend>
            <Field label="Вес, кг" name="kg" inputMode="decimal" maxLength={12} required error={errors['kg']} />
            <Field label="Дата первого измерения" name="date" type="date" defaultValue={localDate()} max={localDate()} required error={errors['date']} />
          </fieldset>}
          {Object.keys(errors).length > 0 && <p role="alert">Проверьте отмеченные поля.</p>}
          <button type="submit" disabled={action.pending}>{action.pending ? 'Сохраняем…' : editing ? 'Сохранить профиль' : 'Создать профиль'}</button>
          {editing && <button type="button" disabled={action.pending} onClick={() => { setEditing(false); setErrors({}) }}>Отмена</button>}
        </form>
      ) : (
        <>
          <dl>
            <dt>Имя</dt><dd>{profile.name || 'Не указано'}</dd>
            <dt>Рост</dt><dd>{profile.heightCm.toLocaleString('ru-RU')} см</dd>
            <dt>Дата рождения</dt><dd>{profile.birthDate?.split('-').reverse().join('.') ?? 'Не указана'}</dd>
            <dt>Параметр формулы расхода</dt><dd>{coefficientNames[profile.formulaSex]}</dd>
          </dl>
          <button type="button" onClick={() => { setErrors({}); setEditing(true) }}>Редактировать профиль</button>
        </>
      )}
      <Feedback error={Object.keys(errors).length > 0 ? null : action.error} message={Object.keys(errors).length > 0 ? null : action.message} />
      <p>Данные остаются в этом браузере. Приложение не шифрует локальное хранилище.</p>
    </section>
  )
}
