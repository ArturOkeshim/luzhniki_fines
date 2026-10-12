import Link from "next/link";
import LegalNotice from "../LegalNotice";
import { offerSections } from "./offer-data";

export const metadata = {
  title: "Публичная оферта · Лужники",
  description:
    "Публичная оферта АО «Олимпийский комплекс «Лужники» для пользователей сервиса парковочных абонементов.",
};

const sectionTitles = [
  "1. Общие положения",
  "2. Порядок заключения договора",
  "3. Предмет оферты",
  "4. Условия оказания услуг",
  "5. Права и обязанности сторон",
  "6. Стоимость услуг и порядок оплаты",
  "7. Ответственность сторон",
  "8. Форс-мажор",
  "9. Разрешение споров",
  "10. Срок действия и прочие условия договора",
  "11. Реквизиты АО «Лужники»",
] as const;

export default function OfferPage() {
  return (
    <div className="privacy-shell">
      <header className="site-header privacy-header">
        <Link className="brand" href="/parking-subscription" aria-label="Лужники — к оформлению абонемента">
          <img className="brand-logo" src="/brand/luzhniki-logo.png" alt="Лужники" />
          <span className="brand-service">Парковочный абонемент</span>
        </Link>
        <Link className="privacy-back" href="/parking-subscription">
          Вернуться к оформлению
        </Link>
      </header>

      <main className="privacy-main">
        <div className="privacy-title">
          <p className="eyebrow">Условия оказания услуг</p>
          <h1>Публичная оферта</h1>
          <p className="privacy-title-summary">Акционерное общество «Олимпийский комплекс «Лужники»</p>
          <a
            className="document-source-link"
            href="/documents/public-offer-2026-version-3.docx"
            download
          >
            Скачать утверждённый документ
          </a>
        </div>

        <article className="privacy-document" aria-label="Текст публичной оферты">
          {offerSections.map((section, sectionIndex) => (
            <section key={section.title}>
              <h2>{sectionTitles[sectionIndex] ?? section.title}</h2>
              <div className="privacy-section-body">
                {section.paragraphs.map((paragraph, paragraphIndex) => (
                  <p
                    className={paragraph.kind === "bullet" ? "legal-bullet" : undefined}
                    key={`${section.title}-${paragraphIndex}`}
                  >
                    {paragraph.text}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </article>
      </main>

      <footer>
        <Link className="footer-brand" href="/parking-subscription" aria-label="Лужники — к оформлению абонемента">
          <img src="/brand/luzhniki-logo.png" alt="Лужники" />
        </Link>
        <div className="footer-copy">
          <p>Публичная оферта</p>
          <Link className="footer-link" href="/parking-subscription">
            Вернуться к сервису
          </Link>
        </div>
      </footer>
      <LegalNotice />
    </div>
  );
}
