import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiClientError, api } from '../../src/api'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json'
    }
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('api client', () => {
  it('encodes search queries and returns parsed JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        kind: 'address',
        primary_id: 'ZER0x1111111111111111111111111111111111111111',
        canonical_route: '/accounts/ZER0x1111111111111111111111111111111111111111',
        value: { ok: true }
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await api.search('account/with space')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/search/account%2Fwith%20space')
    expect(result.kind).toBe('address')
    expect(result.value).toEqual({ ok: true })
  })

  it('surfaces structured API errors from non-OK responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            code: 'bad_request',
            message: 'invalid address'
          },
          400
        )
      )
    )

    await expect(api.account('not-an-address')).rejects.toEqual(
      expect.objectContaining<ApiClientError>({
        message: 'invalid address',
        status: 400,
        code: 'bad_request'
      })
    )
  })

  it('retries transient network errors before succeeding', async () => {
    vi.useFakeTimers()
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('temporary offline'))
      .mockResolvedValueOnce(
        jsonResponse({
          chain_id: '0x2756',
          network_id: '0x2756',
          latest_block_number: 12,
          latest_block_hash: null,
          latest_block_timestamp: null,
          mining: true,
          hashrate: '0x0',
          gas_price: '0x1',
          coinbase: 'ZER0x1111111111111111111111111111111111111111'
        })
      )
    vi.stubGlobal('fetch', fetchMock)

    const request = api.networkStats()
    await vi.runAllTimersAsync()
    const result = await request

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.latest_block_number).toBe(12)
    expect(result.mining).toBe(true)
  })
})
