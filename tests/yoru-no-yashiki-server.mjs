import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'

// This server is used only by the local, mocked MoQ E2E tests.

const server = await createServer({
  configFile: 'vite.config.yoru-no-yashiki.mjs',
  resolve: {
    alias: [
      {
        find: '@moq-games/moqt-client',
        replacement: fileURLToPath(new URL('./yoru-no-yashiki-moq-mock.mjs', import.meta.url))
      }
    ]
  },
  server: { hmr: false, port: Number(process.env.E2E_PORT || 5195) }
})
const clients = new Map()
let nextId = 1
const same = (first, second) => JSON.stringify(first) === JSON.stringify(second)
const emit = (client, event) => client?.response.write('data: ' + JSON.stringify(event) + '\n\n')
const announce = (publisher, subscriber) => {
  if (publisher.namespace && subscriber.following && same(publisher.namespace, subscriber.following))
    emit(subscriber, { type: 'namespace', namespace: publisher.namespace })
}
const remove = (id) => {
  const client = clients.get(id)
  if (!client) return
  clients.delete(id)
  for (const other of clients.values()) {
    if (client.namespace && same(other.following, client.namespace))
      emit(other, { type: 'done', namespace: client.namespace })
    if (other.subscription?.subscriber === id)
      emit(other, { type: 'unsubscribe', requestId: other.subscription.requestId })
  }
}
server.middlewares.use('/__yoru_moq', (request, response) => {
  const url = new URL(request.url, 'http://localhost')
  if (request.method === 'GET' && url.pathname === '/events') {
    const id = url.searchParams.get('id')
    if (!id || clients.has(id)) {
      response.writeHead(400).end()
      return
    }
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    })
    const client = { id, response }
    clients.set(id, client)
    emit(client, { type: 'open' })
    request.on('close', () => remove(id))
    return
  }
  if (request.method !== 'POST') {
    response.writeHead(405).end()
    return
  }
  let body = ''
  request.on('data', (chunk) => {
    body += chunk
  })
  request.on('end', () => {
    try {
      const message = JSON.parse(body)
      const client = clients.get(message.id)
      if (!client) {
        response.writeHead(404).end()
        return
      }
      if (message.type === 'publish') {
        client.namespace = message.namespace
        for (const other of clients.values()) announce(client, other)
      } else if (message.type === 'follow') {
        client.following = message.namespace
        for (const other of clients.values()) announce(other, client)
      } else if (message.type === 'subscribe') {
        const publisher = [...clients.values()].find((other) => same(other.namespace, message.namespace))
        if (!publisher) throw new Error('namespace unavailable')
        const requestId = String(nextId++)
        publisher.subscription = { subscriber: client.id, requestId, token: message.token }
        emit(publisher, { type: 'subscribe', requestId, namespace: message.namespace, trackName: message.trackName })
      } else if (message.type === 'subscribe-result') {
        const subscription = client.subscription
        if (!subscription || subscription.requestId !== message.requestId) throw new Error('unknown subscription')
        emit(clients.get(subscription.subscriber), {
          type: 'subscribe-result',
          token: subscription.token,
          requestId: subscription.requestId,
          alias: subscription.requestId,
          error: message.error
        })
      } else if (message.type === 'object') {
        const subscription = client.subscription
        if (!subscription || subscription.requestId !== message.alias) throw new Error('unknown alias')
        emit(clients.get(subscription.subscriber), {
          type: 'object',
          alias: message.alias,
          group: message.group,
          object: message.object,
          status: message.status,
          payload: message.payload
        })
      } else if (message.type === 'close') {
        remove(client.id)
        client.response.end()
      } else throw new Error('unknown operation')
      response.writeHead(204).end()
    } catch {
      response.writeHead(400).end()
    }
  })
})
server.middlewares.stack.unshift(server.middlewares.stack.pop())
await server.listen()
server.printUrls()
