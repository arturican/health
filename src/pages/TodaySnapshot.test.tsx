import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TodayPage } from './TodayPage'
import { DayProvider } from '../ui/DayContext'
import { DayPicker } from '../ui/DayPicker'
import * as summaries from '../client/summaries'
import { getVisibility } from '../client/visibilityRepository'
import { invalidateQueries } from '../client/queries'
import { setClientSession } from '../client/session'
vi.unmock('../dataAccess')
vi.mock('../client/summaries')
vi.mock('../client/visibilityRepository')
type Snapshot=Awaited<ReturnType<typeof summaries.getTodaySummary>>
function snapshot(day:string,kg:number):Snapshot {
  return {day,profile:{id:'self',name:'Synthetic',heightCm:170,birthDate:null,formulaSex:'none'},
    weights:[{id:'10000000-0000-4000-8000-000000000001',date:day,kg}],entries:[],status:null,plan:null,steps:null,workouts:[]}
}
beforeEach(()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-15T12:00:00Z'))
  vi.clearAllMocks()
  vi.mocked(summaries.getTodaySummary).mockReset()
  vi.mocked(getVisibility).mockResolvedValue({version:1,showPhotos:true,showDocuments:true})
  setClientSession({account:{id:'10000000-0000-4000-8000-000000000001',login:'alice',timezone:'UTC'},csrf:'a'.repeat(64)})
})
afterEach(()=>{cleanup();setClientSession(null);vi.useRealTimers()})
it('shared snapshot сохраняет stale данные, запрещает write и отбрасывает поздний ответ другого дня',async()=>{
  let resolveOld:(value:Snapshot)=>void=()=>{throw new Error('not ready')}
  const old=new Promise<Snapshot>(done=>{resolveOld=done})
  vi.mocked(summaries.getTodaySummary).mockResolvedValueOnce(snapshot('2026-10-15',72)).mockRejectedValueOnce(new Error('synthetic')).mockReturnValueOnce(old).mockResolvedValueOnce(snapshot('2026-10-14',68))
  render(<DayProvider><DayPicker/><TodayPage/></DayProvider>)
  await screen.findByText('72 кг, измерено 15.10.2026.')
  const complete=screen.getByRole('checkbox',{name:'За этот день внесена вся еда'})
  expect(complete).toBeEnabled()
  act(()=>{invalidateQueries()})
  await waitFor(()=>{expect(summaries.getTodaySummary).toHaveBeenCalledTimes(2)})
  expect(complete).toBeDisabled()
  expect(screen.getByText('72 кг, измерено 15.10.2026.')).toBeVisible()
  act(()=>{invalidateQueries()})
  await waitFor(()=>{expect(summaries.getTodaySummary).toHaveBeenCalledTimes(3)})
  fireEvent.change(screen.getByLabelText('День дневника'),{target:{value:'2026-10-14'}})
  fireEvent.click(screen.getByRole('button',{name:'Открыть день'}))
  await screen.findByText('68 кг, измерено 14.10.2026.')
  await act(async()=>{resolveOld(snapshot('2026-10-15',99));await old})
  expect(screen.queryByText('99 кг, измерено 15.10.2026.')).not.toBeInTheDocument()
  expect(screen.getByText('68 кг, измерено 14.10.2026.')).toBeVisible()
  expect(complete).toBeEnabled()
  expect(summaries.getWeightOverview).not.toHaveBeenCalled()
  expect(summaries.getNutritionSummary).not.toHaveBeenCalled()
  expect(summaries.getEnergySummary).not.toHaveBeenCalled()
  expect(summaries.getActivitySummary).not.toHaveBeenCalled()
})
