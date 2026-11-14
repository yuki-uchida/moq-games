/**
 * The art worker: paints what the page asks for with its own copy of the registry and posts the pixels back
 * (transferred, not copied). A painter that throws is reported to the page, which then tries it itself.
 */
import { answer, type ArtRequest, type WorkerReply } from './remote'

interface Scope {
  onmessage: ((event: { data: { id: number; request: ArtRequest } }) => void) | null
  postMessage(message: WorkerReply, transfer?: Transferable[]): void
}

const scope = self as unknown as Scope

scope.onmessage = (event) => {
  const { id, request } = event.data
  let message: WorkerReply
  let transfer: ArrayBuffer[] = []
  try {
    const answered = answer(request)
    message = { id, ok: true, reply: answered.reply }
    transfer = answered.transfer
  } catch (error) {
    message = { id, ok: false, error: error instanceof Error ? error.message : String(error) }
  }
  scope.postMessage(message, transfer)
}
