import { afterEach, expect, it, vi } from 'vitest'
import { ClientChannel } from '../../tests/clientChannel'
import { listenAccountChanges, notifyAccountChange } from './accountChanges'

afterEach(() => { ClientChannel.open.clear(); ClientChannel.messages = []; vi.unstubAllGlobals() })
it('посылает только сигнал смены, игнорирует посторонние сообщения и закрывает канал', () => {
  vi.stubGlobal('BroadcastChannel', ClientChannel)
  const listener = vi.fn(), close = listenAccountChanges(listener)
  notifyAccountChange()
  expect(listener).not.toHaveBeenCalled()
  expect(ClientChannel.messages).toEqual(['changed'])
  const sender = new ClientChannel('health-diary-auth')
  sender.postMessage('changed')
  expect(listener).toHaveBeenCalledOnce()
  sender.postMessage({ untrusted: 'synthetic' })
  expect(listener).toHaveBeenCalledOnce()
  sender.close()
  close()
  expect(ClientChannel.open.size).toBe(0)
  notifyAccountChange()
  expect(listener).toHaveBeenCalledOnce()
})

it('работает без доступного BroadcastChannel', () => {
  const denied = vi.fn(function () { throw new Error('Synthetic denied channel') })
  for (const implementation of [undefined, denied]) {
    vi.stubGlobal('BroadcastChannel', implementation)
    expect(() => { notifyAccountChange(); listenAccountChanges(vi.fn())() }).not.toThrow()
  }
})
