import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../data/db'
import * as repository from '../data/profileRepository'
import * as access from '../dataAccess'
import { ProfilePage } from './ProfilePage'

const savedProfile = {
  id: 'self' as const, name: 'Синтетический профиль', heightCm: 170,
  birthDate: '2000-01-01', formulaSex: 'male' as const,
}
const savedWeight = { id: '00000000-0000-4000-8000-000000000001', date: '2010-01-01', kg: 70 }

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12))
  await Promise.all([db.profiles.clear(), db.weights.clear()])
})

afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  await Promise.all([db.profiles.clear(), db.weights.clear()])
  vi.useRealTimers()
})

async function openForm() {
  const view = render(<ProfilePage />)
  await screen.findByRole('form', { name: 'Создание профиля' })
  return view
}

function enterMeasurements() {
  fireEvent.change(screen.getByRole('textbox', { name: 'Рост, см' }), { target: { value: '170,5' } })
  fireEvent.change(screen.getByRole('textbox', { name: 'Вес, кг' }), { target: { value: '70.5' } })
}

async function openEditor() {
  await repository.createProfile(savedProfile, savedWeight)
  const view = render(<ProfilePage />)
  fireEvent.click(await screen.findByRole('button', { name: 'Редактировать профиль' }))
  await screen.findByRole('form', { name: 'Редактирование профиля' })
  return view
}

it('сохраняет черновик и исходный профиль при фоновом изменении записи', async () => {
  const read = vi.spyOn(access, 'getProfile')
  const update = vi.spyOn(access, 'updateProfile').mockRejectedValue(new Error('Данные изменились'))
  await openEditor()
  fireEvent.change(screen.getByRole('textbox', { name: 'Рост, см' }), { target: { value: '172' } })
  const reads = read.mock.calls.length
  await act(async () => { await repository.updateProfile({ ...savedProfile, heightCm: 180 }) })
  await waitFor(() => { expect(read.mock.calls.length).toBeGreaterThan(reads) })
  expect(screen.getByRole('textbox', { name: 'Рост, см' })).toHaveValue('172')
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить профиль' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Данные изменились')
  expect(update).toHaveBeenCalledWith({ ...savedProfile, heightCm: 172 }, savedProfile)
  expect(screen.getByRole('textbox', { name: 'Рост, см' })).toHaveValue('172')
})

describe('Создание профиля', () => {
  it('показывает загрузку и затем доступную форму без придуманных данных', async () => {
    render(<ProfilePage />)
    expect(screen.getByRole('status')).toHaveTextContent('Загружаем профиль')

    expect(await screen.findByRole('form', { name: 'Создание профиля' })).toBeVisible()
    expect(screen.getByRole('textbox', { name: 'Рост, см' })).toHaveValue('')
    expect(screen.getByRole('textbox', { name: 'Вес, кг' })).toHaveValue('')
    expect(screen.getByLabelText('Дата первого измерения')).toHaveValue('2026-10-14')
    expect(screen.getByRole('combobox')).toHaveValue('none')
  })

  it('сохраняет введённый профиль и одно измерение, затем читает их при повторном открытии', async () => {
    const view = await openForm()
    enterMeasurements()
    fireEvent.change(screen.getByRole('textbox', { name: 'Имя (необязательно)' }), { target: { value: '  Синтетический профиль  ' } })
    fireEvent.change(screen.getByLabelText('Дата рождения (необязательно)'), { target: { value: '2000-02-29' } })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'male' } })
    fireEvent.click(screen.getByRole('button', { name: 'Создать профиль' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Профиль и первое измерение сохранены')
    expect(await screen.findByText('170,5 см')).toBeVisible()
    expect(screen.getByText('29.02.2000')).toBeVisible()
    expect(screen.getByText('Мужской')).toBeVisible()
    expect(await db.profiles.get('self')).toMatchObject({
      name: 'Синтетический профиль', heightCm: 170.5, birthDate: '2000-02-29', formulaSex: 'male',
    })
    const weights = await db.weights.toArray()
    expect(weights).toHaveLength(1)
    expect(weights[0]).toMatchObject({ kg: 70.5, date: '2026-10-14' })

    view.unmount()
    render(<ProfilePage />)
    expect(await screen.findByText('Синтетический профиль')).toBeVisible()
    expect(screen.queryByRole('form', { name: 'Создание профиля' })).not.toBeInTheDocument()
    expect(await db.weights.count()).toBe(1)
  })

  it('сохраняет профиль без необязательных данных и объясняет их отсутствие', async () => {
    await openForm()
    enterMeasurements()
    fireEvent.click(screen.getByRole('button', { name: 'Создать профиль' }))

    expect(await screen.findByText('Не указано')).toBeVisible()
    expect(screen.getByText('Не указана')).toBeVisible()
    expect(screen.getByText('Не указан')).toBeVisible()
    expect(await db.profiles.get('self')).toMatchObject({ name: '', birthDate: null, formulaSex: 'none' })
    expect(await db.weights.count()).toBe(1)
  })

  it.each<{ label: string; value: string; error: RegExp; birthDate?: string }>([
    { label: 'Рост, см', value: '0', error: /Рост должен быть больше нуля/ },
    { label: 'Вес, кг', value: '0', error: /Вес должен быть больше нуля/ },
    { label: 'Дата рождения (необязательно)', value: '2026-10-15', error: /Дата рождения не может быть в будущем/ },
    { label: 'Дата первого измерения', value: '2026-10-15', error: /Дата измерения не может быть в будущем/ },
    { label: 'Дата первого измерения', value: '1999-12-31', birthDate: '2000-01-01', error: /раньше даты рождения/ },
    { label: 'Имя (необязательно)', value: 'а'.repeat(81), error: /Имя слишком длинное/ },
    { label: 'Пол для формулы расхода (необязательно)', value: '', error: /Поле не заполнено/ },
    { label: 'Дата первого измерения', value: '', error: /Введите дату в формате/ },
  ])('привязывает ошибку к полю $label и фокусирует его без записи данных', async ({ label, value, error, birthDate }) => {
    await openForm()
    enterMeasurements()
    if (birthDate) fireEvent.change(screen.getByLabelText('Дата рождения (необязательно)'), { target: { value: birthDate } })
    const input = screen.getByLabelText(label)
    fireEvent.change(input, { target: { value } })
    fireEvent.click(screen.getByRole('button', { name: 'Создать профиль' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Проверьте отмеченные поля')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription(error)
    expect(input).toHaveFocus()
    expect(await db.profiles.count()).toBe(0)
    expect(await db.weights.count()).toBe(0)
  })

  it('не считает незавершённый ввод даты браузером отсутствующей датой рождения', async () => {
    await openForm()
    enterMeasurements()
    const input = screen.getByLabelText<HTMLInputElement>('Дата рождения (необязательно)')
    vi.spyOn(input.validity, 'badInput', 'get').mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Создать профиль' }))

    expect(input).toHaveAccessibleDescription('Проверьте дату рождения')
    expect(input).toHaveFocus()
    expect(await db.profiles.count()).toBe(0)
  })

  it('блокирует форму на время сохранения и повторное нажатие не создаёт второе измерение', async () => {
    const original = repository.createProfile
    const signals: { complete?: () => void } = {}
    const gate = new Promise<void>(resolve => {
      signals.complete = resolve
    })
    const save = vi.spyOn(repository, 'createProfile').mockImplementation(async (profile, weight, database) => {
      await gate
      await original(profile, weight, database)
    })
    await openForm()
    enterMeasurements()
    fireEvent.click(screen.getByRole('button', { name: 'Создать профиль' }))

    expect(screen.getByRole('form', { name: 'Создание профиля' })).toHaveAttribute('aria-busy', 'true')
    const button = screen.getByRole('button', { name: 'Сохраняем…' })
    expect(button).toBeDisabled()
    expect(screen.getByRole('textbox', { name: 'Рост, см' })).toBeDisabled()
    fireEvent.click(button)
    await waitFor(() => {
      expect(save).toHaveBeenCalledTimes(1)
    })
    const complete = signals.complete
    if (!complete) throw new Error('Сигнал завершения не установлен')
    await act(async () => {
      complete()
      await gate
    })
    expect(await screen.findByRole('status')).toHaveTextContent('Профиль и первое измерение сохранены')
    expect(await db.weights.count()).toBe(1)
  })

  it('показывает общую ошибку хранилища без технического содержимого и позволяет повтор', async () => {
    const storageError = Object.assign(new Error('synthetic-private-storage-details'), { name: 'QuotaExceededError' })
    vi.spyOn(repository, 'createProfile').mockRejectedValueOnce(storageError)
    await openForm()
    enterMeasurements()
    fireEvent.click(screen.getByRole('button', { name: 'Создать профиль' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось выполнить действие')
    expect(screen.queryByText('synthetic-private-storage-details')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Создать профиль' })).toBeEnabled()
    expect(await db.profiles.count()).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: 'Создать профиль' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Профиль и первое измерение сохранены')
    expect(await db.weights.count()).toBe(1)
  })
})

describe('Редактирование профиля', () => {
  it('заполняет форму текущими данными и сохраняет изменения без нового измерения', async () => {
    const view = await openEditor()
    expect(screen.getByRole('textbox', { name: 'Имя (необязательно)' })).toHaveValue(savedProfile.name)
    expect(screen.getByRole('textbox', { name: 'Рост, см' })).toHaveValue('170')
    expect(screen.getByLabelText('Дата рождения (необязательно)')).toHaveValue(savedProfile.birthDate)
    expect(screen.getByRole('combobox')).toHaveValue('male')
    expect(screen.queryByLabelText('Вес, кг')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Дата первого измерения')).not.toBeInTheDocument()

    fireEvent.change(screen.getByRole('textbox', { name: 'Имя (необязательно)' }), { target: { value: '' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Рост, см' }), { target: { value: '172,5' } })
    fireEvent.change(screen.getByLabelText('Дата рождения (необязательно)'), { target: { value: '' } })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'none' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить профиль' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Профиль обновлён')
    expect(await screen.findByText('Не указано')).toBeVisible()
    expect(await screen.findByText('Не указана')).toBeVisible()
    expect(await db.weights.toArray()).toEqual([savedWeight])
    view.unmount()
    render(<ProfilePage />)
    expect(await screen.findByText('172,5 см')).toBeVisible()
    expect(await db.profiles.get('self')).toMatchObject({ name: '', birthDate: null, formulaSex: 'none' })
  })

  it('фокусирует ошибочное поле, а отмена удаляет ошибки и несохранённые изменения', async () => {
    await openEditor()
    const height = screen.getByRole('textbox', { name: 'Рост, см' })
    fireEvent.change(height, { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить профиль' }))
    expect(height).toHaveAccessibleDescription('Рост должен быть больше нуля')
    expect(height).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }))

    expect(screen.getByText('170 см')).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(await db.profiles.get('self')).toEqual(savedProfile)
    expect(await db.weights.toArray()).toEqual([savedWeight])
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать профиль' }))
    expect(screen.getByRole('textbox', { name: 'Рост, см' })).toHaveValue('170')
  })

  it('сохраняет форму и старые данные при несовместимой дате рождения', async () => {
    await openEditor()
    fireEvent.change(screen.getByLabelText('Дата рождения (необязательно)'), { target: { value: '2011-01-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить профиль' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Дата рождения позже сохранённого измерения')
    expect(screen.getByRole('form', { name: 'Редактирование профиля' })).toBeVisible()
    expect(await db.profiles.get('self')).toEqual(savedProfile)
    expect(await db.weights.toArray()).toEqual([savedWeight])
  })

  it('блокирует сохранение и отмену во время записи', async () => {
    const original = repository.updateProfile
    const signals: { complete?: () => void } = {}
    const gate = new Promise<void>(resolve => {
      signals.complete = resolve
    })
    const save = vi.spyOn(repository, 'updateProfile').mockImplementation(async (input, database) => {
      await gate
      await original(input, database)
    })
    await openEditor()
    fireEvent.change(screen.getByRole('textbox', { name: 'Рост, см' }), { target: { value: '175' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить профиль' }))
    expect(screen.getByRole('button', { name: 'Сохраняем…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Отмена' })).toBeDisabled()
    expect(screen.getByRole('textbox', { name: 'Рост, см' })).toBeDisabled()
    await waitFor(() => {
      expect(save).toHaveBeenCalledTimes(1)
    })
    const complete = signals.complete
    if (!complete) throw new Error('Сигнал завершения не установлен')
    await act(async () => {
      complete()
      await gate
    })
    expect(await screen.findByRole('status')).toHaveTextContent('Профиль обновлён')
    expect(await db.weights.toArray()).toEqual([savedWeight])
  })

  it('после ошибки хранилища оставляет редактирование доступным и позволяет повтор', async () => {
    vi.spyOn(repository, 'updateProfile').mockRejectedValueOnce(
      Object.assign(new Error('synthetic-private-storage-details'), { name: 'QuotaExceededError' }),
    )
    await openEditor()
    fireEvent.change(screen.getByRole('textbox', { name: 'Рост, см' }), { target: { value: '175' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить профиль' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось выполнить действие')
    expect(screen.queryByText('synthetic-private-storage-details')).not.toBeInTheDocument()
    expect(await db.profiles.get('self')).toEqual(savedProfile)
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить профиль' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Профиль обновлён')
    expect(await screen.findByText('175 см')).toBeVisible()
    expect(await db.weights.toArray()).toEqual([savedWeight])
  })
})
