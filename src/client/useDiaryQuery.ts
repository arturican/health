import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { getClientSession, subscribeSession } from './session'
import { getQueryRevision, reportQueryError, subscribeQueries } from './queries'

type Result<T> = { identity: string, revision: number, kind: 'ready', value: T } | { identity: string, kind: 'error', error: Error }
type Dependency = string | number | boolean | null | undefined
const getEpoch = () => getClientSession().epoch

export function useDiaryQuery<T>(read: () => Promise<T>, dependencies: readonly Dependency[] = []): T | undefined {
  return useDiaryQueryState(read, dependencies).data
}

export function useDiaryQueryState<T>(read: () => Promise<T>, dependencies: readonly Dependency[] = []): { data: T | undefined; current: boolean } {
  const epoch = useSyncExternalStore(subscribeSession, getEpoch)
  const revision = useSyncExternalStore(subscribeQueries, getQueryRevision)
  const identity = JSON.stringify([epoch, dependencies.map(value => [typeof value, value])])
  const reader = useRef(read), token = useRef(Symbol()), loaded = useRef<string | null>(null)
  const [result, setResult] = useState<Result<T> | null>(null)
  useEffect(() => { reader.current = read })
  useEffect(() => {
    let active = true
    const isActive = () => active // Cleanup может сработать во время await.
    const id = token.current
    void Promise.resolve().then(async () => {
      if (!isActive()) return
      const value = await reader.current()
      if (!isActive()) return
      loaded.current = identity
      reportQueryError(id, false)
      setResult({ identity, revision, kind: 'ready', value })
    }).catch((reason: unknown) => {
      if (!active) return
      reportQueryError(id, loaded.current === identity)
      const error = reason instanceof Error ? reason : new Error('Не удалось загрузить данные.')
      setResult(previous => previous?.identity === identity && previous.kind === 'ready' ? previous : { identity, kind: 'error', error })
    })
    return () => { active = false; reportQueryError(id, false) }
  }, [identity, revision])
  if (result?.identity !== identity) return { data: undefined, current: false }
  if (result.kind === 'error') throw result.error
  return { data: result.value, current: result.revision === revision }
}
