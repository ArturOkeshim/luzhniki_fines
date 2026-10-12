import { requiredRuntimeValue } from "./config";

const VIBECODE_ORIGIN = "https://vibecode.bitrix24.tech";

export class VibeCodeError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status = 500, code?: string) {
    super(message);
    this.name = "VibeCodeError";
    this.status = status;
    this.code = code;
  }
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
};

export async function vibeRequest<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const apiKey = requiredRuntimeValue("VIBECODE_API_KEY");
  const url = new URL(path, VIBECODE_ORIGIN);
  const response = await fetch(url, {
    ...options,
    signal: options.signal ?? AbortSignal.timeout(15_000),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
      ...options.headers,
    },
    body:
      options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const raw = await response.text();
  let payload: Record<string, unknown> | null = null;
  try {
    payload = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
  } catch {
    payload = null;
  }

  if (!response.ok || payload?.success === false) {
    const error = payload?.error as
      | { message?: string; code?: string }
      | string
      | undefined;
    const message =
      typeof error === "object"
        ? error.message
        : typeof error === "string"
          ? error
          : undefined;
    const code = typeof error === "object" ? error.code : undefined;
    throw new VibeCodeError(
      message || "Битрикс24 временно не ответил",
      response.status,
      code,
    );
  }

  return (payload && "data" in payload ? payload.data : payload) as T;
}

export function asEntityList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (!data || typeof data !== "object") return [];

  const record = data as Record<string, unknown>;
  for (const key of ["items", "entities", "results", "result"]) {
    if (Array.isArray(record[key])) return record[key] as T[];
  }
  return [];
}

export function entityId(data: unknown): number {
  if (typeof data === "number") return data;
  if (!data || typeof data !== "object") return 0;
  const record = data as Record<string, unknown>;
  const nested =
    record.item && typeof record.item === "object"
      ? (record.item as Record<string, unknown>)
      : record;
  return Number(nested.id ?? nested.ID ?? 0);
}
