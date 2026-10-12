import { bitrixConfig } from "./config";
import { bitrixRestRequest } from "./bitrix";
import { asEntityList, vibeRequest } from "./vibecode";

export const FIELDS = {
  plate: "ufCrm_6A428CDD7BD93",
  photo: "ufCrm18_1785152335762",
  materials: "ufCrm18_1785752541701",
  location: "ufCrm18FineLocation",
  occurredAt: "ufCrm18FineDatetime",
  video: "ufCrm18FineVideo",
  amount: "ufCrm18FineAmount",
  comment: "ufCrm18_1785332296250",
  phone: "ufCrm18DriverPhone",
  paymentId: "ufCrm18PaymentId",
  paymentUrl: "ufCrm18PaymentUrl",
  email: "ufCrm18DriverEmail",
  evidenceFolderId: "ufCrm18EvidenceFolderId",
} as const;

export const STAGES = {
  draft: "DT1112_71:CLIENT",
  prohibited: "DT1112_71:NEW",
  awaiting: "DT1112_71:PREPARATION",
  paidInFines: "DT1112_71:SUCCESS",
  failed: "DT1112_71:FAIL",
  paidAtBuildingReset: "DT1112_67:NEW",
  paidAtBuilding: "DT1112_67:UC_PAID_FINE",
} as const;

export const ALLOWED_FINE_AMOUNTS = [10, 5000, 10000, 25000] as const;

const FINE_AMOUNT_ENUM_VALUES: Record<number, number> = {
  583: 5000,
  584: 10000,
  585: 25000,
  586: 10,
};

export function isAllowedFineAmount(amount: number): boolean {
  return (ALLOWED_FINE_AMOUNTS as readonly number[]).includes(amount);
}

export type RawFine = Record<string, unknown> & {
  id: number | string;
  categoryId?: number | string;
  stageId?: string;
  opportunity?: number | string;
};

type FineProductRow = Record<string, unknown> & {
  productName?: string;
  name?: string;
};

type FineProductCacheEntry = {
  expiresAt: number;
  value: Promise<string>;
};

const globalFineCache = globalThis as typeof globalThis & {
  __luzhnikiFineProductCache?: Map<number, FineProductCacheEntry>;
};
const fineProductCache =
  globalFineCache.__luzhnikiFineProductCache ??
  (globalFineCache.__luzhnikiFineProductCache = new Map());
const FINE_PRODUCT_CACHE_TTL_MS = 10 * 60 * 1000;
const FINE_PRODUCT_CACHE_MAX_ITEMS = 1_000;

export type EvidenceFile = {
  id: number;
  name: string;
  machineUrl?: string;
  viewUrl?: string;
  contentType?: string;
  kindHint?: EvidenceKind;
};

export type EvidenceKind = "photo" | "video";
export type EvidenceType = EvidenceKind | "unknown";

const LOOKALIKE_MAP: Record<string, string> = {
  A: "А",
  B: "В",
  E: "Е",
  K: "К",
  M: "М",
  H: "Н",
  O: "О",
  P: "Р",
  C: "С",
  T: "Т",
  Y: "У",
  X: "Х",
};

export function normalizePlate(value: unknown): string {
  return String(value ?? "")
    .toUpperCase()
    .replaceAll("Ё", "Е")
    .replace(/[ABEKMHOPCTYX]/gu, (letter) => LOOKALIKE_MAP[letter] ?? letter)
    .replace(/[^АВЕКМНОРСТУХ0-9]/gu, "");
}

export function isPlateFormatValid(plate: string): boolean {
  return /^[АВЕКМНОРСТУХ]\d{3}[АВЕКМНОРСТУХ]{2}\d{2,3}$/u.test(plate);
}

export function readField(item: RawFine, field: string): unknown {
  if (field in item) return item[field];
  const upper = field.replace(/^ufCrm/u, "UF_CRM_").toUpperCase();
  return item[upper];
}

export function itemPlate(item: RawFine): string {
  return normalizePlate(readField(item, FIELDS.plate));
}

export function itemPaymentId(item: RawFine): number {
  const value = readField(item, FIELDS.paymentId);
  if (Array.isArray(value)) return Number(value[0] ?? 0);
  return Number(value ?? 0);
}

export function itemPaymentUrl(item: RawFine): string {
  const value = readField(item, FIELDS.paymentUrl);
  return typeof value === "string" ? value : "";
}

export function isOutstanding(item: RawFine): boolean {
  return (
    item.stageId !== STAGES.paidInFines &&
    item.stageId !== STAGES.paidAtBuilding
  );
}

export function amountFromItem(item: RawFine): number {
  const opportunity = Number(item.opportunity ?? 0);
  if (isAllowedFineAmount(opportunity)) return opportunity;

  const raw = readField(item, FIELDS.amount);
  if (typeof raw === "object" && raw !== null) {
    const record = raw as Record<string, unknown>;
    const nested = Number(record.value ?? record.VALUE ?? 0);
    if (isAllowedFineAmount(nested)) return nested;
    if (FINE_AMOUNT_ENUM_VALUES[nested]) return FINE_AMOUNT_ENUM_VALUES[nested];
  }
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  if (isAllowedFineAmount(value)) return value;
  return FINE_AMOUNT_ENUM_VALUES[value] ?? 0;
}

function fileNameFromUrl(value: string): string {
  if (!value) return "";
  try {
    const pathname = new URL(value, `https://${bitrixConfig.portalHost}`).pathname;
    const name = pathname.split("/").filter(Boolean).at(-1) ?? "";
    return decodeURIComponent(name);
  } catch {
    return "";
  }
}

export function evidenceFiles(
  value: unknown,
  kindHint?: EvidenceKind,
): EvidenceFile[] {
  const values = Array.isArray(value)
    ? value
    : value === null || value === undefined || value === ""
      ? []
      : [value];

  return values.reduce<EvidenceFile[]>((files, entry, index) => {
      if (typeof entry === "number" || typeof entry === "string") {
        const id = Number(entry);
        if (id) files.push({ id, name: `Файл ${index + 1}`, kindHint });
        return files;
      }
      if (!entry || typeof entry !== "object") return files;
      const record = entry as Record<string, unknown>;
      const id = Number(record.id ?? record.ID ?? 0);
      if (!id) return files;
      const machineUrl =
        typeof record.urlMachine === "string"
          ? record.urlMachine
          : typeof record.URL_MACHINE === "string"
            ? record.URL_MACHINE
            : undefined;
      const viewUrl =
        typeof record.url === "string"
          ? record.url
          : typeof record.URL === "string"
            ? record.URL
            : undefined;
      const explicitName = [
        record.name,
        record.NAME,
        record.fileName,
        record.FILE_NAME,
        record.originalName,
        record.ORIGINAL_NAME,
      ].find((candidate) => typeof candidate === "string" && candidate.trim());
      const inferredName =
        fileNameFromUrl(viewUrl ?? "") || fileNameFromUrl(machineUrl ?? "");
      files.push({
        id,
        name: String(explicitName || inferredName || `Файл ${index + 1}`),
        machineUrl,
        viewUrl,
        kindHint,
        contentType:
          typeof record.contentType === "string"
            ? record.contentType
            : typeof record.CONTENT_TYPE === "string"
              ? record.CONTENT_TYPE
              : typeof record.mimeType === "string"
                ? record.mimeType
                : typeof record.MIME_TYPE === "string"
                  ? record.MIME_TYPE
              : undefined,
      });
      return files;
    }, []);
}

function nestedFileRecord(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  for (const key of ["file", "item", "result", "data"]) {
    const candidate = record[key];
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      return candidate as Record<string, unknown>;
    }
  }
  return record;
}

function metadataString(
  record: Record<string, unknown>,
  keys: string[],
): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function mergeEvidenceMetadata(
  fallback: EvidenceFile,
  data: unknown,
): EvidenceFile {
  const record = nestedFileRecord(data);
  if (!record) return fallback;
  const name = metadataString(record, [
    "name",
    "NAME",
    "fileName",
    "FILE_NAME",
    "originalName",
    "ORIGINAL_NAME",
  ]);
  const machineUrl = metadataString(record, [
    "urlMachine",
    "URL_MACHINE",
    "downloadUrl",
    "DOWNLOAD_URL",
  ]);
  const contentType = metadataString(record, [
    "contentType",
    "CONTENT_TYPE",
    "mimeType",
    "MIME_TYPE",
  ]);
  return {
    ...fallback,
    name: name || fallback.name,
    machineUrl: machineUrl || fallback.machineUrl,
    contentType: contentType || fallback.contentType,
  };
}

export async function hydrateEvidenceFile(
  file: EvidenceFile,
): Promise<EvidenceFile> {
  const hasRealName = /\.[A-Za-z0-9]{2,8}$/u.test(file.name);
  if (file.machineUrl && file.contentType && hasRealName) return file;
  if (!file.machineUrl) return file;
  try {
    const source = new URL(file.machineUrl);
    if (
      source.protocol !== "https:" ||
      source.hostname.toLowerCase() !== bitrixConfig.portalHost
    ) {
      return file;
    }
    let response = await fetch(source, {
      method: "HEAD",
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok || !response.headers.get("content-type")) {
      response = await fetch(source, {
        headers: { Range: "bytes=0-0" },
        cache: "no-store",
        redirect: "follow",
        signal: AbortSignal.timeout(8_000),
      });
      void response.body?.cancel();
    }
    if (!response.ok) return file;
    const disposition = response.headers.get("content-disposition") ?? "";
    const encodedName = disposition.match(
      /filename\*\s*=\s*(?:UTF-8'')?"?([^";]+)"?/iu,
    )?.[1];
    const plainName = disposition.match(
      /filename\s*=\s*(?:"([^"]+)"|([^;]+))/iu,
    );
    let headerName = encodedName || plainName?.[1] || plainName?.[2] || "";
    try {
      headerName = decodeURIComponent(headerName.trim());
    } catch {
      headerName = headerName.trim();
    }
    return {
      ...file,
      name: headerName || file.name,
      contentType:
        response.headers.get("content-type")?.split(";")[0].trim() ||
        file.contentType,
    };
  } catch {
    return file;
  }
}

export function allEvidenceFiles(item: RawFine): EvidenceFile[] {
  const materials = evidenceFiles(readField(item, FIELDS.materials));
  const files = [
    ...materials,
    ...evidenceFiles(readField(item, FIELDS.photo), "photo"),
    ...evidenceFiles(readField(item, FIELDS.video), "video"),
  ];
  const unique = new Map<number, EvidenceFile>();
  for (const file of files) {
    const previous = unique.get(file.id);
    unique.set(file.id, previous ? { ...previous, ...file } : file);
  }
  return [...unique.values()];
}

const VIDEO_EXTENSIONS = new Set([
  "mp4",
  "mov",
  "m4v",
  "webm",
  "avi",
  "mkv",
  "mpeg",
  "mpg",
  "3gp",
]);

const IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "heic",
  "heif",
  "avif",
]);

export function evidenceType(file: EvidenceFile): EvidenceType {
  const contentType = file.contentType?.split(";")[0].trim().toLowerCase();
  if (contentType?.startsWith("video/")) return "video";
  if (contentType?.startsWith("image/")) return "photo";
  const extension = file.name.match(/\.([A-Za-z0-9]{2,8})$/u)?.[1].toLowerCase();
  if (extension && VIDEO_EXTENSIONS.has(extension)) return "video";
  if (extension && IMAGE_EXTENSIONS.has(extension)) return "photo";
  return file.kindHint ?? "unknown";
}

export function evidenceKind(file: EvidenceFile): EvidenceKind {
  const type = evidenceType(file);
  return type === "unknown" ? "photo" : type;
}

export function evidenceContentType(file: EvidenceFile): string {
  const declared = file.contentType?.split(";")[0].trim().toLowerCase();
  if (declared) return declared;
  const extension = file.name.match(/\.([A-Za-z0-9]{2,8})$/u)?.[1].toLowerCase();
  const byExtension: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    heic: "image/heic",
    mp4: "video/mp4",
    mov: "video/quicktime",
    m4v: "video/x-m4v",
    webm: "video/webm",
    avi: "video/x-msvideo",
    mkv: "video/x-matroska",
    mpeg: "video/mpeg",
    mpg: "video/mpeg",
    "3gp": "video/3gpp",
  };
  return extension ? byExtension[extension] ?? "application/octet-stream" : "application/octet-stream";
}

function listQuery(categoryId: number, stageId?: string): string {
  const query = new URLSearchParams();
  query.set("filter[categoryId]", String(categoryId));
  if (stageId) query.set("filter[stageId]", stageId);
  query.set("limit", "5000");
  return `/v1/items/${bitrixConfig.entityTypeId}?${query.toString()}`;
}

function plateQuery(plate: string): string {
  const query = new URLSearchParams();
  query.set("filter[categoryId]", String(bitrixConfig.finesCategoryId));
  query.set(`filter[${FIELDS.plate}]`, plate);
  query.set("limit", "100");
  return `/v1/items/${bitrixConfig.entityTypeId}?${query.toString()}`;
}

function isUnsupportedPlateFilter(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { status?: unknown; code?: unknown };
  return (
    Number(record.status) === 400 &&
    ["UNKNOWN_FILTER_FIELD", "INVALID_FILTER"].includes(String(record.code))
  );
}

export async function listFineCategoryItems(): Promise<RawFine[]> {
  const data = await vibeRequest(listQuery(bitrixConfig.finesCategoryId), {
    cache: "no-store",
  });
  return asEntityList<RawFine>(data);
}

export async function listPaidCategoryResetItems(): Promise<RawFine[]> {
  const data = await vibeRequest(
    listQuery(bitrixConfig.paidCategoryId, STAGES.paidAtBuildingReset),
    { cache: "no-store" },
  );
  return asEntityList<RawFine>(data);
}

export async function listFineItemsByPlate(plate: string): Promise<RawFine[]> {
  const normalizedPlate = normalizePlate(plate);
  try {
    const data = await vibeRequest(plateQuery(normalizedPlate), {
      cache: "no-store",
    });
    return asEntityList<RawFine>(data).filter(
      (item) => itemPlate(item) === normalizedPlate,
    );
  } catch (error) {
    if (isUnsupportedPlateFilter(error)) {
      const items = await listFineCategoryItems();
      return items.filter((item) => itemPlate(item) === normalizedPlate);
    }
    console.error(
      "FINE_LIST_VIBECODE_FALLBACK",
      error instanceof Error ? error.message : String(error),
    );
    const result = await bitrixRestRequest<{ items?: RawFine[] }>(
      "crm.item.list",
      {
        entityTypeId: bitrixConfig.entityTypeId,
        filter: {
          categoryId: bitrixConfig.finesCategoryId,
          [FIELDS.plate]: normalizedPlate,
        },
        select: ["*", "ufCrm_*"],
      },
    );
    return (result.items ?? []).filter(
      (item) => itemPlate(item) === normalizedPlate,
    );
  }
}

export async function getFineItem(id: number): Promise<RawFine> {
  let data: RawFine | { item: RawFine };
  try {
    data = await vibeRequest<RawFine | { item: RawFine }>(
      `/v1/items/${bitrixConfig.entityTypeId}/${id}`,
      { cache: "no-store" },
    );
  } catch (error) {
    console.error(
      "FINE_GET_VIBECODE_FALLBACK",
      error instanceof Error ? error.message : String(error),
    );
    data = await bitrixRestRequest<{ item: RawFine }>("crm.item.get", {
      entityTypeId: bitrixConfig.entityTypeId,
      id,
    });
  }
  if (data && typeof data === "object" && "item" in data) {
    return (data as { item: RawFine }).item;
  }
  return data as RawFine;
}

export async function getFineProductName(id: number): Promise<string> {
  const now = Date.now();
  const cached = fineProductCache.get(id);
  if (cached && cached.expiresAt > now) return cached.value;

  if (fineProductCache.size >= FINE_PRODUCT_CACHE_MAX_ITEMS) {
    const oldestKey = fineProductCache.keys().next().value;
    if (oldestKey !== undefined) fineProductCache.delete(oldestKey);
  }

  const value = vibeRequest<unknown>(
    `/v1/items/${bitrixConfig.entityTypeId}/${id}/products`,
    { cache: "no-store" },
  )
    .then((data) => {
      const rows = asEntityList<FineProductRow>(data);
      for (const row of rows) {
        const name = [row.productName, row.name].find(
          (candidate) =>
            typeof candidate === "string" && candidate.trim(),
        );
        if (typeof name === "string") return name.trim();
      }
      return "";
    })
    .catch((error) => {
      fineProductCache.delete(id);
      throw error;
    });

  fineProductCache.set(id, {
    expiresAt: now + FINE_PRODUCT_CACHE_TTL_MS,
    value,
  });
  return value;
}

export async function updateFineItem(
  id: number,
  fields: Record<string, unknown>,
): Promise<void> {
  try {
    await vibeRequest(`/v1/items/${bitrixConfig.entityTypeId}/${id}`, {
      method: "PATCH",
      body: fields,
    });
  } catch (error) {
    console.error(
      "FINE_UPDATE_VIBECODE_FALLBACK",
      error instanceof Error ? error.message : String(error),
    );
    await bitrixRestRequest("crm.item.update", {
      entityTypeId: bitrixConfig.entityTypeId,
      id,
      fields,
    });
  }
}

export async function moveFineToPaidBuilding(
  id: number,
  current: RawFine,
): Promise<void> {
  if (
    Number(current.categoryId) === bitrixConfig.paidCategoryId &&
    current.stageId === STAGES.paidAtBuilding
  ) {
    return;
  }

  await updateFineItem(id, {
    categoryId: bitrixConfig.paidCategoryId,
    stageId: STAGES.paidAtBuildingReset,
  });
  await updateFineItem(id, { stageId: STAGES.paidAtBuilding });
}
