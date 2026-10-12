export function normalizeRussianPhone(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/gu, "");

  if (digits.length === 10) {
    return `+7${digits}`;
  }
  if (
    digits.length === 11 &&
    (digits.startsWith("7") || digits.startsWith("8"))
  ) {
    return `+7${digits.slice(1)}`;
  }
  return "";
}

export function formatRussianPhoneInput(value: unknown): string {
  const raw = String(value ?? "");
  let digits = raw.replace(/\D/gu, "");

  if (!digits) return raw.trim().startsWith("+") ? "+" : "";

  if (raw.trim().startsWith("+") && !digits.startsWith("7")) {
    return `+${digits.slice(0, 11)}`;
  }

  if (digits.startsWith("8")) {
    digits = `7${digits.slice(1)}`;
  } else if (!digits.startsWith("7")) {
    digits = `7${digits}`;
  }

  const national = digits.slice(1, 11);
  let formatted = "+7";

  if (national.length > 0) formatted += ` ${national.slice(0, 3)}`;
  if (national.length > 3) formatted += ` ${national.slice(3, 6)}`;
  if (national.length > 6) formatted += `-${national.slice(6, 8)}`;
  if (national.length > 8) formatted += `-${national.slice(8, 10)}`;

  return formatted;
}
