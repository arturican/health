import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useVisibility } from './useVisibility'
import * as access from '../dataAccess'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

it('скрывает разделы при ошибке и повторяет чтение по явному действию', async () => {
  const value = { version: 1 as const, showPhotos: true, showDocuments: false }
  const read = vi.spyOn(access, 'getVisibility').mockRejectedValueOnce(new Error('synthetic')).mockResolvedValue(value)
  const { result } = renderHook(() => useVisibility())
  await waitFor(() => { expect(result.current?.failed).toBe(true) })
  expect(result.current?.value).toEqual({ version: 1, showPhotos: false, showDocuments: false })
  act(() => { result.current?.retry() })
  await waitFor(() => { expect(result.current?.failed).toBe(false) })
  expect(result.current?.value).toEqual(value)
  expect(read).toHaveBeenCalledTimes(2)
})
