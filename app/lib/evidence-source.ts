import { bitrixConfig, requiredRuntimeValue } from "./config";

const VIBECODE_HOST = "vibecode.bitrix24.tech";

export type EvidenceSource =
  | { kind: "redirect"; url: URL }
  | { kind: "proxy"; url: URL; headers: Headers };

export function evidenceSource(
  value: string | undefined,
  range?: string | null,
): EvidenceSource {
  const url = new URL(value ?? "");
  if (url.protocol !== "https:") {
    throw new Error("Недопустимый адрес файла");
  }

  if (url.hostname.toLowerCase() === bitrixConfig.portalHost) {
    return { kind: "redirect", url };
  }

  const expectedPrefix = `/v1/items/${bitrixConfig.entityTypeId}/`;
  if (
    url.hostname.toLowerCase() !== VIBECODE_HOST ||
    !url.pathname.startsWith(expectedPrefix) ||
    !url.pathname.includes("/files/") ||
    !url.pathname.endsWith("/download")
  ) {
    throw new Error("Недопустимый адрес файла");
  }

  const headers = new Headers({
    Accept: "*/*",
    "X-Api-Key": requiredRuntimeValue("VIBECODE_API_KEY"),
  });
  if (range) headers.set("Range", range);
  return { kind: "proxy", url, headers };
}

export function evidenceResponseHeaders(
  upstream: Response,
  fallbackType: string,
  disposition: string,
): Headers {
  const headers = new Headers({
    "Content-Type": upstream.headers.get("content-type") ?? fallbackType,
    "Content-Disposition": disposition,
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
  for (const name of ["content-length", "content-range", "accept-ranges"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

export function evidenceDisposition(
  name: string,
  mode: "download" | "preview",
): string {
  const encoded = encodeURIComponent(name || "material");
  return `${mode === "download" ? "attachment" : "inline"}; filename*=UTF-8''${encoded}`;
}
