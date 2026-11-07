export const RequestErrorCode = { TrackDoesNotExist: 404n }

export class MoqtClientWrapper {
  constructor() {
    this.id = crypto.randomUUID()
    this.handlers = new Map()
    this.pending = new Map()
    this.nextToken = 0
    this.raw = {
      sendSubgroupHeader: async () => {},
      sendSubgroupObject: async (alias, group, _subgroup, object, status, payload) => {
        if (status !== undefined) return
        const send = () =>
          this.post({
            type: 'object',
            alias: String(alias),
            group: String(group),
            object: String(object),
            status: status === undefined ? null : Number(status),
            payload: Array.from(payload)
          })
        const hook = window.yoruMoqFrame
        if (hook && hook('send', payload, send) === false) return
        await send()
      }
    }
  }
  async connect(url) {
    if (!['https://127.0.0.1:4433/', 'https://relay.moqt.research.skyway.io/'].includes(url))
      throw new Error('Mock accepts only its test relay URLs')
    this.events = new EventSource('/__yoru_moq/events?id=' + encodeURIComponent(this.id))
    await new Promise((resolve, reject) => {
      this.events.onmessage = (event) => {
        const message = JSON.parse(event.data)
        if (message.type === 'open') resolve()
        else void this.receive(message)
      }
      this.events.onerror = () => {
        reject(new Error('Mock relay unavailable'))
        this.closed?.()
      }
    })
    this.unload = () => navigator.sendBeacon('/__yoru_moq', JSON.stringify({ id: this.id, type: 'close' }))
    window.addEventListener('pagehide', this.unload)
  }
  async post(message) {
    const response = await fetch('/__yoru_moq', { method: 'POST', body: JSON.stringify({ id: this.id, ...message }) })
    if (!response.ok) throw new Error('Mock relay request failed')
  }
  async receive(message) {
    if (message.type === 'namespace')
      await this.namespace?.({ publishNamespace: { trackNamespace: message.namespace }, respondOk: async () => {} })
    if (message.type === 'done') this.done?.({ trackNamespace: message.namespace })
    if (message.type === 'unsubscribe') this.unsubscribe?.(BigInt(message.requestId))
    if (message.type === 'subscribe') {
      const requestId = BigInt(message.requestId)
      await this.incoming?.({
        subscribe: { requestId, trackNamespace: message.namespace, trackName: message.trackName },
        isSuccess: true,
        code: 0,
        respondOk: async () => {
          await this.post({ type: 'subscribe-result', requestId: message.requestId })
          return requestId
        },
        respondError: async (_code, error) =>
          this.post({ type: 'subscribe-result', requestId: message.requestId, error })
      })
    }
    if (message.type === 'subscribe-result') {
      const pending = this.pending.get(message.token)
      if (!pending) return
      this.pending.delete(message.token)
      if (message.error) pending.reject(new Error(message.error))
      else pending.resolve({ requestId: BigInt(message.requestId), subscribeOk: { trackAlias: BigInt(message.alias) } })
    }
    if (message.type === 'object') {
      const payload = new Uint8Array(message.payload)
      if (message.status === null) window.yoruMoqFrame?.('receive', payload)
      this.handlers.get(message.alias)?.(BigInt(message.group), {
        objectId: BigInt(message.object),
        objectStatus: message.status === null ? undefined : message.status,
        objectPayload: payload
      })
    }
  }
  setOnConnectionClosedHandler(handler) {
    this.closed = handler
  }
  setOnIncomingSubscribeHandler(handler) {
    this.incoming = handler
  }
  setOnIncomingUnsubscribeHandler(handler) {
    this.unsubscribe = handler
  }
  setOnPublishNamespaceDoneHandler(handler) {
    this.done = handler
  }
  setOnPublishNamespaceHandler(handler) {
    this.namespace = handler
  }
  setOnSubgroupObjectHandler(alias, handler) {
    this.handlers.set(String(alias), handler)
  }
  clearSubgroupObjectHandler(alias) {
    this.handlers.delete(String(alias))
  }
  publishNamespace(namespace) {
    return this.post({ type: 'publish', namespace })
  }
  subscribeNamespace(namespace) {
    return this.post({ type: 'follow', namespace })
  }
  async subscribe(namespace, trackName) {
    const token = ++this.nextToken
    const result = new Promise((resolve, reject) => this.pending.set(token, { resolve, reject }))
    await this.post({ type: 'subscribe', namespace, trackName, token })
    return result
  }
  getRawClient() {
    return this.raw
  }
  async disconnect() {
    window.removeEventListener('pagehide', this.unload)
    await this.post({ type: 'close' })
    this.events.close()
  }
}
