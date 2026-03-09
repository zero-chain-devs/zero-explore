import React, { StrictMode, act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useLatestAsyncEffect } from '../../src/hooks/useLatestAsyncEffect'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useLatestAsyncEffect', () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount()
      })
    }
    container?.remove()
    vi.restoreAllMocks()
  })

  it('only resets when disabled and does not start the request', async () => {
    const request = vi.fn().mockResolvedValue('ok')
    const reset = vi.fn()
    const onSuccess = vi.fn()

    function Harness() {
      useLatestAsyncEffect(request, [], {
        enabled: false,
        reset,
        onSuccess,
      })
      return null
    }

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root.render(
        <StrictMode>
          <Harness />
        </StrictMode>,
      )
    })

    expect(reset).toHaveBeenCalled()
    expect(request).not.toHaveBeenCalled()
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('ignores stale success results after deps change', async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    const request = vi.fn<(key: string) => Promise<string>>()
    request.mockImplementation((key: string) => (key === 'first' ? first.promise : second.promise))
    const seen: string[] = []

    function Harness({ keyName }: { keyName: string }) {
      const [value, setValue] = useState('idle')
      useLatestAsyncEffect(() => request(keyName), [keyName], {
        reset: () => setValue('loading'),
        onSuccess: (next) => {
          seen.push(next)
          setValue(next)
        },
      })
      return <div data-testid="value">{value}</div>
    }

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root.render(<Harness keyName="first" />)
    })
    expect(container.textContent).toBe('loading')

    await act(async () => {
      root.render(<Harness keyName="second" />)
    })
    expect(container.textContent).toBe('loading')

    await act(async () => {
      second.resolve('second-result')
      await second.promise
    })
    expect(container.textContent).toBe('second-result')

    await act(async () => {
      first.resolve('first-result')
      await first.promise
    })
    expect(container.textContent).toBe('second-result')
    expect(seen).toEqual(['second-result'])
  })

  it('ignores stale errors and only reports the latest request error', async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    const request = vi.fn<(key: string) => Promise<string>>()
    request.mockImplementation((key: string) => (key === 'first' ? first.promise : second.promise))
    const onError = vi.fn()

    function Harness({ keyName }: { keyName: string }) {
      useLatestAsyncEffect(() => request(keyName), [keyName], {
        onSuccess: () => undefined,
        onError,
      })
      return null
    }

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root.render(<Harness keyName="first" />)
    })
    await act(async () => {
      root.render(<Harness keyName="second" />)
    })

    const latestError = new Error('latest failed')
    await act(async () => {
      second.reject(latestError)
      try {
        await second.promise
      } catch {}
    })

    const staleError = new Error('stale failed')
    await act(async () => {
      first.reject(staleError)
      try {
        await first.promise
      } catch {}
    })

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(latestError)
  })
})
