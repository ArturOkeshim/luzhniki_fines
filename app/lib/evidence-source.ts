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

const AJAX_PHP_NAME = /^ajax\.php$/iu;

function nameFromDisposition(disposition: string): string {
  const encoded = disposition.match(/filename\*\s*=\s*([^;]+)/iu)?.[1] ?? "";
  const plain = disposition.match(/(?:^|;)\s*filename\s*=\s*(?:"([^"]+)"|([^";]+))/iu);
  const raw = (encoded || plain?.[1] || plain?.[2] || "")
    .trim()
    .replace(/^UTF-8''/iu, "")
    .replace(/^"(.*)"$/u, "$1");
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function extensionFromType(contentType: string): string {
  const subtype = contentType.split(";")[0].trim().toLowerCase().split("/")[1] ?? "";
  if (subtype === "quicktime") return "mov";
  if (subtype === "x-msvideo") return "avi";
  if (subtype === "jpeg") return "jpg";
  if (/^[a-z0-9]{2,8}$/u.test(subtype) && subtype !== "php") return subtype;
  return "";
}

export function evidenceDownloadName(
  name: string,
  upstreamDisposition = "",
  contentType = "",
): string {
  const trimmed = name.trim();
  if (!AJAX_PHP_NAME.test(trimmed)) return trimmed;

  const upstreamName = nameFromDisposition(upstreamDisposition).trim();
  const usableUpstream = upstreamName && !AJAX_PHP_NAME.test(upstreamName) ? upstreamName : "";
  const existingExtension = usableUpstream.match(/\.([A-Za-z0-9]{2,8})$/u)?.[1].toLowerCase() ?? "";
  if (existingExtension && existingExtension !== "php") return usableUpstream;

  const extension = extensionFromType(contentType);
  const base = usableUpstream.replace(/\.[A-Za-z0-9]{2,8}$/u, "").trim() || "file";
  return extension ? `${base}.${extension}` : usableUpstream || "file";
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
