import Link from "next/link";

export default function LegalNotice() {
  return (
    <section className="legal-notice" aria-label="Юридическая информация">
      <div className="legal-notice-copy">
        <strong>АО «Олимпийский комплекс «Лужники»</strong>
        <span>ИНН 7704077210 · ОГРН 1027700111120 · КПП 770401001</span>
        <span>
          119048, г. Москва, вн.тер.г. муниципальный округ Хамовники,
          ул. Лужники, д. 24, стр. 9, помещ. 1/3
        </span>
      </div>
      <nav className="legal-notice-links" aria-label="Правовые документы">
        <Link href="/legal">Реквизиты и контакты</Link>
        <a
          href="https://www.luzhniki.ru/documents/421/%D0%9F%D0%BE%D0%BB%D0%B8%D1%82%D0%B8%D0%BA%D0%B0_%D0%9E%D0%B1%D1%80%D0%B0%D0%B1%D0%BE%D1%82%D0%BA%D0%B8_%D0%9F%D0%94_%D0%90%D0%9E%D0%9B%D1%83%D0%B6%D0%BD%D0%B8%D0%BA%D0%B8.pdf"
          target="_blank"
          rel="noreferrer"
        >
          Политика обработки персональных данных
        </a>
        <Link href="/offer">Публичная оферта</Link>
        <a href="/documents/parking-tariffs-2026.pdf" target="_blank" rel="noreferrer">
          Тарифы и условия
        </a>
        <a
          href="https://www.luzhniki.ru/rules/"
          target="_blank"
          rel="noreferrer"
        >
          Правила проезда
        </a>
      </nav>
    </section>
  );
}
