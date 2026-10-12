"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import styles from "./promo-admin.module.css";

type PromoObject = { prefix: string; name: string };
type Tariff = { id: string; name: string; price: number };
type Tenant = {
  objectPrefix: string; objectName: string; tenantPrefix: string; tenantName: string;
  tariffId: string; tariffName: string; price: number;
};
type Code = Tenant & {
  promoCode: string; batchId: string; generatedBy: string; generatedAt: string;
  status: "NEW" | "USED" | "BLOCKED"; usedAt: string | null;
};
type Batch = Tenant & {
  batchId: string; quantity: number; generatedBy: string; generatedAt: string;
  usedCount: number; exportedAt: string | null;
};
type Selected = { batch: Batch; codes: Code[] };
type AdminData = {
  objects: PromoObject[]; tariffs: Tariff[]; tenants: Tenant[]; batches: Batch[];
  selected: Selected | null; user: string;
};

const formatPrice = (value: number) => `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;
const formatDate = (value: string) => new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "short", timeStyle: "short",
}).format(new Date(value));

export default function PromoAdmin() {
  const [data, setData] = useState<AdminData | null>(null);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [objectPrefix, setObjectPrefix] = useState("AK");
  const [tenantPrefix, setTenantPrefix] = useState("01");
  const [count, setCount] = useState(10);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [testCode, setTestCode] = useState("");
  const [testResult, setTestResult] = useState("");
  const [testError, setTestError] = useState(false);
  const [reservationKey, setReservationKey] = useState("");

  const availableTenants = useMemo(
    () => (data?.tenants ?? []).filter((tenant) => tenant.objectPrefix === objectPrefix),
    [data, objectPrefix],
  );

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!availableTenants.some((tenant) => tenant.tenantPrefix === tenantPrefix)) {
      setTenantPrefix(availableTenants[0]?.tenantPrefix ?? "");
    }
  }, [availableTenants, tenantPrefix]);

  async function loadData(batchId = "") {
    try {
      const response = await fetch(`/api/promo-admin${batchId ? `?batch=${encodeURIComponent(batchId)}` : ""}`, { cache: "no-store" });
      const payload = await response.json() as AdminData & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Сервис недоступен.");
      setData(payload);
      if (payload.selected) setSelected(payload.selected);
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось открыть локальный стенд.");
    }
  }

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/promo-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate", objectPrefix, tenantPrefix, count,
          requestId: crypto.randomUUID(),
        }),
      });
      const payload = await response.json() as Selected & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Не удалось создать промокоды.");
      const result = { batch: payload.batch, codes: payload.codes };
      setSelected(result);
      setTestCode(result.codes[0]?.promoCode ?? "");
      setMessage(`Партия сохранена: ${result.codes.length} промокодов.`);
      await loadData(result.batch.batchId);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось создать промокоды.");
    } finally {
      setBusy(false);
    }
  }

  async function addTenant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/promo-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addTenant",
          objectPrefix: form.get("newObjectPrefix"),
          tenantName: form.get("tenantName"),
          tariffId: form.get("tariffId"),
        }),
      });
      const payload = await response.json() as { tenant?: Tenant; error?: string };
      if (!response.ok || !payload.tenant) throw new Error(payload.error ?? "Не удалось добавить арендатора.");
      setObjectPrefix(payload.tenant.objectPrefix);
      setTenantPrefix(payload.tenant.tenantPrefix);
      setMessage(`Арендатор добавлен. Идентификатор: ${payload.tenant.tenantPrefix}.`);
      event.currentTarget.reset();
      await loadData();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось добавить арендатора.");
    } finally {
      setBusy(false);
    }
  }

  async function testPromo(action: "check" | "reserve" | "redeem" | "release") {
    setBusy(true);
    setTestResult("");
    setTestError(false);
    try {
      const nextReservationKey = reservationKey || crypto.randomUUID();
      const response = await fetch("/api/promo-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          code: testCode,
          reservationKey: nextReservationKey,
          dealId: 900000 + Math.floor(Math.random() * 99999),
        }),
      });
      const payload = await response.json() as {
        error?: string; price?: number; tariffName?: string; tenant?: string;
        reserved?: boolean; redeemed?: boolean; released?: boolean; reservationKey?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Проверка не выполнена.");
      if (action === "reserve") {
        setReservationKey(payload.reservationKey ?? nextReservationKey);
        setTestResult("Код зарезервирован на 30 минут. Для другого заказа он уже недоступен.");
      } else if (action === "redeem") {
        setReservationKey("");
        setTestResult("Оплата подтверждена: код погашен и повторно применяться не может.");
      } else if (action === "release") {
        setReservationKey("");
        setTestResult("Резерв снят. Код снова доступен.");
      } else {
        setTestResult(`Код активен · ${payload.tenant} · ${payload.tariffName} · ${formatPrice(Number(payload.price ?? 0))}`);
      }
      if (selected) await loadData(selected.batch.batchId);
    } catch (requestError) {
      setTestError(true);
      setTestResult(requestError instanceof Error ? requestError.message : "Проверка не выполнена.");
    } finally {
      setBusy(false);
    }
  }

  async function copyCode(code: string) {
    await navigator.clipboard.writeText(code);
    setTestCode(code);
    setReservationKey("");
    setMessage(`Промокод ${code} скопирован.`);
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a href="/" aria-label="Лужники"><img src="/brand/luzhniki-logo.png" alt="Лужники" /></a>
        <div className={styles.headerRight}>
          <span className={styles.demoBadge}>Локальный тест</span>
          <a href="/parking-subscription">Страница абонемента</a>
        </div>
      </header>

      <section className={styles.intro}>
        <div>
          <p className={styles.eyebrow}>СЕРВИС ПАРКОВОЧНЫХ АБОНЕМЕНТОВ</p>
          <h1>Генерация<br /><span>промокодов</span></h1>
        </div>
        <div className={styles.introText}>
          <p>Выберите объект, арендатора и количество. Система сформирует уникальные коды, сохранит их в локальной базе и подготовит Excel.</p>
          <dl><div><dt>Пользователь</dt><dd>{data?.user ?? "Локальный сотрудник"}</dd></div><div><dt>Формат</dt><dd>AK01-XXXXXXXXXX</dd></div></dl>
        </div>
      </section>

      {error && <div className={`${styles.notice} ${styles.noticeError}`}>{error}</div>}
      {message && <div className={styles.notice}>{message}</div>}

      <section className={styles.generatorCard}>
        <div className={styles.sectionHeading}><span>01</span><div><p>Новая партия</p><h2>Параметры генерации</h2></div></div>
        <form className={styles.generatorForm} onSubmit={generate}>
          <label><span>Объект</span><select value={objectPrefix} onChange={(event) => setObjectPrefix(event.target.value)} required>
            {(data?.objects ?? []).map((object) => <option key={object.prefix} value={object.prefix}>{object.prefix} — {object.name}</option>)}
          </select></label>
          <label><span>Арендатор</span><select value={tenantPrefix} onChange={(event) => setTenantPrefix(event.target.value)} disabled={!availableTenants.length} required>
            {!availableTenants.length && <option value="">Сначала добавьте арендатора</option>}
            {availableTenants.map((tenant) => <option key={`${tenant.objectPrefix}-${tenant.tenantPrefix}`} value={tenant.tenantPrefix}>{tenant.tenantPrefix} — {tenant.tenantName}</option>)}
          </select></label>
          <label><span>Количество</span><input type="number" min="1" max="500" value={count} onChange={(event) => setCount(Number(event.target.value))} required /><small>До 500 на локальном стенде</small></label>
          <button type="submit" disabled={busy || !tenantPrefix}>{busy ? "Генерация…" : "Сгенерировать и сохранить"}<b>→</b></button>
        </form>
      </section>

      {selected && selected.codes.length > 0 && <section className={styles.resultCard}>
        <div className={styles.resultSummary}>
          <div><p className={styles.eyebrow}>ПАРТИЯ СОХРАНЕНА</p><h2>{selected.codes.length} промокодов</h2><p>{selected.batch.objectName} · {selected.batch.tenantPrefix} — {selected.batch.tenantName}</p></div>
          <a className={styles.exportButton} href={`/api/promo-admin/export?batch=${encodeURIComponent(selected.batch.batchId)}`}>Скачать Excel <b>↓</b></a>
        </div>
        <div className={styles.codeTableWrap}><table className={styles.codeTable}><thead><tr><th>Промокод</th><th>Тариф</th><th>Стоимость</th><th>Статус</th><th></th></tr></thead><tbody>
          {selected.codes.slice(0, 50).map((code) => <tr key={code.promoCode}><td><code>{code.promoCode}</code></td><td>{code.tariffName}</td><td>{formatPrice(code.price)}</td><td><span className={code.status === "NEW" ? styles.statusNew : styles.statusUsed}>{code.status === "NEW" ? "Активен" : code.status === "RESERVED" ? "Зарезервирован" : "Использован"}</span></td><td><button type="button" onClick={() => void copyCode(code.promoCode)}>Копировать</button></td></tr>)}
        </tbody></table></div>
        {selected.codes.length > 50 && <p className={styles.tableNote}>На странице показаны первые 50 кодов. В Excel войдёт вся партия.</p>}
      </section>}

      <section className={styles.twoColumns}>
        <div className={styles.panel}>
          <div className={styles.sectionHeading}><span>02</span><div><p>Проверка</p><h2>Тест кода</h2></div></div>
          <p className={styles.panelLead}>Здесь можно проверить созданный код и тестово отметить его использованным.</p>
          <label className={styles.testField}><span>Промокод</span><input value={testCode} onChange={(event) => { setTestCode(event.target.value.toUpperCase()); setReservationKey(""); }} placeholder="AK01-XXXXXXXXXX" /></label>
          <div className={styles.testActions}>
            <button type="button" onClick={() => void testPromo("check")} disabled={busy || !testCode}>Проверить</button>
            {!reservationKey ? <button type="button" onClick={() => void testPromo("reserve")} disabled={busy || !testCode}>Зарезервировать</button> : <>
              <button type="button" onClick={() => void testPromo("redeem")} disabled={busy}>Подтвердить оплату</button>
              <button type="button" onClick={() => void testPromo("release")} disabled={busy}>Снять резерв</button>
            </>}
          </div>
          {testResult && <p className={testError ? styles.testResultError : styles.testResult}>{testResult}</p>}
        </div>

        <details className={styles.panel}>
          <summary><div className={styles.sectionHeading}><span>03</span><div><p>Справочник</p><h2>Добавить арендатора</h2></div></div><b>+</b></summary>
          <form className={styles.tenantForm} onSubmit={addTenant}>
            <label><span>Объект</span><select name="newObjectPrefix" required>{(data?.objects ?? []).map((object) => <option key={object.prefix} value={object.prefix}>{object.prefix} — {object.name}</option>)}</select></label>
            <label><span>Название арендатора</span><input name="tenantName" maxLength={255} required /></label>
            <label><span>Тариф</span><select name="tariffId" required>{(data?.tariffs ?? []).map((tariff) => <option key={tariff.id} value={tariff.id}>{tariff.name} · {formatPrice(tariff.price)}</option>)}</select></label>
            <button type="submit" disabled={busy}>Добавить арендатора</button>
          </form>
        </details>
      </section>

      <section className={styles.history}>
        <div className={styles.sectionHeading}><span>04</span><div><p>Журнал</p><h2>Последние партии</h2></div></div>
        <div className={styles.codeTableWrap}><table className={styles.codeTable}><thead><tr><th>Дата</th><th>Объект</th><th>Арендатор</th><th>Сотрудник</th><th>Кодов</th><th>Использовано</th><th></th></tr></thead><tbody>
          {(data?.batches ?? []).map((batch) => <tr key={batch.batchId}><td>{formatDate(batch.generatedAt)}</td><td>{batch.objectPrefix} · {batch.objectName}</td><td>{batch.tenantPrefix} · {batch.tenantName}</td><td>{batch.generatedBy}</td><td>{batch.quantity}</td><td>{batch.usedCount}</td><td><button type="button" onClick={() => void loadData(batch.batchId)}>Открыть</button></td></tr>)}
          {data?.batches.length === 0 && <tr><td colSpan={7}>Партии пока не создавались.</td></tr>}
        </tbody></table></div>
      </section>
    </main>
  );
}
