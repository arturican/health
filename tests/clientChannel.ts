export class ClientChannel {
  static open = new Set<ClientChannel>()
  static messages: unknown[] = []
  private listeners = new Set<(event: MessageEvent<unknown>) => void>()
  constructor(readonly name: string) { ClientChannel.open.add(this) }
  addEventListener(_type: string, listener: (event: MessageEvent<unknown>) => void) { this.listeners.add(listener) }
  postMessage(data: unknown) {
    ClientChannel.messages.push(data)
    for (const channel of ClientChannel.open) {
      if (channel === this || channel.name !== this.name) continue
      for (const listener of channel.listeners) listener(new MessageEvent<unknown>('message', { data }))
    }
  }
  close() { ClientChannel.open.delete(this) }
}
