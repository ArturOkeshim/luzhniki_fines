import { bitrixRestRequest } from "./bitrix";

type Contact = Record<string, unknown> & {
  ID?: number | string;
  id?: number | string;
};

type DuplicateContacts = {
  CONTACT?: Array<number | string>;
  contact?: Array<number | string>;
};

type ContactMultifield = {
  ID?: number | string;
  VALUE: string;
  VALUE_TYPE: string;
};

const SUPPRESSED_NOTIFICATION_EMAILS = new Set([
  "adminluzh@luzhniki.ru",
]);

export function cleanName(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/gu, " ")
    .slice(0, 80);
}

export function cleanEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().slice(0, 160);
}

export function isSuppressedNotificationEmail(value: unknown): boolean {
  return SUPPRESSED_NOTIFICATION_EMAILS.has(cleanEmail(value));
}

function contactId(contact: Contact): number {
  return Number(contact.ID ?? contact.id ?? 0);
}

function contactMultifields(
  contact: Contact,
  field: "PHONE" | "EMAIL",
): ContactMultifield[] {
  const raw = contact[field] ?? contact[field.toLowerCase()];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (typeof entry === "string") {
        return { VALUE: entry.trim(), VALUE_TYPE: "OTHER" };
      }
      if (!entry || typeof entry !== "object") return null;
      const value = entry as Record<string, unknown>;
      const normalized: ContactMultifield = {
        VALUE: String(value.VALUE ?? value.value ?? "").trim(),
        VALUE_TYPE: String(
          value.VALUE_TYPE ?? value.valueType ?? "OTHER",
        ).toUpperCase(),
      };
      const id = value.ID ?? value.id;
      if (id !== undefined && id !== null) normalized.ID = id as number | string;
      return normalized;
    })
    .filter((entry): entry is ContactMultifield => Boolean(entry?.VALUE));
}

function includesMultifield(entries: ContactMultifield[], sought: string) {
  const normalized = sought.toLowerCase();
  return entries.some((entry) => entry.VALUE.toLowerCase() === normalized);
}

async function findContact(
  filter: "phone" | "email",
  value: string,
): Promise<Contact | null> {
  const data = await bitrixRestRequest<DuplicateContacts>(
    "crm.duplicate.findbycomm",
    {
      entity_type: "CONTACT",
      type: filter === "phone" ? "PHONE" : "EMAIL",
      values: [value],
    },
  );
  const ids = data.CONTACT ?? data.contact ?? [];
  const id = Number(ids[0] ?? 0);
  return id > 0 ? { ID: id } : null;
}

async function getContact(id: number): Promise<Contact> {
  const contact = await bitrixRestRequest<Contact>("crm.contact.get", { id });
  if (contactId(contact) !== id) throw new Error("Контакт не найден");
  return contact;
}

function assertContactIdentity(
  contact: Contact,
  identity: { phone: string; email: string },
): void {
  if (
    !includesMultifield(contactMultifields(contact, "PHONE"), identity.phone) ||
    !includesMultifield(contactMultifields(contact, "EMAIL"), identity.email)
  ) {
    throw new Error("Контакт создан без телефона или email");
  }
}

export async function upsertPaymentContact(identity: {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
}): Promise<number> {
  if (isSuppressedNotificationEmail(identity.email)) {
    throw new Error("Использование системного email для клиента запрещено");
  }

  const [phoneContact, emailContact] = await Promise.all([
    findContact("phone", identity.phone),
    findContact("email", identity.email),
  ]);
  const found = phoneContact ?? emailContact;

  if (!found) {
    const created = await bitrixRestRequest<number>("crm.contact.add", {
      fields: {
        NAME: identity.firstName,
        LAST_NAME: identity.lastName,
        OPENED: "N",
        SOURCE_DESCRIPTION: "Сервис оплаты штрафов за въезд",
        PHONE: [{ VALUE: identity.phone, VALUE_TYPE: "OTHER" }],
        EMAIL: [{ VALUE: identity.email, VALUE_TYPE: "OTHER" }],
      },
    });
    const id = Number(created ?? 0);
    if (!id) throw new Error("Контакт не создан");
    assertContactIdentity(await getContact(id), identity);
    return id;
  }

  const id = contactId(found);
  if (!id) throw new Error("Контакт не найден");
  const existing = await getContact(id);
  const phones = contactMultifields(existing, "PHONE");
  const emails = contactMultifields(existing, "EMAIL");
  if (!includesMultifield(phones, identity.phone)) {
    phones.push({ VALUE: identity.phone, VALUE_TYPE: "OTHER" });
  }
  if (!includesMultifield(emails, identity.email)) {
    emails.push({ VALUE: identity.email, VALUE_TYPE: "OTHER" });
  }

  await bitrixRestRequest<boolean>("crm.contact.update", {
    id,
    fields: {
      NAME: identity.firstName,
      LAST_NAME: identity.lastName,
      PHONE: phones,
      EMAIL: emails,
    },
  });
  assertContactIdentity(await getContact(id), identity);
  return id;
}
