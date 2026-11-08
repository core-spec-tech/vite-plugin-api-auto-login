import type { IncomingMessage } from 'node:http'

export function isHtmlDocumentRequest(req: IncomingMessage): boolean {
  const isReadRequest = req.method === 'GET' || req.method === 'HEAD'
  const acceptsHtml = req.headers.accept?.includes('text/html') ?? false
  const isWebSocket = req.headers.upgrade?.toLowerCase() === 'websocket'
  return isReadRequest && acceptsHtml && !isWebSocket
}
