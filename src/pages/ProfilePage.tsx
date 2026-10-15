import { useState, type SyntheticEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { createProfile, getProfile, updateProfile } from '../data/profileRepository'
import { profileSchema, weightSchema } from '../domain/profile'
import { localDate, parseDate, parseNumber } from '../domain/input'
import { validate } from '../domain/schema'
import { Field, SelectField } from '../ui/Field'
import { Feedback, readField, useAction } from '../ui/actions'
import { exactNumber } from '../ui/exactNumber'
import { Icon } from '../ui/Icon'
import '../profile.css'

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
    <section className="page profile-page" aria-labelledby="profile-title">
      <h1 id="profile-title">Профиль</h1>
      <p>Ваши параметры и данные для расчётов дневника.</p>
      <div className="profile-layout">
      <div className="profile-main">
      {profile === undefined ? <p role="status">Загружаем локальные данные…</p> : profile === null || editing ? (
        <form className="form-grid" onSubmit={submit} noValidate aria-label={editing ? 'Редактирование профиля' : 'Создание профиля'} aria-busy={action.pending}>
          <h2>{editing ? 'Изменить параметры' : 'Основные параметры'}</h2>
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
        <section className="card profile-parameters" aria-label="Сохранённый профиль">
          <div className="profile-identity"><Icon name="profile" /><div><h2>Личные параметры</h2><p>Локальный профиль</p></div></div>
          <dl>
            <dt>Имя</dt><dd>{profile.name || 'Не указано'}</dd>
            <dt>Рост</dt><dd>{exactNumber(profile.heightCm)} см</dd>
            <dt>Дата рождения</dt><dd>{profile.birthDate?.split('-').reverse().join('.') ?? 'Не указана'}</dd>
            <dt>Параметр формулы расхода</dt><dd>{coefficientNames[profile.formulaSex]}</dd>
          </dl>
          <button type="button" onClick={() => { setErrors({}); setEditing(true) }}>Редактировать профиль</button>
        </section>
      )}
      <Feedback error={Object.keys(errors).length > 0 ? null : action.error} message={Object.keys(errors).length > 0 ? null : action.message} />
      </div>
      <aside className="profile-explanations" aria-label="О параметрах профиля">
        <section className="card"><h2><Icon name="profile" /> Для чего эти данные</h2><p>Рост используется для справочного ИМТ. Дата рождения и параметр формулы нужны только для соответствующих расчётов и могут оставаться пустыми.</p><p>Изменение параметров не переписывает сохранённую историю веса.</p></section>
        <section className="card"><h2><Icon name="weight" /> История измерений</h2><p>Новые измерения сохраняются отдельно, по датам.</p><a className="primary-link" href="#weight">Перейти к весу</a></section>
        <section className="card"><h2><Icon name="settings" /> Ваши данные</h2><p>Данные остаются в этом браузере. Приложение не шифрует локальное хранилище.</p><a href="#settings">Настройки и резервные копии</a></section>
      </aside>
      </div>
    </section>
  )
}
