const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDateOnly(value: string) {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) throw new RangeError(`Invalid date-only value: ${value}`);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new RangeError(`Invalid date-only value: ${value}`);
  }

  return date;
}

export function addDateOnlyDays(value: string, days: number) {
  const date = parseDateOnly(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function inclusiveDateRangeEnd(value: string, durationDays: number) {
  if (!Number.isInteger(durationDays) || durationDays < 1) {
    throw new RangeError(`Invalid inclusive duration: ${durationDays}`);
  }

  return addDateOnlyDays(value, durationDays - 1);
}

export function formatRussianDateOnly(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parseDateOnly(value));
}

export function moscowDate(offsetDays = 0, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  const value = `${part("year")}-${part("month")}-${part("day")}`;
  return addDateOnlyDays(value, offsetDays);
}
