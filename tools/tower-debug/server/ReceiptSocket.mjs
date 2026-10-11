import { createServer, createConnection } from 'node:net'
import { chmod, lstat, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { record, fail } from './Validation.mjs'

function frame(value, maximum = 65536) {
  const body = Buffer.from(JSON.stringify(value))
  if (body.length > maximum) fail('IPC response exceeds limit', 413)
  const header = Buffer.alloc(4)
  header.writeUInt32BE(body.length)
  return Buffer.concat([header, body])
}
function receive(socket, callback, maximum = 65536) {
  let data = Buffer.alloc(0),
    done = false
  socket.setTimeout(5000, () => socket.destroy())
  socket.on('data', (chunk) => {
    if (done) return socket.destroy()
    if (data.length + chunk.length > maximum + 4) return socket.destroy()
    data = Buffer.concat([data, chunk])
    if (data.length < 4) return
    const length = data.readUInt32BE()
    if (length < 2 || length > maximum || data.length > length + 4) return socket.destroy()
    if (data.length === length + 4) {
      done = true
      try {
        callback(JSON.parse(data.subarray(4).toString('utf8')))
      } catch {
        socket.destroy()
      }
    }
  })
}
export async function openReceiptSocket(store) {
  const path = resolve(store.root, 'receipt.sock')
  try {
    await lstat(path)
    throw new Error('Receipt socket already exists; verify its owner before recovery')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const server = createServer((socket) => {
    receive(socket, async (command) => {
      try {
        let result
        if (command.command === 'list') {
          record(command, ['command', 'status', 'after', 'limit'], ['command'])
          result = store.list(command)
        } else if (command.command === 'get') {
          record(command, ['command', 'ticketId'])
          result = store.get(command.ticketId)
        } else if (command.command === 'appendReceipt') result = await store.appendReceipt(command)
        else if (command.command === 'appendResult') result = await store.appendResult(command)
        else fail('Unsupported receipt command')
        socket.end(frame({ ok: true, result }, 1024 * 1024))
      } catch (error) {
        socket.end(
          frame({
            ok: false,
            status: error.status ?? 500,
            code: error.code ?? 'store-unavailable',
            message: error.status ? error.message : 'Receipt operation failed'
          })
        )
      }
    })
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(path, resolve)
  })
  await chmod(path, 0o600)
  return {
    path,
    async close() {
      await new Promise((resolve) => server.close(resolve))
      try {
        await unlink(path)
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
    }
  }
}
export async function receiptRequest(path, command) {
  const stat = await lstat(path)
  if (!stat.isSocket() || (stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid()))
    throw new Error('Receipt socket owner or mode is unsafe')
  return new Promise((resolve, reject) => {
    const socket = createConnection(path)
    socket.once('error', reject)
    socket.once('timeout', () => reject(new Error('Receipt request timed out')))
    socket.once('end', () => reject(new Error('Receipt response ended early')))
    receive(
      socket,
      (value) => {
        resolve(value)
        socket.end()
      },
      1024 * 1024
    )
    socket.once('connect', () => socket.write(frame(command)))
  })
}
