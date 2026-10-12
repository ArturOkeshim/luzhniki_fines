import { NextRequest, NextResponse } from "next/server";
import {
  allEvidenceFiles,
  evidenceContentType,
  getFineItem,
  itemPlate,
} from "@/app/lib/fines";
import {
  evidenceDisposition,
  evidenceResponseHeaders,
  evidenceSource,
} from "@/app/lib/evidence-source";
import { sniffImageStream } from "@/app/lib/image-stream";
import { FineAccessToken, verifyToken } from "@/app/lib/tokens";

export const dynamic = "force-dynamic";

function redirectToBitrix(url: URL): NextResponse {
  const response = NextResponse.redirect(url, 307);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

async function photoPreview(
  source: Extract<ReturnType<typeof evidenceSource>, { kind: "proxy" }>,
  fallbackType: string,
): Promise<NextResponse> {
  const upstream = await fetch(source.url, {
    headers: source.headers,
    cache: "no-store",
    redirect: "follow",
  });
  if (!upstream.ok || !upstream.body) throw new Error("Файл не получен");

  const upstreamType = upstream.headers.get("content-type") ?? fallbackType;
  if (upstreamType.toLowerCase().startsWith("video/")) {
    void upstream.body.cancel();
    return NextResponse.json({ error: "Это видеофайл." }, { status: 415 });
  }

  const preview = await sniffImageStream(
    upstream.body,
    upstreamType,
    fallbackType,
  );

  const headers = new Headers({
    "Content-Type": preview.contentType,
    "Content-Disposition": 'inline; filename="preview"',
    "Cache-Control": "private, max-age=14400",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
  return new NextResponse(preview.body, { status: upstream.status, headers });
}

async function downloadEvidence(
  source: Extract<ReturnType<typeof evidenceSource>, { kind: "proxy" }>,
  fallbackType: string,
  fileName: string,
): Promise<NextResponse> {
  const upstream = await fetch(source.url, {
    headers: source.headers,
    cache: "no-store",
    redirect: "follow",
  });
  if (!upstream.ok || !upstream.body) throw new Error("Файл не получен");
  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: evidenceResponseHeaders(
      upstream,
      fallbackType,
      evidenceDisposition(fileName, "download"),
    ),
  });
}

export async function GET(request: NextRequest) {
  const fineId = Number(request.nextUrl.searchParams.get("fine"));
  const fileId = Number(request.nextUrl.searchParams.get("file"));
  const kind = request.nextUrl.searchParams.get("kind");
  const mode = request.nextUrl.searchParams.get("mode") ?? "download";
  const token = request.nextUrl.searchParams.get("token") ?? "";

  if (
    !fineId ||
    !fileId ||
    (kind !== "photo" && kind !== "video") ||
    (mode !== "download" && mode !== "preview") ||
    !token
  ) {
    return NextResponse.json({ error: "Файл не найден." }, { status: 404 });
  }

  try {
    const access = await verifyToken<FineAccessToken>(token, "fine-access");
    if (!access.fineIds.includes(fineId)) {
      return NextResponse.json({ error: "Доступ запрещён." }, { status: 403 });
    }

    const item = await getFineItem(fineId);
    if (itemPlate(item) !== access.plate) {
      return NextResponse.json({ error: "Доступ запрещён." }, { status: 403 });
    }

    const file = allEvidenceFiles(item).find(
      (candidate) => candidate.id === fileId,
    );
    if (!file) {
      return NextResponse.json({ error: "Файл не найден." }, { status: 404 });
    }

    const source = evidenceSource(
      file.machineUrl,
      request.headers.get("range"),
    );
    if (source.kind === "redirect") {
      return redirectToBitrix(source.url);
    }
    if (mode !== "preview" || kind === "video") {
      return downloadEvidence(
        source,
        evidenceContentType(file),
        file.name,
      );
    }
    return await photoPreview(source, evidenceContentType(file));
  } catch (error) {
    console.error(
      "EVIDENCE_DELIVERY_ERROR",
      JSON.stringify({
        fineId,
        fileId,
        mode,
        name: error instanceof Error ? error.name : "UnknownError",
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return NextResponse.json(
      { error: "Файл временно недоступен." },
      { status: 502 },
    );
  }
}
