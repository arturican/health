let shared: BroadcastChannel | null = null
const listeners = new Set<() => void>()
function openChannel() {
  if (shared) return shared
  try {
    if (typeof BroadcastChannel === 'undefined') return null
    shared = new BroadcastChannel('health-diary-auth')
    shared.addEventListener('message', (event: MessageEvent<unknown>) => {
      if (event.data === 'changed') for (const listener of listeners) listener()
    })
    return shared
  }
  catch { return null } // При запрете канала остаётся сверка владельца HTTP-ответа.
}

function closeIdleChannel() {
  if (listeners.size === 0) { shared?.close(); shared = null }
}

export function notifyAccountChange() {
  const channel = openChannel()
  try { channel?.postMessage('changed') }
  catch { /* Канал необязателен; медицинские данные через него не передаются. */ }
  finally { closeIdleChannel() }
}

export function listenAccountChanges(onChange: () => void) {
  listeners.add(onChange)
  openChannel()
  return () => { listeners.delete(onChange); closeIdleChannel() }
}
