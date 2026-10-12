import { bitrixConfig, runtimeValue } from "./config";
import {
  allEvidenceFiles,
  evidenceKind,
  FIELDS,
  hydrateEvidenceFile,
  itemPlate,
  RawFine,
  readField,
  updateFineItem,
} from "./fines";
import { asEntityList, entityId, vibeRequest } from "./vibecode";

type DiskEntity = Record<string, unknown> & {
  id?: number | string;
  name?: string;
};

const MAX_COPY_BYTES = 30 * 1024 * 1024;

function numericField(value: unknown): number {
  if (Array.isArray(value)) return Number(value[0] ?? 0);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Number(record.id ?? record.ID ?? record.value ?? record.VALUE ?? 0);
  }
  return Number(value ?? 0);
}

function violationDate(item: RawFine): string {
  const value = String(readField(item, FIELDS.occurredAt) ?? "");
  const isoDate = value.match(/\d{4}-\d{2}-\d{2}/u)?.[0];
  if (isoDate) return isoDate;

  const ruDate = value.match(/(\d{2})[./-](\d{2})[./-](\d{4})/u);
  return ruDate ? `${ruDate[3]}-${ruDate[2]}-${ruDate[1]}` : "дата не указана";
}

function folderName(item: RawFine): string {
  const plate = itemPlate(item) || `госномер не указан`;
  return `${plate} ${violationDate(item)} · нарушение ${Number(item.id)}`;
}

function fileName(
  item: RawFine,
  kind: "фото" | "видео",
  index: number,
  extension: string,
): string {
  return `Нарушение-${Number(item.id)}-${kind}-${index + 1}.${extension}`;
}

function extensionFor(contentType: string, originalName: string): string {
  const byType: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
    "video/x-msvideo": "avi",
  };
  if (byType[contentType]) return byType[contentType];
  const fromName = originalName.match(/\.([A-Za-z0-9]{2,5})$/u)?.[1];
  return fromName?.toLowerCase() ?? "bin";
}

function toBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    chunks.push(
      String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)),
    );
  }
  return btoa(chunks.join(""));
}

async function createEvidenceFolder(item: RawFine, rootFolderId: number) {
  const created = await vibeRequest("/v1/folders", {
    method: "POST",
    body: {
      name: folderName(item),
      parentId: rootFolderId,
    },
  });
  const folderId = entityId(created);
  if (!folderId) throw new Error("Папка доказательств не создана");
  await updateFineItem(Number(item.id), {
    [FIELDS.evidenceFolderId]: String(folderId),
  });
  return folderId;
}

async function copyEvidenceFiles(item: RawFine, folderId: number) {
  const listed = await vibeRequest(
    `/v1/files?folderId=${folderId}&limit=5000`,
    { cache: "no-store" },
  );
  const existingNames = new Set(
    asEntityList<DiskEntity>(listed).map((file) => String(file.name ?? "")),
  );
  const evidence = await Promise.all(
    allEvidenceFiles(item).map(hydrateEvidenceFile),
  );
  const batches = [
    {
      kind: "фото" as const,
      files: evidence.filter((file) => evidenceKind(file) === "photo"),
    },
    {
      kind: "видео" as const,
      files: evidence.filter((file) => evidenceKind(file) === "video"),
    },
  ];

  for (const batch of batches) {
    for (const [index, file] of batch.files.entries()) {
      if (!file.machineUrl) continue;
      const source = new URL(file.machineUrl);
      if (
        source.protocol !== "https:" ||
        source.hostname.toLowerCase() !== bitrixConfig.portalHost
      ) {
        continue;
      }

      const response = await fetch(source, { cache: "no-store" });
      if (!response.ok) continue;
      const declaredSize = Number(response.headers.get("content-length") ?? 0);
      if (declaredSize > MAX_COPY_BYTES) continue;

      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!bytes.length || bytes.length > MAX_COPY_BYTES) continue;
      const contentType = (response.headers.get("content-type") ?? "")
        .split(";")[0]
        .trim()
        .toLowerCase();
      const name = fileName(
        item,
        batch.kind,
        index,
        extensionFor(contentType, file.name),
      );
      if (existingNames.has(name)) continue;

      await vibeRequest("/v1/files/upload", {
        method: "POST",
        body: {
          folderId,
          filename: name,
          content: toBase64(bytes),
        },
      });
      existingNames.add(name);
    }
  }
}

export async function ensureEvidenceFolder(item: RawFine): Promise<void> {
  const rootFolderId = Number(runtimeValue("B24_EVIDENCE_ROOT_FOLDER_ID"));
  if (!rootFolderId) return;

  const storedFolderId = numericField(
    readField(item, FIELDS.evidenceFolderId),
  );
  const folderId =
    storedFolderId || (await createEvidenceFolder(item, rootFolderId));
  await copyEvidenceFiles(item, folderId);
}
