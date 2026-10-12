import type { Metadata } from "next";
import PromoAdmin from "./PromoAdmin";

export const metadata: Metadata = {
  title: "Генерация промокодов · Лужники",
  description: "Локальный стенд генерации и проверки парковочных промокодов.",
  robots: { index: false, follow: false },
};

export default function PromoAdminPage() {
  return <PromoAdmin />;
}
