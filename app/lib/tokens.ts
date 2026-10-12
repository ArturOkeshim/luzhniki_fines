import { requiredRuntimeValue, runtimeValue } from "./config";

export type FineAccessToken = {
  purpose: "fine-access";
  plate: string;
  fineIds: number[];
  exp: number;
};

export type CheckoutToken = {
  purpose: "checkout";
  plate: string;
  fineIds: number[];
  paymentId: number;
  primaryId?: number;
  exp: number;
};

export type ParkingPaymentToken = {
  purpose: "parking-payment";
  dealId: number;
  paymentId: number;
  expiresAt: number;
  exp: number;
};

type SignedPayload = FineAccessToken | CheckoutToken | ParkingPaymentToken;

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function signingKey(): Promise<CryptoKey> {
  const secret = runtimeValue("APP_SESSION_SECRET") || requiredRuntimeValue("BITRIX_PROMO_API_TOKEN");
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signToken(payload: SignedPayload): Promise<string> {
  const encoded = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await signingKey(),
    encoder.encode(encoded),
  );
  return `${encoded}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifyToken<T extends SignedPayload>(
  token: string,
  purpose: T["purpose"],
): Promise<T> {
  const [encoded, suppliedSignature, extra] = token.split(".");
  if (!encoded || !suppliedSignature || extra) {
    throw new Error("Ссылка устарела. Выполните поиск ещё раз.");
  }

  const valid = await crypto.subtle.verify(
    "HMAC",
    await signingKey(),
    fromBase64Url(suppliedSignature),
    encoder.encode(encoded),
  );
  if (!valid) throw new Error("Ссылка недействительна.");

  let payload: SignedPayload;
  try {
    payload = JSON.parse(
      new TextDecoder().decode(fromBase64Url(encoded)),
    ) as SignedPayload;
  } catch {
    throw new Error("Ссылка недействительна.");
  }

  if (payload.purpose !== purpose || payload.exp < Date.now()) {
    throw new Error("Ссылка устарела. Выполните поиск ещё раз.");
  }

  return payload as T;
}
