import { runtimeValue } from "@/app/lib/config";
import { PARKING_TARIFFS } from "@/app/lib/parking-tariffs";

export const PROMO_OBJECTS = [
  { prefix: "BS", name: "Большая спортивная арена" },
  { prefix: "MS", name: "Малая спортивная арена" },
  { prefix: "AK", name: "Аквакомплекс" },
  { prefix: "DT", name: "Дворец тенниса" },
  { prefix: "TR", name: "Территория" },
  { prefix: "IV", name: "Дворец Ирины Винер" },
  { prefix: "SB", name: "Дворец самбо и бокса" },
  { prefix: "DR", name: "Универсальный спортивный зал «Дружба»" },
  { prefix: "KS", name: "Комплекс спортивных сооружений" },
  { prefix: "CP", name: "Центральная площадь" },
] as const;

export const PROMO_TARIFFS = [
  { id: "client-all", name: PARKING_TARIFFS["client-all"].name, price: PARKING_TARIFFS["client-all"].price },
  { id: "parent-all", name: PARKING_TARIFFS["parent-all"].name, price: PARKING_TARIFFS["parent-all"].price },
  { id: "client-weekdays", name: PARKING_TARIFFS["client-weekdays"].name, price: PARKING_TARIFFS["client-weekdays"].price },
  { id: "parent-weekdays", name: PARKING_TARIFFS["parent-weekdays"].name, price: PARKING_TARIFFS["parent-weekdays"].price },
] as const;

export type PromoTenant = {
  objectPrefix: string;
  objectName: string;
  tenantPrefix: string;
  tenantName: string;
  tariffId: string;
  tariffName: string;
  price: number;
};

export type PromoCodeRecord = PromoTenant & {
  promoCode: string;
  batchId: string;
  generatedBy: string;
  generatedAt: string;
  status: "NEW" | "RESERVED" | "USED" | "BLOCKED";
  reservedAt: string | null;
  reservedUntil: string | null;
  reservationKeyHash?: string | null;
  usedAt: string | null;
  dealId: number | null;
  orderId: number | null;
  paymentId: number | null;
};

export type PromoBatch = PromoTenant & {
  batchId: string;
  quantity: number;
  generatedBy: string;
  generatedAt: string;
  usedCount: number;
  exportedAt: string | null;
};

type D1Result<T = Record<string, unknown>> = {
  results?: T[];
  meta?: { changes?: number };
};

type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
};

type PromoD1Database = {
  prepare(query: string): D1Statement;
  batch<T = Record<string, unknown>>(statements: D1Statement[]): Promise<D1Result<T>[]>;
};

let promoDatabase: PromoD1Database | undefined;

export function setPromoDatabase(value: unknown): void {
  promoDatabase = value as PromoD1Database | undefined;
}

declare global {
  var __promoDemoSchemaPromise: Promise<void> | undefined;
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function database(): PromoD1Database {
  const db = promoDatabase;
  if (!db) throw new Error("Локальная база промокодов не подключена.");
  return db;
}

export function promoDemoEnabled(): boolean {
  return process.env.NODE_ENV === "development" || runtimeValue("PROMO_ADMIN_DEMO_MODE") === "1";
}

export function localPromoApiEnabled(): boolean {
  return promoDemoEnabled() && runtimeValue("PROMO_API_MODE", "local").toLowerCase() === "local";
}

export async function ensurePromoDemoDatabase(): Promise<void> {
  globalThis.__promoDemoSchemaPromise ??= initializeDatabase().catch((error) => {
    globalThis.__promoDemoSchemaPromise = undefined;
    throw error;
  });
  return globalThis.__promoDemoSchemaPromise;
}

async function initializeDatabase(): Promise<void> {
  const db = database();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS promo_demo_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_type TEXT NOT NULL,
      record_key TEXT NOT NULL,
      promo_code TEXT,
      code_hash TEXT,
      random_part TEXT,
      random_part_hash TEXT,
      object_name TEXT,
      object_prefix TEXT,
      tenant_name TEXT,
      tenant_prefix TEXT,
      batch_id TEXT,
      quantity INTEGER,
      generated_by TEXT,
      generated_at TEXT,
      status TEXT,
      reserved_at TEXT,
      reserved_until TEXT,
      reservation_key_hash TEXT,
      used_at TEXT,
      deal_id INTEGER,
      order_id INTEGER,
      payment_id INTEGER,
      tariff_id TEXT,
      tariff_name TEXT,
      price INTEGER,
      exported_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS ux_promo_demo_record_key ON promo_demo_records(record_key)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS ux_promo_demo_code ON promo_demo_records(promo_code)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS ux_promo_demo_random_part ON promo_demo_records(random_part)"),
    db.prepare("CREATE INDEX IF NOT EXISTS ix_promo_demo_type_created ON promo_demo_records(record_type, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS ix_promo_demo_batch ON promo_demo_records(batch_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS ix_promo_demo_object_tenant ON promo_demo_records(object_prefix, tenant_prefix)"),
  ]);

  const columnResult = await db.prepare("PRAGMA table_info(promo_demo_records)").all<{ name: string }>();
  const columns = new Set((columnResult.results ?? []).map((column) => column.name));
  const migrations = [
    ["reserved_at", "ALTER TABLE promo_demo_records ADD COLUMN reserved_at TEXT"],
    ["reserved_until", "ALTER TABLE promo_demo_records ADD COLUMN reserved_until TEXT"],
    ["reservation_key_hash", "ALTER TABLE promo_demo_records ADD COLUMN reservation_key_hash TEXT"],
    ["deal_id", "ALTER TABLE promo_demo_records ADD COLUMN deal_id INTEGER"],
    ["order_id", "ALTER TABLE promo_demo_records ADD COLUMN order_id INTEGER"],
    ["payment_id", "ALTER TABLE promo_demo_records ADD COLUMN payment_id INTEGER"],
  ] as const;
  const pendingMigrations = migrations
    .filter(([column]) => !columns.has(column))
    .map(([, sql]) => db.prepare(sql));
  if (pendingMigrations.length > 0) await db.batch(pendingMigrations);
  await db.prepare("CREATE INDEX IF NOT EXISTS ix_promo_demo_status_reserved ON promo_demo_records(status, reserved_until)").run();

  const seeded = await db.prepare(
    "SELECT id FROM promo_demo_records WHERE record_key = ? LIMIT 1",
  ).bind("TENANT:AK:01").first<{ id: number }>();
  if (!seeded) {
    const now = new Date().toISOString();
    await db.prepare(`INSERT INTO promo_demo_records (
      record_type, record_key, object_name, object_prefix, tenant_name, tenant_prefix,
      tariff_id, tariff_name, price, created_at, updated_at
    ) VALUES ('TENANT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        "TENANT:AK:01",
        "Аквакомплекс",
        "AK",
        "Тестовый арендатор",
        "01",
        "client-all",
        PARKING_TARIFFS["client-all"].name,
        PARKING_TARIFFS["client-all"].price,
        now,
        now,
      )
      .run();
  }
  await db.prepare(`UPDATE promo_demo_records
    SET tariff_id = 'client-all', tariff_name = ?, price = ?, updated_at = ?
    WHERE record_type = 'TENANT' AND tariff_id IN ('test', 'test-free')`)
    .bind(PARKING_TARIFFS["client-all"].name, PARKING_TARIFFS["client-all"].price, new Date().toISOString())
    .run();
  await db.prepare(`UPDATE promo_demo_records
    SET status = 'BLOCKED', updated_at = ?
    WHERE record_type = 'CODE' AND tariff_id IN ('test', 'test-free') AND status <> 'USED'`)
    .bind(new Date().toISOString())
    .run();
  await db.prepare("PRAGMA optimize").run();
}

export async function listPromoTenants(): Promise<PromoTenant[]> {
  await ensurePromoDemoDatabase();
  const result = await database().prepare(`SELECT
    object_prefix AS objectPrefix, object_name AS objectName,
    tenant_prefix AS tenantPrefix, tenant_name AS tenantName,
    tariff_id AS tariffId, tariff_name AS tariffName, price
    FROM promo_demo_records WHERE record_type = 'TENANT'
    ORDER BY object_name, CAST(tenant_prefix AS INTEGER)`)
    .all<PromoTenant>();
  return result.results ?? [];
}

export async function addPromoTenant(input: {
  objectPrefix: string;
  tenantName: string;
  tariffId: string;
}): Promise<PromoTenant> {
  await ensurePromoDemoDatabase();
  const objectPrefix = input.objectPrefix.trim().toUpperCase();
  const object = PROMO_OBJECTS.find((item) => item.prefix === objectPrefix);
  const tenantName = input.tenantName.trim().replace(/\s+/gu, " ");
  const tariff = PROMO_TARIFFS.find((item) => item.id === input.tariffId);
  if (!object) throw new Error("Выберите объект.");
  if (tenantName.length < 2 || tenantName.length > 255) throw new Error("Укажите название арендатора.");
  if (!tariff) throw new Error("Выберите тариф.");

  const db = database();
  const duplicate = await db.prepare(`SELECT id FROM promo_demo_records
    WHERE record_type = 'TENANT' AND object_prefix = ? AND LOWER(tenant_name) = LOWER(?) LIMIT 1`)
    .bind(objectPrefix, tenantName)
    .first<{ id: number }>();
  if (duplicate) throw new Error("Такой арендатор уже добавлен для выбранного объекта.");

  const maxRow = await db.prepare(`SELECT MAX(CAST(tenant_prefix AS INTEGER)) AS maxPrefix
    FROM promo_demo_records WHERE record_type = 'TENANT' AND object_prefix = ?`)
    .bind(objectPrefix)
    .first<{ maxPrefix: number | null }>();
  let next = Number(maxRow?.maxPrefix ?? 0) + 1;
  while (next <= 99) {
    const tenantPrefix = String(next).padStart(2, "0");
    const now = new Date().toISOString();
    try {
      await db.prepare(`INSERT INTO promo_demo_records (
        record_type, record_key, object_name, object_prefix, tenant_name, tenant_prefix,
        tariff_id, tariff_name, price, created_at, updated_at
      ) VALUES ('TENANT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          `TENANT:${objectPrefix}:${tenantPrefix}`,
          object.name,
          objectPrefix,
          tenantName,
          tenantPrefix,
          tariff.id,
          tariff.name,
          tariff.price,
          now,
          now,
        )
        .run();
      return {
        objectPrefix,
        objectName: object.name,
        tenantPrefix,
        tenantName,
        tariffId: tariff.id,
        tariffName: tariff.name,
        price: tariff.price,
      };
    } catch (error) {
      if (next === 99) throw error;
      next += 1;
    }
  }
  throw new Error("Для объекта заняты все идентификаторы арендаторов от 01 до 99.");
}

export async function generatePromoBatch(input: {
  objectPrefix: string;
  tenantPrefix: string;
  count: number;
  requestId: string;
  generatedBy: string;
}): Promise<{ batch: PromoBatch; codes: PromoCodeRecord[] }> {
  await ensurePromoDemoDatabase();
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > 500) {
    throw new Error("Для локального теста укажите количество от 1 до 500.");
  }
  const requestId = input.requestId.trim().toLowerCase();
  if (!/^[a-f0-9-]{16,64}$/u.test(requestId)) throw new Error("Некорректный идентификатор операции.");

  const db = database();
  const batchId = requestId.replace(/-/gu, "").slice(0, 24).toUpperCase();
  const existing = await getPromoBatch(batchId);
  if (existing.codes.length > 0) return existing;

  const tenant = await db.prepare(`SELECT
    object_prefix AS objectPrefix, object_name AS objectName,
    tenant_prefix AS tenantPrefix, tenant_name AS tenantName,
    tariff_id AS tariffId, tariff_name AS tariffName, price
    FROM promo_demo_records
    WHERE record_type = 'TENANT' AND object_prefix = ? AND tenant_prefix = ? LIMIT 1`)
    .bind(input.objectPrefix.trim().toUpperCase(), input.tenantPrefix.trim())
    .first<PromoTenant>();
  if (!tenant) throw new Error("Арендатор не найден.");

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const now = new Date().toISOString();
    const generatedBy = input.generatedBy.trim().slice(0, 255) || "Локальный сотрудник";
    const tails = new Set<string>();
    while (tails.size < input.count) tails.add(randomTail());
    const codes = await Promise.all([...tails].map(async (tail): Promise<PromoCodeRecord> => {
      const promoCode = `${tenant.objectPrefix}${tenant.tenantPrefix}-${tail}`;
      return {
        ...tenant,
        promoCode,
        batchId,
        generatedBy,
        generatedAt: now,
        status: "NEW",
        reservedAt: null,
        reservedUntil: null,
        usedAt: null,
        dealId: null,
        orderId: null,
        paymentId: null,
      };
    }));

    const statements = [
      db.prepare(`INSERT INTO promo_demo_records (
        record_type, record_key, object_name, object_prefix, tenant_name, tenant_prefix,
        batch_id, quantity, generated_by, generated_at, tariff_id, tariff_name, price,
        created_at, updated_at
      ) VALUES ('BATCH', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          `BATCH:${batchId}`,
          tenant.objectName,
          tenant.objectPrefix,
          tenant.tenantName,
          tenant.tenantPrefix,
          batchId,
          input.count,
          generatedBy,
          now,
          tenant.tariffId,
          tenant.tariffName,
          tenant.price,
          now,
          now,
        ),
    ];
    for (const code of codes) {
      const tail = code.promoCode.slice(5);
      statements.push(
        db.prepare(`INSERT INTO promo_demo_records (
          record_type, record_key, promo_code, code_hash, random_part, random_part_hash,
          object_name, object_prefix, tenant_name, tenant_prefix, batch_id,
          generated_by, generated_at, status, tariff_id, tariff_name, price,
          created_at, updated_at
        ) VALUES ('CODE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW', ?, ?, ?, ?, ?)`)
          .bind(
            `CODE:${code.promoCode}`,
            code.promoCode,
            await hmac(`code:${code.promoCode}`),
            tail,
            await hmac(`tail:${tail}`),
            code.objectName,
            code.objectPrefix,
            code.tenantName,
            code.tenantPrefix,
            batchId,
            generatedBy,
            now,
            code.tariffId,
            code.tariffName,
            code.price,
            now,
            now,
          ),
      );
    }

    try {
      await db.batch(statements);
      return {
        batch: { ...tenant, batchId, quantity: input.count, generatedBy, generatedAt: now, usedCount: 0, exportedAt: null },
        codes,
      };
    } catch (error) {
      const concurrentlyCreated = await getPromoBatch(batchId);
      if (concurrentlyCreated.codes.length > 0) return concurrentlyCreated;
      if (attempt === 4) throw error;
    }
  }
  throw new Error("Не удалось сформировать уникальную партию.");
}

export async function listPromoBatches(limit = 20): Promise<PromoBatch[]> {
  await ensurePromoDemoDatabase();
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const result = await database().prepare(`SELECT
    b.batch_id AS batchId, b.object_prefix AS objectPrefix, b.object_name AS objectName,
    b.tenant_prefix AS tenantPrefix, b.tenant_name AS tenantName,
    b.quantity, b.generated_by AS generatedBy, b.generated_at AS generatedAt,
    b.tariff_id AS tariffId, b.tariff_name AS tariffName, b.price,
    b.exported_at AS exportedAt,
    COALESCE(SUM(CASE WHEN c.status = 'USED' THEN 1 ELSE 0 END), 0) AS usedCount
    FROM promo_demo_records b
    LEFT JOIN promo_demo_records c ON c.record_type = 'CODE' AND c.batch_id = b.batch_id
    WHERE b.record_type = 'BATCH'
    GROUP BY b.id ORDER BY b.generated_at DESC LIMIT ?`)
    .bind(safeLimit)
    .all<PromoBatch>();
  return result.results ?? [];
}

export async function getPromoBatch(batchId: string): Promise<{ batch: PromoBatch; codes: PromoCodeRecord[] }> {
  await ensurePromoDemoDatabase();
  const safeId = batchId.trim().toUpperCase();
  if (!/^[A-F0-9]{24}$/u.test(safeId)) return { batch: emptyBatch(safeId), codes: [] };
  const db = database();
  const batch = await db.prepare(`SELECT
    batch_id AS batchId, object_prefix AS objectPrefix, object_name AS objectName,
    tenant_prefix AS tenantPrefix, tenant_name AS tenantName, quantity,
    generated_by AS generatedBy, generated_at AS generatedAt,
    tariff_id AS tariffId, tariff_name AS tariffName, price, exported_at AS exportedAt,
    0 AS usedCount FROM promo_demo_records
    WHERE record_type = 'BATCH' AND batch_id = ? LIMIT 1`)
    .bind(safeId)
    .first<PromoBatch>();
  if (!batch) return { batch: emptyBatch(safeId), codes: [] };
  const result = await db.prepare(`SELECT
    promo_code AS promoCode, batch_id AS batchId,
    object_prefix AS objectPrefix, object_name AS objectName,
    tenant_prefix AS tenantPrefix, tenant_name AS tenantName,
    generated_by AS generatedBy, generated_at AS generatedAt,
    status, reserved_at AS reservedAt, reserved_until AS reservedUntil,
    used_at AS usedAt, deal_id AS dealId, order_id AS orderId, payment_id AS paymentId,
    tariff_id AS tariffId,
    tariff_name AS tariffName, price
    FROM promo_demo_records WHERE record_type = 'CODE' AND batch_id = ? ORDER BY id`)
    .bind(safeId)
    .all<PromoCodeRecord>();
  const codes = result.results ?? [];
  batch.usedCount = codes.filter((item) => item.status === "USED").length;
  return { batch, codes };
}

export async function markPromoBatchExported(batchId: string): Promise<void> {
  await ensurePromoDemoDatabase();
  const now = new Date().toISOString();
  await database().prepare(`UPDATE promo_demo_records SET exported_at = ?, updated_at = ?
    WHERE record_type = 'BATCH' AND batch_id = ?`)
    .bind(now, now, batchId)
    .run();
}

export async function checkLocalPromo(code: string): Promise<PromoCodeRecord | null> {
  await ensurePromoDemoDatabase();
  let normalized: string;
  try {
    normalized = normalizePromoCode(code);
  } catch {
    return null;
  }
  const hash = await hmac(`code:${normalized}`);
  return database().prepare(`SELECT
    promo_code AS promoCode, batch_id AS batchId,
    object_prefix AS objectPrefix, object_name AS objectName,
    tenant_prefix AS tenantPrefix, tenant_name AS tenantName,
    generated_by AS generatedBy, generated_at AS generatedAt,
    status, reserved_at AS reservedAt, reserved_until AS reservedUntil,
    reservation_key_hash AS reservationKeyHash,
    used_at AS usedAt, deal_id AS dealId, order_id AS orderId, payment_id AS paymentId,
    tariff_id AS tariffId,
    tariff_name AS tariffName, price
    FROM promo_demo_records WHERE record_type = 'CODE' AND code_hash = ? LIMIT 1`)
    .bind(hash)
    .first<PromoCodeRecord>();
}

export async function redeemLocalPromo(code: string): Promise<PromoCodeRecord | null> {
  const record = await checkLocalPromo(code);
  if (!record || record.status !== "NEW") return null;
  const now = new Date().toISOString();
  const result = await database().prepare(`UPDATE promo_demo_records
    SET status = 'USED', used_at = ?, updated_at = ?
    WHERE record_type = 'CODE' AND promo_code = ? AND status = 'NEW'`)
    .bind(now, now, record.promoCode)
    .run();
  if (Number(result.meta?.changes ?? 0) !== 1) return null;
  return { ...record, status: "USED", usedAt: now };
}

export async function reserveLocalPromo(
  code: string,
  reservationKey: string,
  ttlSeconds = 1800,
): Promise<{ promo: PromoCodeRecord; reservedUntil: string } | null> {
  validateReservationKey(reservationKey);
  const record = await checkLocalPromo(code);
  if (!record) return null;
  const keyHash = await hmac(`reservation:${reservationKey}`);
  if (record.status === "RESERVED" && record.reservationKeyHash === keyHash && record.reservedUntil) {
    return { promo: record, reservedUntil: record.reservedUntil };
  }
  if (record.status !== "NEW") return null;

  const safeTtl = Math.max(60, Math.min(7200, Math.trunc(ttlSeconds)));
  const now = new Date();
  const until = new Date(now.getTime() + safeTtl * 1000).toISOString();
  const result = await database().prepare(`UPDATE promo_demo_records
    SET status = 'RESERVED', reserved_at = ?, reserved_until = ?,
      reservation_key_hash = ?, updated_at = ?
    WHERE record_type = 'CODE' AND promo_code = ? AND status = 'NEW'`)
    .bind(now.toISOString(), until, keyHash, now.toISOString(), record.promoCode)
    .run();
  if (Number(result.meta?.changes ?? 0) !== 1) return null;
  return {
    promo: {
      ...record,
      status: "RESERVED",
      reservedAt: now.toISOString(),
      reservedUntil: until,
      reservationKeyHash: keyHash,
    },
    reservedUntil: until,
  };
}

export async function releaseLocalPromo(code: string, reservationKey: string): Promise<boolean> {
  validateReservationKey(reservationKey);
  let normalized: string;
  try {
    normalized = normalizePromoCode(code);
  } catch {
    return false;
  }
  const keyHash = await hmac(`reservation:${reservationKey}`);
  const now = new Date().toISOString();
  const result = await database().prepare(`UPDATE promo_demo_records
    SET status = 'NEW', reserved_at = NULL, reserved_until = NULL,
      reservation_key_hash = NULL, updated_at = ?
    WHERE record_type = 'CODE' AND promo_code = ? AND status = 'RESERVED'
      AND reservation_key_hash = ?`)
    .bind(now, normalized, keyHash)
    .run();
  return Number(result.meta?.changes ?? 0) === 1;
}

export async function redeemReservedLocalPromo(
  code: string,
  reservationKey: string,
  payment: { dealId?: number; orderId?: number; paymentId?: number },
): Promise<{ promo: PromoCodeRecord; idempotent: boolean } | null> {
  validateReservationKey(reservationKey);
  const dealId = positiveId(payment.dealId);
  const orderId = positiveId(payment.orderId);
  const paymentId = positiveId(payment.paymentId);
  if (!dealId && !orderId && !paymentId) throw new Error("Не передан идентификатор подтверждённой оплаты.");

  const record = await checkLocalPromo(code);
  if (!record) return null;
  if (record.status === "USED") {
    const sameOperation = (dealId > 0 && record.dealId === dealId)
      || (orderId > 0 && record.orderId === orderId)
      || (paymentId > 0 && record.paymentId === paymentId);
    return sameOperation ? { promo: record, idempotent: true } : null;
  }
  const keyHash = await hmac(`reservation:${reservationKey}`);
  if (record.status !== "RESERVED" || record.reservationKeyHash !== keyHash) return null;

  const now = new Date().toISOString();
  const result = await database().prepare(`UPDATE promo_demo_records
    SET status = 'USED', used_at = ?, deal_id = ?, order_id = ?, payment_id = ?, updated_at = ?
    WHERE record_type = 'CODE' AND promo_code = ? AND status = 'RESERVED'
      AND reservation_key_hash = ?`)
    .bind(now, dealId || null, orderId || null, paymentId || null, now, record.promoCode, keyHash)
    .run();
  if (Number(result.meta?.changes ?? 0) !== 1) return null;
  return {
    promo: {
      ...record,
      status: "USED",
      usedAt: now,
      dealId: dealId || null,
      orderId: orderId || null,
      paymentId: paymentId || null,
    },
    idempotent: false,
  };
}

function normalizePromoCode(value: string): string {
  const compact = value.trim().toUpperCase().replace(/[\s-]+/gu, "");
  if (!/^[A-Z]{2}\d{2}[A-HJ-NP-Z2-9]{10}$/u.test(compact)) throw new Error("Неверный формат промокода.");
  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}

function randomTail(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return [...bytes].map((byte) => ALPHABET[byte & 31]).join("");
}

function validateReservationKey(value: string): void {
  if (value.length < 16 || value.length > 128) throw new Error("Некорректный ключ резервирования.");
}

function positiveId(value: number | undefined): number {
  const parsed = Math.trunc(Number(value ?? 0));
  return parsed > 0 ? parsed : 0;
}

async function hmac(value: string): Promise<string> {
  const secret = runtimeValue("PROMO_DEMO_SECRET", "local-promo-demo-only");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function emptyBatch(batchId: string): PromoBatch {
  return {
    batchId,
    quantity: 0,
    objectPrefix: "",
    objectName: "",
    tenantPrefix: "",
    tenantName: "",
    generatedBy: "",
    generatedAt: "",
    tariffId: "",
    tariffName: "",
    price: 0,
    usedCount: 0,
    exportedAt: null,
  };
}
