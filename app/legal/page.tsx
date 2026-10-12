import Link from "next/link";
import LegalNotice from "../LegalNotice";

export const metadata = {
  title: "Реквизиты и контакты · Лужники",
  description:
    "Юридическая информация и контакты оператора сервиса парковочных абонементов АО «Лужники».",
};

export default function LegalPage() {
  return (
    <div className="privacy-shell">
      <header className="site-header privacy-header">
        <Link className="brand" href="/parking-subscription" aria-label="Лужники — к оформлению абонемента">
          <img
            className="brand-logo"
            src="/brand/luzhniki-logo.png"
            alt="Лужники"
          />
          <span className="brand-service">Парковочный абонемент</span>
        </Link>
        <Link className="privacy-back" href="/parking-subscription">
          Вернуться к оформлению
        </Link>
      </header>

      <main className="privacy-main legal-main">
        <div className="privacy-title">
          <p className="eyebrow">Оператор сервиса</p>
          <h1>Реквизиты и контакты</h1>
          <p>
            Информация об организации, принимающей оплату за парковочные
            абонементы на территорию спортивного комплекса.
          </p>
        </div>

        <section className="legal-details" aria-label="Реквизиты организации">
          <article className="legal-details-card legal-details-card-wide">
            <span>Полное наименование</span>
            <strong>
              Акционерное общество «Олимпийский комплекс «Лужники»
            </strong>
            <p>Сокращённое наименование: АО «Лужники»</p>
          </article>

          <article className="legal-details-card">
            <span>Регистрационные данные</span>
            <dl>
              <div>
                <dt>ОГРН</dt>
                <dd>1027700111120</dd>
              </div>
              <div>
                <dt>ИНН</dt>
                <dd>7704077210</dd>
              </div>
              <div>
                <dt>КПП</dt>
                <dd>770401001</dd>
              </div>
            </dl>
          </article>

          <article className="legal-details-card">
            <span>Адрес</span>
            <strong>
              119048, г. Москва, вн.тер.г. муниципальный округ Хамовники,
              ул. Лужники, д. 24, стр. 9, помещ. 1/3
            </strong>
          </article>

          <article className="legal-details-card">
            <span>Телефон</span>
            <a href="tel:+74957800808">+7 (495) 780-08-08</a>
            <p>Информационный центр АО «Лужники»</p>
          </article>

          <article className="legal-details-card">
            <span>Электронная почта</span>
            <a href="mailto:callcenter@luzhniki.ru">
              callcenter@luzhniki.ru
            </a>
            <p>Обращения по парковочным абонементам, оплате и возвратам</p>
          </article>
        </section>

        <section className="legal-resources" aria-label="Официальные документы">
          <div>
            <p className="eyebrow">Официальные документы</p>
            <h2>Правила и защита данных</h2>
          </div>
          <div className="legal-resource-links">
            <a
              href="https://www.luzhniki.ru/rules/"
              target="_blank"
              rel="noreferrer"
            >
              Правила проезда на территорию
              <span aria-hidden="true">↗</span>
            </a>
            <a
              href="https://www.luzhniki.ru/documents/421/%D0%9F%D0%BE%D0%BB%D0%B8%D1%82%D0%B8%D0%BA%D0%B0_%D0%9E%D0%B1%D1%80%D0%B0%D0%B1%D0%BE%D1%82%D0%BA%D0%B8_%D0%9F%D0%94_%D0%90%D0%9E%D0%9B%D1%83%D0%B6%D0%BD%D0%B8%D0%BA%D0%B8.pdf"
              target="_blank"
              rel="noreferrer"
            >
              Политика обработки персональных данных
              <span aria-hidden="true">↗</span>
            </a>
            <Link href="/offer">
              Публичная оферта
              <span aria-hidden="true">→</span>
            </Link>
            <a
              href="/documents/parking-tariffs-2026.pdf"
              target="_blank"
              rel="noreferrer"
            >
              Тарифы и условия парковочных абонементов
              <span aria-hidden="true">↗</span>
            </a>
          </div>
        </section>
      </main>

      <LegalNotice />
    </div>
  );
}
