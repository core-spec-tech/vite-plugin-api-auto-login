import { ServerResponse } from 'node:http'
import type { IncomingMessage } from 'node:http'

export const createRequest = (overrides: Partial<IncomingMessage> = {}) =>
  ({
    headers: {
      accept: 'text/html',
    },
    method: 'GET',
    url: '/',
    ...overrides,
  }) as IncomingMessage

export const createResponse = () => new ServerResponse(createRequest())
