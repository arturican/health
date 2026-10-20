import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { PrivacySettings } from './PrivacySettings'
import { EnergyPlanSettings } from './EnergyPlanSettings'
import { invalidateQueries } from '../client/queries'
import { setClientSession } from '../client/session'
import { energyPlanInputSchema } from '../domain/energyPlan'
import { clientDiary, clientSession, jsonResponse } from '../../tests/clientSession'

vi.unmock('../dataAccess')
const plan = { id: '10000000-0000-4000-8000-000000000021', revision: 1, createdOn: '2026-10-20', effectiveFrom: '2026-10-20', goalKcal: 2000, method: 'none', manualKcal: null, factor: null, source: '', restingFormula: 'mifflin-st-jeor-1990', snapshot: { kg: null, heightCm: null, age: null, formulaSex: 'none', weightDate: null } }
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-20T12:00:00Z'))
  setClientSession(clientSession, clientDiary)
})
afterEach(() => { cleanup(); setClientSession(null); vi.unstubAllGlobals(); vi.useRealTimers() })

it.each(['settings', 'plan'] as const)('%s сохраняет старую ревизию до явного отбрасывания ввода', async kind => {
  let revision = 1
  let release: () => void = () => { throw new Error('Нет ожидающей записи') }
  const pending = new Promise<void>(resolve => { release = resolve })
  const revisions: (number | null)[] = []
  const state = () => ({ ...clientDiary, revision, changeRevision: revision - 1, value: { ...clientDiary.value, showPhotos: revision === 1, showDocuments: revision === 1 } })
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, options) => {
    if (input === '/api/v1/diary-state') return jsonResponse(state())
    if (typeof input === 'string' && input.startsWith('/api/v1/energy-plans?')) return jsonResponse({ items: [{ value: { ...plan, revision, goalKcal: revision === 1 ? 2000 : 2300 }, revision }], nextBefore: null })
    if (typeof options?.body !== 'string') throw new Error('Тест ожидает JSON команду')
    const body: unknown = JSON.parse(options.body)
    const command = z.object({ revision: z.number().optional(), expectedRevision: z.number().nullable().optional(), value: z.unknown() }).parse(body)
    revisions.push(kind === 'settings' ? command.revision ?? null : command.expectedRevision ?? null)
    if (revisions.length === 1) { revision = 2; await pending }
    if (revisions.at(-1) !== revision) return new Response(null, { status: 409 })
    revision++
    return jsonResponse(kind === 'settings' ? state() : { value: { ...plan, ...energyPlanInputSchema.parse(command.value), revision }, revision })
  }))
  render(<main tabIndex={-1}>{kind === 'settings' ? <PrivacySettings /> : <EnergyPlanSettings />}</main>)
  const fieldLabel = kind === 'settings' ? 'Показывать фото' : 'Калорийная цель, ккал/сутки (необязательно)'
  const saveName = kind === 'settings' ? 'Сохранить видимость' : 'Сохранить новую версию'
  const resetName = kind === 'settings' ? 'Отбросить ввод и загрузить текущие настройки' : 'Отбросить ввод и загрузить текущий план'
  const field = await screen.findByLabelText(fieldLabel)
  if (kind === 'settings') fireEvent.click(field)
  else fireEvent.change(field, { target: { value: '2100' } })
  const reset = screen.getByRole('button', { name: resetName })
  fireEvent.click(screen.getByRole('button', { name: saveName }))
  await waitFor(() => { expect(revisions).toEqual([1]) })
  expect(reset).toBeDisabled()
  release()
  await screen.findByText('Данные изменились. Обновите запись и повторите действие.')
  await waitFor(() => { expect(screen.getByRole('button', { name: saveName })).toBeEnabled() })
  if (kind === 'settings') expect(screen.getByLabelText('Показывать документы и показатели')).toBeChecked()
  else expect(field).toHaveValue('2100')
  fireEvent.click(screen.getByRole('button', { name: saveName }))
  await waitFor(() => { expect(revisions).toEqual([1, 1]) })
  await waitFor(() => { expect(reset).toBeEnabled() })
  fireEvent.click(reset)
  await waitFor(() => { expect(screen.queryByRole('alert')).not.toBeInTheDocument() })
  if (kind === 'settings') {
    expect(screen.getByLabelText(fieldLabel)).not.toBeChecked()
    expect(screen.getByLabelText('Показывать документы и показатели')).not.toBeChecked()
  } else expect(screen.getByLabelText(fieldLabel)).toHaveValue('2300')
  await waitFor(() => { expect(screen.getByLabelText(kind === 'settings' ? fieldLabel : 'Дата начала действия плана')).toHaveFocus() })
  if (kind === 'plan') {
    revision = 3
    act(() => { invalidateQueries() })
    await screen.findByText('Версия 3, действует с 2026-10-20')
    await waitFor(() => { expect(screen.getByRole('button', { name: saveName })).toBeEnabled() })
    fireEvent.click(screen.getByRole('button', { name: saveName }))
    await screen.findByText('Данные изменились. Обновите запись и повторите действие.')
    expect(revisions).toEqual([1, 1, 2])
    await waitFor(() => { expect(screen.getByRole('button', { name: resetName })).toBeEnabled() })
    fireEvent.click(screen.getByRole('button', { name: resetName }))
  }
  fireEvent.click(screen.getByRole('button', { name: saveName }))
  await screen.findByText(kind === 'settings' ? 'Видимость разделов сохранена' : 'Новая версия плана сохранена')
  expect(revisions).toEqual(kind === 'settings' ? [1, 1, 2] : [1, 1, 2, 3])
})
