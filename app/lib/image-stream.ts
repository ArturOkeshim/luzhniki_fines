const PREFIX_LENGTH = 32;

function signatureContentType(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 6 &&
    String.fromCharCode(...bytes.slice(0, 6)).startsWith("GIF8")
  ) {
    return "image/gif";
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(4, 8)) === "ftyp") {
    const brand = String.fromCharCode(...bytes.slice(8, 12)).toLowerCase();
    if (["avif", "avis"].includes(brand)) return "image/avif";
    if (["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(brand)) {
      return "image/heic";
    }
  }
  return "";
}

function declaredImageType(...values: string[]): string {
  return (
    values
      .map((value) => value.split(";")[0].trim().toLowerCase())
      .find((value) => value.startsWith("image/")) ?? "application/octet-stream"
  );
}

export async function sniffImageStream(
  source: ReadableStream<Uint8Array>,
  declaredType: string,
  fallbackType: string,
): Promise<{ body: ReadableStream<Uint8Array>; contentType: string }> {
  const reader = source.getReader();
  const initialChunks: Uint8Array[] = [];
  let initialLength = 0;

  while (initialLength < PREFIX_LENGTH) {
    const result = await reader.read();
    if (result.done) break;
    initialChunks.push(result.value);
    initialLength += result.value.byteLength;
  }
  if (!initialLength) throw new Error("Пустой файл");

  const prefix = new Uint8Array(Math.min(initialLength, PREFIX_LENGTH));
  let offset = 0;
  for (const chunk of initialChunks) {
    const remaining = prefix.byteLength - offset;
    if (remaining <= 0) break;
    prefix.set(chunk.subarray(0, remaining), offset);
    offset += Math.min(chunk.byteLength, remaining);
  }

  let initialIndex = 0;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (initialIndex < initialChunks.length) {
        controller.enqueue(initialChunks[initialIndex]);
        initialIndex += 1;
        return;
      }
      const result = await reader.read();
      if (result.done) {
        controller.close();
      } else {
        controller.enqueue(result.value);
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });

  return {
    body,
    contentType:
      signatureContentType(prefix) ||
      declaredImageType(declaredType, fallbackType),
  };
}
