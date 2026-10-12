export const PARKING_TARIFFS = {
  standard: {
    rateId: 8,
    price: 15000,
    name: "Посетитель · будни и выходные",
    days: "Рабочие, выходные и праздничные дни",
    limit: "Без ограничения по времени",
    accessHours: "с 06:00 до 01:00",
    eligibility: "Для гостей, регулярно посещающих объекты АО «Лужники»",
    activeFrom: "2026-07-15",
    durationDays: 30,
  },
  "client-all": {
    rateId: 9,
    price: 12000,
    name: "Резиденты — взрослые · будни и выходные",
    days: "Рабочие, выходные и праздничные дни",
    limit: "Не более 4 часов с момента въезда",
    accessHours: "с 06:00 до 01:00",
    eligibility: "Для совершеннолетних лиц, пользующихся спортивной инфраструктурой на основании договора с АО «Лужники»",
    activeFrom: "2026-07-15",
    durationDays: 30,
  },
  "client-weekdays": {
    rateId: 10,
    price: 8000,
    name: "Резиденты — взрослые · будни",
    days: "Рабочие дни",
    limit: "Не более 4 часов с момента въезда",
    accessHours: "с 06:00 до 01:00",
    eligibility: "Для совершеннолетних лиц, пользующихся спортивной инфраструктурой на основании договора с АО «Лужники»",
    activeFrom: "2026-07-15",
    durationDays: 30,
  },
  "parent-all": {
    rateId: 11,
    price: 8000,
    name: "Резиденты — дети (до 18 лет) · будни и выходные",
    days: "Рабочие, выходные и праздничные дни",
    limit: "Не более 4 часов с момента въезда",
    accessHours: "с 06:00 до 23:00",
    eligibility: "Для лиц, перевозящих ребёнка или детей до 18 лет для посещения спортивной инфраструктуры на основании договора с АО «Лужники»",
    activeFrom: "2026-08-25",
    durationDays: 30,
  },
  "parent-weekdays": {
    rateId: 12,
    price: 6000,
    name: "Резиденты — дети (до 18 лет) · будни",
    days: "Рабочие дни",
    limit: "Не более 4 часов с момента въезда",
    accessHours: "с 06:00 до 23:00",
    eligibility: "Для лиц, перевозящих ребёнка или детей до 18 лет для посещения спортивной инфраструктуры на основании договора с АО «Лужники»",
    activeFrom: "2026-08-25",
    durationDays: 30,
  },
  test: {
    rateId: 0,
    price: 10,
    name: "Проверка оформления и оплаты",
    days: "Рабочие, выходные и праздничные дни",
    limit: "Без ограничения по времени",
    accessHours: "с 06:00 до 01:00",
    eligibility: "Для проверки оформления и оплаты абонемента",
    activeFrom: "2026-07-15",
    durationDays: 30,
  },
} as const;

export type ParkingTariffId = keyof typeof PARKING_TARIFFS;

export function isParkingTariffId(value: unknown): value is ParkingTariffId {
  return typeof value === "string" && value in PARKING_TARIFFS;
}
