import { ApiClientError } from "../api";

export type ErrorCode = "rpc" | "not_found" | "bad_request" | "unknown";

export function classifyError(err: unknown): { code: ErrorCode; message: string } {
  if (err instanceof ApiClientError) {
    if (err.code === "rpc_error") return { code: "rpc", message: err.message };
    if (err.code === "not_found") return { code: "not_found", message: err.message };
    if (err.code === "bad_request") return { code: "bad_request", message: err.message };
    return { code: "unknown", message: err.message };
  }
  return { code: "unknown", message: (err as Error).message };
}

export function toDate(timestamp?: number | null): string {
  if (!timestamp) return "-";
  return new Date(timestamp * 1000).toLocaleString();
}

export function toRelativeTime(timestamp?: number | null): string {
  if (!timestamp) return "-";
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - timestamp);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function isAddressLike(value: string): boolean {
  return (
    value.startsWith("ZER0x") &&
    value.length === 45 &&
    [...value.slice(5)].every((c) => /[0-9a-fA-F]/.test(c))
  );
}

export function isHashLike(value: string): boolean {
  return value.startsWith("0x") && value.length === 66;
}

export function isCopyableHexValue(value: string): boolean {
  if (isAddressLike(value)) return true;
  if (!value.startsWith("0x")) return false;
  return value.length > 2 && [...value.slice(2)].every((c) => /[0-9a-fA-F]/.test(c));
}

export function normalizeFieldValue(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
}

export function objectEntries(value: unknown): [string, unknown][] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>);
}
