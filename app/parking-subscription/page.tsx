import type { Metadata } from "next";
import { moscowDate } from "@/app/lib/date-only";
import { PARKING_DEMO_PROMOS, parkingDemoEnabled } from "@/app/lib/parking-demo";
import ParkingSubscription from "./ParkingSubscription";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Парковочные абонементы · Лужники",
  description:
    "Оформление и оплата парковочного абонемента на территорию АО «Лужники».",
  openGraph: {
    title: "Парковочные абонементы · Лужники",
    description:
      "Оформление и оплата парковочного абонемента на территорию АО «Лужники».",
    type: "website",
    locale: "ru_RU",
    images: [{ url: "/og-parking-clean.png", width: 1731, height: 909 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Парковочные абонементы · Лужники",
    description:
      "Оформление и оплата парковочного абонемента на территорию АО «Лужники».",
    images: ["/og-parking-clean.png"],
  },
  robots: { index: false, follow: false },
};

export default function ParkingSubscriptionPage() {
  const demoMode = parkingDemoEnabled();
  return (
    <ParkingSubscription
      demoMode={demoMode}
      demoPromos={demoMode ? PARKING_DEMO_PROMOS : []}
      initialServiceDate={moscowDate()}
    />
  );
}
