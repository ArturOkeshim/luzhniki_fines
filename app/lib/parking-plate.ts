const LOOKALIKE_MAP: Record<string, string> = {
  A: "А",
  B: "В",
  E: "Е",
  K: "К",
  M: "М",
  H: "Н",
  O: "О",
  P: "Р",
  C: "С",
  T: "Т",
  Y: "У",
  X: "Х",
};

const PLATE_LETTER = /^[АВЕКМНОРСТУХ]$/u;
const PLATE_DIGIT = /^\d$/u;
const RUSSIAN_PASSENGER_PLATE = /^[АВЕКМНОРСТУХ]\d{3}[АВЕКМНОРСТУХ]{2}\d{2,3}$/u;

export function normalizeRussianPlate(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replaceAll("Ё", "Е")
    .replace(/[ABEKMHOPCTYX]/gu, (letter) => LOOKALIKE_MAP[letter] ?? letter)
    .replace(/[\s-]+/gu, "");
}

export function formatRussianPlateInput(value: unknown): string {
  const source = normalizeRussianPlate(value);
  let result = "";

  for (const character of source) {
    const position = result.length;
    const expectsLetter = position === 0 || position === 4 || position === 5;
    const accepted = expectsLetter
      ? PLATE_LETTER.test(character)
      : PLATE_DIGIT.test(character);

    if (accepted) result += character;
    if (result.length === 9) break;
  }

  return result;
}

export function isRussianPlateValid(value: unknown): boolean {
  return RUSSIAN_PASSENGER_PLATE.test(normalizeRussianPlate(value));
}
