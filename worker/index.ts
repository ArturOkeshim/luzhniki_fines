/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { setRuntimeBindings } from "../app/lib/config";
import {
  allEvidenceFiles,
  evidenceContentType,
  getFineItem,
  itemPlate,
} from "../app/lib/fines";
import {
  evidenceDisposition,
  evidenceResponseHeaders,
  evidenceSource,
  evidenceDownloadName,
} from "../app/lib/evidence-source";
import { sniffImageStream } from "../app/lib/image-stream";
import { type FineAccessToken, verifyToken } from "../app/lib/tokens";
import { setPromoDatabase } from "../app/lib/promo-demo";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

async function evidenceResponse(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const fineId = Number(url.searchParams.get("fine"));
  const fileId = Number(url.searchParams.get("file"));
  const kind = url.searchParams.get("kind");
  const mode = url.searchParams.get("mode") ?? "download";
  const token = url.searchParams.get("token") ?? "";
  if (
    !fineId ||
    !fileId ||
    (kind !== "photo" && kind !== "video") ||
    (mode !== "download" && mode !== "preview") ||
    !token
  ) {
    return Response.json({ error: "Файл не найден." }, { status: 404 });
  }

  try {
    const access = await verifyToken<FineAccessToken>(token, "fine-access");
    if (!access.fineIds.includes(fineId)) {
      return Response.json({ error: "Доступ запрещён." }, { status: 403 });
    }
    const item = await getFineItem(fineId);
    if (itemPlate(item) !== access.plate) {
      return Response.json({ error: "Доступ запрещён." }, { status: 403 });
    }
    const file = allEvidenceFiles(item).find(
      (candidate) => candidate.id === fileId,
    );
    if (!file) {
      return Response.json({ error: "Файл не найден." }, { status: 404 });
    }

    const source = evidenceSource(file.machineUrl, request.headers.get("range"));
    if (source.kind === "redirect") {
      return new Response(null, {
        status: 307,
        headers: {
          Location: source.url.toString(),
          "Cache-Control": "private, no-store",
          "Referrer-Policy": "no-referrer",
        },
      });
    }

    const upstream = await fetch(source.url, {
      headers: source.headers,
      cache: "no-store",
      redirect: "follow",
    });
    if (!upstream.ok || !upstream.body) throw new Error("Файл не получен");
    const fallbackType = evidenceContentType(file);
    const upstreamType = upstream.headers.get("content-type") ?? fallbackType;

    if (mode === "preview" && kind === "photo") {
      if (upstreamType.toLowerCase().startsWith("video/")) {
        void upstream.body.cancel();
        return Response.json({ error: "Это видеофайл." }, { status: 415 });
      }
      const preview = await sniffImageStream(
        upstream.body,
        upstreamType,
        fallbackType,
      );
      return new Response(preview.body, {
        status: upstream.status,
        headers: {
          "Content-Type": preview.contentType,
          "Content-Disposition": evidenceDisposition(file.name, "preview"),
          "Cache-Control": "private, max-age=14400",
          "Referrer-Policy": "no-referrer",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    const downloadName = evidenceDownloadName(
      file.name,
      upstream.headers.get("content-disposition") ?? "",
      upstreamType,
    );
    return new Response(upstream.body, {
      status: upstream.status,
      headers: evidenceResponseHeaders(
        upstream,
        fallbackType,
        evidenceDisposition(downloadName, "download"),
      ),
    });
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
    return Response.json(
      { error: "Файл временно недоступен." },
      { status: 502 },
    );
  }
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env | undefined, ctx: ExecutionContext): Promise<Response> {
    setRuntimeBindings((env ?? {}) as unknown as Record<string, unknown>);
    setPromoDatabase(env?.DB);
    const url = new URL(request.url);

    if (url.pathname === "/api/evidence") {
      return evidenceResponse(request);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      if (!env?.ASSETS || !env.IMAGES) {
        return Response.json({ error: "Оптимизация изображения недоступна." }, { status: 503 });
      }
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
