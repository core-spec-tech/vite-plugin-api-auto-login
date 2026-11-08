import { describe, expect, it } from 'vitest'

import { isHtmlDocumentRequest } from '@/http/isHtmlDocumentRequest'
import { createRequest } from '../helpers/http'

describe('isHtmlDocumentRequest', () => {
  it('accepts HTML document requests', () => {
    expect(isHtmlDocumentRequest(createRequest())).toBe(true)
  })

  it('rejects websocket upgrades', () => {
    expect(
      isHtmlDocumentRequest(
        createRequest({
          headers: {
            accept: 'text/html',
            upgrade: 'websocket',
          },
        }),
      ),
    ).toBe(false)
  })

  it('rejects non-GET and non-HEAD requests', () => {
    expect(
      isHtmlDocumentRequest(
        createRequest({
          method: 'POST',
        }),
      ),
    ).toBe(false)
  })

  it('rejects non-HTML requests', () => {
    expect(
      isHtmlDocumentRequest(
        createRequest({
          headers: {
            accept: 'text/css,*/*;q=0.1',
          },
        }),
      ),
    ).toBe(false)
  })
})
