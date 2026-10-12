import { runtimeValue } from "@/app/lib/config";
import { PARKING_TARIFFS, ParkingTariffId } from "@/app/lib/parking-tariffs";

export type ParkingDemoPromo = {
  code: string;
  tariffId: ParkingTariffId;
  price: number;
  tariffName: string;
};

const DEMO_PROMO_DEFINITIONS: Array<{ code: string; tariffId: ParkingTariffId }> = [
  { code: "DEMO-12000", tariffId: "client-all" },
  { code: "DEMO-8000-A", tariffId: "client-weekdays" },
  { code: "DEMO-8000-B", tariffId: "parent-all" },
  { code: "DEMO-6000", tariffId: "parent-weekdays" },
];

export const PARKING_DEMO_PROMOS: ParkingDemoPromo[] = DEMO_PROMO_DEFINITIONS.map(
  ({ code, tariffId }) => ({
    code,
    tariffId,
    price: PARKING_TARIFFS[tariffId].price,
    tariffName: PARKING_TARIFFS[tariffId].name,
  }),
);

export function parkingDemoEnabled(): boolean {
  return runtimeValue("PARKING_DEMO_MODE") === "1";
}

export function findParkingDemoPromo(value: string): ParkingDemoPromo | null {
  const normalized = value.trim().toUpperCase().replace(/\s+/gu, "");
  return PARKING_DEMO_PROMOS.find((promo) => promo.code === normalized) ?? null;
}
