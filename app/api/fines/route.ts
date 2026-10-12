import { NextRequest, NextResponse } from "next/server";
import {
  amountFromItem,
  allEvidenceFiles,
  evidenceKind,
  evidenceType,
  FIELDS,
  getFineProductName,
  isOutstanding,
  listFineItemsByPlate,
  normalizePlate,
  isPlateFormatValid,
  readField,
  STAGES,
} from "@/app/lib/fines";
import { signToken } from "@/app/lib/tokens";
import { reconcilePlate } from "@/app/lib/workflow";

export const dynamic = "force-dynamic";

function textField(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return fallback;
}

export async function GET(request: NextRequest) {
  const plate = normalizePlate(request.nextUrl.searchParams.get("plate"));
  if (!isPlateFormatValid(plate)) {
    return NextResponse.json(
      { error: "Введите госномер в формате А000АА77." },
      { status: 400 },
    );
  }

  try {
    let items = await listFineItemsByPlate(plate);

    if (
      items.some(
        (item) =>
          item.stageId === STAGES.awaiting ||
          item.stageId === STAGES.paidInFines,
      )
    ) {
      const reconciliation = await reconcilePlate(plate, items);
      if (reconciliation.allPaid && reconciliation.moved) {
        return NextResponse.json({
          plate,
          fines: [],
          outstandingCount: 0,
          total: 0,
          accessRestored: true,
        });
      }
      if (reconciliation.paidFineIds.length) {
        items = await listFineItemsByPlate(plate);
      }
    }

    const accessToken = await signToken({
      purpose: "fine-access",
      plate,
      fineIds: items.map((item) => Number(item.id)),
      exp: Date.now() + 4 * 60 * 60 * 1000,
    });

    const fines = await Promise.all(items.map(async (item) => {
      const id = Number(item.id);
      const productName = await getFineProductName(id).catch(() => "");
      const evidence = allEvidenceFiles(item);
      const evidenceUrl = (
        kind: "photo" | "video",
        fileId: number,
        mode: "download" | "preview" = "download",
      ) =>
        `/api/evidence?fine=${id}&kind=${kind}&file=${fileId}&mode=${mode}&token=${encodeURIComponent(accessToken)}`;
      const photos = evidence.filter((file) => evidenceKind(file) === "photo").map(
        (file, index) => ({
          id: file.id,
          name: file.name || `Фото ${index + 1}`,
          url: evidenceUrl("photo", file.id),
          previewUrl: evidenceUrl("photo", file.id, "preview"),
          probeVideoUrl:
            evidenceType(file) === "unknown"
              ? evidenceUrl("video", file.id)
              : undefined,
        }),
      );
      const videos = evidence.filter((file) => evidenceKind(file) === "video").map(
        (file, index) => ({
          id: file.id,
          name: file.name || `Видео ${index + 1}`,
          url: evidenceUrl("video", file.id),
          probeVideoUrl: evidenceUrl("video", file.id),
        }),
      );

      return {
        id,
        plate,
        productName: textField(productName, `Штраф №${id}`),
        occurredAt: textField(
          readField(item, FIELDS.occurredAt),
          textField(item.createdTime, ""),
        ),
        amount: amountFromItem(item),
        payable: isOutstanding(item),
        photos,
        videos,
      };
    }));
    const outstanding = fines.filter((fine) => fine.payable);

    return NextResponse.json(
      {
        plate,
        fines,
        outstandingCount: outstanding.length,
        total: outstanding.reduce((sum, fine) => sum + fine.amount, 0),
        accessRestored: false,
        accessToken,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("FINES_SEARCH_ERROR", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : String(error),
      status:
        error && typeof error === "object" && "status" in error
          ? (error as { status?: unknown }).status
          : undefined,
      code:
        error && typeof error === "object" && "code" in error
          ? (error as { code?: unknown }).code
          : undefined,
    });
    return NextResponse.json(
      {
        error:
          "Не удалось проверить ограничения. Попробуйте ещё раз через минуту.",
      },
      { status: 502 },
    );
  }
}
