import { describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '../../src/api';
import {
  classifyError,
  isAddressLike,
  isCopyableHexValue,
  isHashLike,
  normalizeFieldValue,
  objectEntries,
  toRelativeTime,
} from '../../src/utils/explorer';

describe('explorer helpers', () => {
  it('classifies ApiClientError by code and preserves message', () => {
    expect(classifyError(new ApiClientError('rpc failed', 502, 'rpc_error'))).toEqual({
      code: 'rpc',
      message: 'rpc failed',
    });
    expect(classifyError(new ApiClientError('missing', 404, 'not_found')).code).toBe('not_found');
    expect(classifyError(new Error('boom'))).toEqual({ code: 'unknown', message: 'boom' });
  });

  it('detects canonical addresses, tx hashes and copyable hex values', () => {
    const address = 'ZER0x1111111111111111111111111111111111111111';
    const hash = `0x${'a'.repeat(64)}`;
    expect(isAddressLike(address)).toBe(true);
    expect(isAddressLike('0x1111111111111111111111111111111111111111')).toBe(false);
    expect(isHashLike(hash)).toBe(true);
    expect(isHashLike('0x1234')).toBe(false);
    expect(isCopyableHexValue(address)).toBe(true);
    expect(isCopyableHexValue(hash)).toBe(true);
    expect(isCopyableHexValue('not-hex')).toBe(false);
  });

  it('normalizes field values and safely enumerates objects', () => {
    expect(normalizeFieldValue(null)).toBe('-');
    expect(normalizeFieldValue(true)).toBe('true');
    expect(normalizeFieldValue({ ok: true })).toBe('{"ok":true}');
    expect(objectEntries({ a: 1, b: 'x' })).toEqual([
      ['a', 1],
      ['b', 'x'],
    ]);
    expect(objectEntries(['x'])).toEqual([]);
  });

  it('formats relative time buckets from seconds to days', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    expect(toRelativeTime(1_700_000_000 - 45)).toBe('45s ago');
    expect(toRelativeTime(1_700_000_000 - 5 * 60)).toBe('5m ago');
    expect(toRelativeTime(1_700_000_000 - 2 * 3600)).toBe('2h ago');
    expect(toRelativeTime(1_700_000_000 - 3 * 86400)).toBe('3d ago');
    expect(toRelativeTime(undefined)).toBe('-');
    vi.restoreAllMocks();
  });
});
