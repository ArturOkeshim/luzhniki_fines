"use client";

import Link from "next/link";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { formatRussianPhoneInput } from "@/app/lib/phone";
import LegalNotice from "./LegalNotice";

type Evidence = {
  id: number;
  name: string;
  url: string;
  previewUrl?: string;
  probeVideoUrl?: string;
};
type Fine = {
  id: number;
  plate: string;
  productName: string;
  occurredAt: string;
  amount: number;
  payable: boolean;
  photos: Evidence[];
  videos: Evidence[];
};
type SearchResult = {
  plate: string;
  fines: Fine[];
  outstandingCount: number;
  total: number;
  accessRestored: boolean;
  accessToken?: string;
};
type Identity = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  consent: boolean;
};

const emptyIdentity: Identity = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  consent: false,
};
const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});
const dateTime = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const FINE_PAYMENT_WINDOW_NAME = "luzhniki-fine-payment";

function renderPaymentWindowMessage(
  target: Window | null,
  title: string,
  message: string,
) {
  if (!target) return;

  try {
    const page = target.document;
    page.title = title;
    page.documentElement.lang = "ru";
    page.body.replaceChildren();
    page.body.style.cssText =
      "margin:0;min-height:100vh;display:grid;place-items:center;background:#f7f5ef;color:#11232b;font:600 18px system-ui,sans-serif";

    const card = page.createElement("main");
    card.style.cssText =
      "width:min(520px,calc(100% - 48px));padding:40px;border:1px solid #deded9;background:#fff";
    const heading = page.createElement("h1");
    heading.textContent = title;
    heading.style.cssText = "margin:0 0 16px;font-size:28px";
    const copy = page.createElement("p");
    copy.textContent = message;
    copy.style.cssText = "margin:0;font-size:18px;line-height:1.5";
    card.append(heading, copy);
    page.body.append(card);
  } catch {
    // После перехода на страницу банка доступ к документу ожидаемо закрыт.
  }
}

function openPreparedPaymentWindow() {
  const target = window.open(
    "",
    `${FINE_PAYMENT_WINDOW_NAME}-${Date.now()}`,
  );
  renderPaymentWindowMessage(
    target,
    "Готовим оплату",
    "Пожалуйста, не закрывайте эту вкладку. Страница банка откроется автоматически.",
  );
  return target;
}

function navigatePaymentWindow(target: Window | null, url: string) {
  if (!target) return false;

  try {
    target.location.replace(url);
    target.focus();
    return true;
  } catch {
    return false;
  }
}

function evidenceName(evidence: Evidence, fallback: string): string {
  if (!evidence.name || /^(?:ajax\.php|Файл \d+)$/iu.test(evidence.name)) {
    return fallback;
  }
  return evidence.name;
}

function EvidenceDownload({
  evidence,
  fineId,
  label,
}: {
  evidence: Evidence;
  fineId: number;
  label: string;
}) {
  return (
    <a
      className="evidence-item download evidence-fallback"
      href={evidence.url}
      target="_blank"
      rel="noreferrer"
      aria-label={`Скачать материал нарушения №${fineId}`}
    >
      <span className="evidence-file-index">{label}</span>
      <strong>{evidenceName(evidence, `Материал нарушения №${fineId}`)}</strong>
      <span className="evidence-download-action">Скачать файл ↓</span>
    </a>
  );
}

function VideoEvidence({
  evidence,
  fineId,
  onNotVideo,
}: {
  evidence: Evidence;
  fineId: number;
  onNotVideo?: () => void;
}) {
  const videoUrl = evidence.probeVideoUrl || evidence.url;

  return (
    <div className="evidence-item evidence-card video preview">
      <div className="evidence-media">
        <video
          muted
          playsInline
          preload="metadata"
          aria-label={`Превью видео нарушения №${fineId}`}
          onError={onNotVideo}
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;
            if (Number.isFinite(video.duration) && video.duration > 0) {
              video.currentTime = Math.min(0.1, video.duration / 2);
            }
          }}
        >
          <source src={videoUrl} onError={onNotVideo} />
        </video>
        <span className="evidence-badge">Видео</span>
      </div>
      <div className="evidence-card-footer">
        <strong>Видео нарушения</strong>
        <a
          className="evidence-card-action"
          href={evidence.url}
          target="_blank"
          rel="noreferrer"
          aria-label={`Скачать видео нарушения №${fineId}`}
        >
          Скачать <span aria-hidden="true">↓</span>
        </a>
      </div>
    </div>
  );
}

function EvidencePreview({
  evidence,
  fineId,
}: {
  evidence: Evidence;
  fineId: number;
}) {
  const [mode, setMode] = useState<
    "video" | "photo" | "loading" | "download"
  >(
    evidence.probeVideoUrl ? "video" : "photo",
  );
  const [localPreviewUrl, setLocalPreviewUrl] = useState("");
  const conversionStartedRef = useRef(false);

  useEffect(
    () => () => {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    },
    [localPreviewUrl],
  );

  const loadUnknownPreview = useCallback(async () => {
    if (conversionStartedRef.current) return;
    conversionStartedRef.current = true;
    setMode("loading");

    try {
      const response = await fetch(evidence.previewUrl || evidence.url, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error("Превью недоступно");
      const sourceBlob = await response.blob();
      let previewBlob = sourceBlob;
      if (!/^image\/(?:avif|gif|jpeg|png|webp)$/iu.test(sourceBlob.type)) {
        const sourceFile = new File(
          [sourceBlob],
          evidenceName(evidence, `Фото нарушения №${fineId}.heic`),
          { type: sourceBlob.type },
        );
        const { heicTo, isHeic } = await import("heic-to/csp");
        if (await isHeic(sourceFile)) {
          previewBlob = await heicTo({
            blob: sourceBlob,
            type: "image/jpeg",
            quality: 0.62,
          });
        }
      }
      setLocalPreviewUrl(URL.createObjectURL(previewBlob));
      setMode("photo");
    } catch {
      setMode("download");
    }
  }, [evidence, fineId]);

  if (mode === "video") {
    return (
      <VideoEvidence
        evidence={evidence}
        fineId={fineId}
        onNotVideo={() => void loadUnknownPreview()}
      />
    );
  }

  if (mode === "loading") {
    return (
      <div className="evidence-item evidence-card preview preview-loading">
        <div className="evidence-media evidence-media-loading" role="status">
          <span className="evidence-badge">Фото</span>
          <strong>Готовим превью…</strong>
          <span className="evidence-processing">
            Файл обрабатывается на устройстве
          </span>
        </div>
        <div className="evidence-card-footer">
          <strong>Фото нарушения</strong>
          <a
            className="evidence-card-action"
            href={evidence.url}
            target="_blank"
            rel="noreferrer"
            aria-label={`Скачать фото нарушения №${fineId}`}
          >
            Скачать <span aria-hidden="true">↓</span>
          </a>
        </div>
      </div>
    );
  }

  if (mode === "download") {
    return (
      <EvidenceDownload evidence={evidence} fineId={fineId} label="Материал" />
    );
  }

  return (
    <div className="evidence-item evidence-card photo preview">
      <a
        className="evidence-media"
        href={evidence.url}
        target="_blank"
        rel="noreferrer"
        aria-label={`Открыть фото нарушения №${fineId}`}
      >
        <img
          src={localPreviewUrl || evidence.previewUrl || evidence.url}
          alt={`Фото нарушения №${fineId}`}
          loading="lazy"
          onError={() => setMode("download")}
        />
        <span className="evidence-badge">Фото</span>
      </a>
      <div className="evidence-card-footer">
        <strong>Фото нарушения</strong>
        <a
          className="evidence-card-action"
          href={evidence.url}
          target="_blank"
          rel="noreferrer"
          aria-label={`Скачать фото нарушения №${fineId}`}
        >
          Скачать <span aria-hidden="true">↓</span>
        </a>
      </div>
    </div>
  );
}

function formatDate(value: string) {
  if (!value) return "Время уточняется";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : dateTime.format(parsed);
}

function userMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const message = (payload as { error?: unknown }).error;
  return typeof message === "string" ? message : fallback;
}

function isLocalDemoMode() {
  if (typeof window === "undefined") return false;
  const isLocalHost = ["127.0.0.1", "localhost"].includes(
    window.location.hostname,
  );
  return (
    isLocalHost &&
    new URLSearchParams(window.location.search).get("demo") === "local"
  );
}

function createDemoResult(plate: string): SearchResult {
  const demoFines: Fine[] = [
    {
      id: 1001,
      plate,
      productName: "Проезд без действующего допуска",
      occurredAt: "2026-08-04T09:35:00+03:00",
      amount: 5000,
      payable: true,
      photos: [],
      videos: [],
    },
    {
      id: 1002,
      plate,
      productName: "Нарушение схемы движения",
      occurredAt: "2026-08-03T18:10:00+03:00",
      amount: 10000,
      payable: true,
      photos: [],
      videos: [],
    },
  ];

  return {
    plate,
    fines: demoFines,
    outstandingCount: demoFines.length,
    total: demoFines.reduce((sum, fine) => sum + fine.amount, 0),
    accessRestored: false,
    accessToken: "local-demo",
  };
}

export default function FinesPortal() {
  const [plate, setPlate] = useState("");
  const [searchReady, setSearchReady] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [identity, setIdentity] = useState<Identity>(emptyIdentity);
  const [paymentError, setPaymentError] = useState("");
  const [creatingPayment, setCreatingPayment] = useState(false);
  const [checkoutToken, setCheckoutToken] = useState("");
  const [paymentState, setPaymentState] = useState<
    "idle" | "waiting" | "paid" | "restored"
  >("idle");
  const [remainingAfterPayment, setRemainingAfterPayment] = useState(0);
  const [paymentUrl, setPaymentUrl] = useState("");
  const [selectedFineIds, setSelectedFineIds] = useState<number[]>([]);
  const [paymentReturn, setPaymentReturn] = useState<{
    plate: string;
    accessRestored: boolean;
    remaining: number;
  } | null>(null);
  const modalCloseRef = useRef<HTMLButtonElement>(null);
  const resultsSectionRef = useRef<HTMLElement>(null);
  const shouldScrollToResultsRef = useRef(false);
  const paymentTabRef = useRef<Window | null>(null);
  const paymentRequestInFlightRef = useRef(false);
  const paymentIdentityRef = useRef<Identity | null>(null);
  const finalizingCheckoutRef = useRef("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchReady(true);

      const params = new URLSearchParams(window.location.search);
      if (params.get("payment") !== "success") return;

      setPaymentReturn({
        plate: params.get("plate") ?? "",
        accessRestored: params.get("restored") === "1",
        remaining: Math.max(0, Number(params.get("remaining") ?? 0) || 0),
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const payableFines = useMemo(
    () => result?.fines.filter((fine) => fine.payable) ?? [],
    [result],
  );
  const selectedFines = useMemo(
    () => payableFines.filter((fine) => selectedFineIds.includes(fine.id)),
    [payableFines, selectedFineIds],
  );
  const selectedTotal = useMemo(
    () => selectedFines.reduce((sum, fine) => sum + fine.amount, 0),
    [selectedFines],
  );
  const allPayableSelected =
    payableFines.length > 0 && selectedFines.length === payableFines.length;

  function toggleFine(fineId: number, checked: boolean) {
    setSelectedFineIds((current) =>
      checked
        ? [...new Set([...current, fineId])]
        : current.filter((id) => id !== fineId),
    );
  }

  function toggleAllFines(checked: boolean) {
    setSelectedFineIds(
      checked ? payableFines.map((fine) => fine.id) : [],
    );
  }

  const runSearch = useCallback(
    async (overridePlate?: string) => {
      const query = (overridePlate ?? plate).trim();
      if (!query) {
        if (!overridePlate) shouldScrollToResultsRef.current = false;
        setSearchError("Введите государственный номер автомобиля.");
        return;
      }
      setSearching(true);
      setSearchError("");
      if (!overridePlate) {
        if (paymentTabRef.current && !paymentTabRef.current.closed) {
          paymentTabRef.current.close();
        }
        paymentTabRef.current = null;
        paymentIdentityRef.current = null;
        finalizingCheckoutRef.current = "";
        setPaymentState("idle");
        setCheckoutToken("");
        setPaymentUrl("");
      }
      if (isLocalDemoMode()) {
        const demoResult = createDemoResult(query.toUpperCase());
        setResult(demoResult);
        setPlate(demoResult.plate);
        setSelectedFineIds(demoResult.fines.map((fine) => fine.id));
        setSearching(false);
        return;
      }
      try {
        const response = await fetch(
          `/api/fines?plate=${encodeURIComponent(query)}`,
          {
            cache: "no-store",
            signal: AbortSignal.timeout(20_000),
          },
        );
        const payload = (await response.json()) as SearchResult & {
          error?: string;
        };
        if (!response.ok) {
          throw new Error(userMessage(payload, "Не удалось выполнить поиск."));
        }
        setResult(payload);
        setPlate(payload.plate);
        setSelectedFineIds(
          payload.fines.filter((fine) => fine.payable).map((fine) => fine.id),
        );
      } catch (error) {
        if (!overridePlate) {
          shouldScrollToResultsRef.current = false;
          setResult(null);
          setSelectedFineIds([]);
        }
        setSearchError(
          error instanceof Error
            ? error.message
            : "Не удалось выполнить поиск.",
        );
      } finally {
        setSearching(false);
      }
    },
    [plate],
  );

  const startPaymentFinalization = useCallback((token: string) => {
    const submittedIdentity = paymentIdentityRef.current;
    if (!submittedIdentity || finalizingCheckoutRef.current === token) return;

    finalizingCheckoutRef.current = token;
    paymentIdentityRef.current = null;
    const send = async () => {
      const retryDelays = [0, 2_000, 5_000, 10_000, 20_000];
      for (const delay of retryDelays) {
        if (delay) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, delay));
        }
        try {
          const response = await fetch("/api/payment/finalize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            keepalive: true,
            body: JSON.stringify({
              checkoutToken: token,
              firstName: submittedIdentity.firstName,
              lastName: submittedIdentity.lastName,
              phone: submittedIdentity.phone,
              email: submittedIdentity.email,
            }),
          });
          if (response.ok) return;
        } catch {
          // Повторяем только фоновую привязку и отправку уведомлений.
        }
      }
      finalizingCheckoutRef.current = "";
      paymentIdentityRef.current = submittedIdentity;
    };
    void send();
  }, []);

  useEffect(() => {
    if (!result || !shouldScrollToResultsRef.current) return;

    shouldScrollToResultsRef.current = false;
    const frame = window.requestAnimationFrame(() => {
      resultsSectionRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [result]);

  useEffect(() => {
    if (!modalOpen) return;
    modalCloseRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !creatingPayment) setModalOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [creatingPayment, modalOpen]);

  useEffect(() => {
    if (!checkoutToken || paymentState !== "waiting") return;
    let cancelled = false;
    let checking = false;
    const check = async () => {
      if (cancelled || checking) return;
      checking = true;
      try {
        const response = await fetch("/api/payment/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ checkoutToken }),
        });
        const payload = (await response.json()) as {
          paid?: boolean;
        };
        if (!response.ok || !payload.paid || cancelled) return;
        const remaining = Math.max(
          0,
          (result?.outstandingCount ?? selectedFineIds.length) -
            selectedFineIds.length,
        );
        const accessRestored = remaining === 0;
        void (async () => {
          for (let attempt = 0; attempt < 6; attempt += 1) {
            if (attempt > 0) {
              await new Promise((resolve) =>
                window.setTimeout(resolve, Math.min(2_000 * attempt, 8_000)),
              );
            }
            try {
              const reconcileResponse = await fetch("/api/payment/status", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ checkoutToken, reconcile: true }),
                keepalive: true,
              });
              if (reconcileResponse.ok) return;
            } catch {
              // Краткий сбой Bitrix/VibeCode: повторяем фоновую сверку.
            }
          }
        })();
        const returnUrl = new URL("/", window.location.origin);
        returnUrl.searchParams.set("payment", "success");
        if (result?.plate) {
          returnUrl.searchParams.set("plate", result.plate);
        }
        returnUrl.searchParams.set("restored", accessRestored ? "1" : "0");
        returnUrl.searchParams.set("remaining", String(remaining));
        if (!navigatePaymentWindow(paymentTabRef.current, returnUrl.toString())) {
          window.open(returnUrl.toString(), FINE_PAYMENT_WINDOW_NAME);
        }
        paymentTabRef.current = null;
        setRemainingAfterPayment(remaining);
        setPaymentState(accessRestored ? "restored" : "paid");
        if (result?.plate) void runSearch(result.plate);
      } catch {
        // Следующая фоновая проверка повторит запрос.
      } finally {
        checking = false;
      }
    };
    void check();
    const timer = window.setInterval(check, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    checkoutToken,
    paymentState,
    result?.outstandingCount,
    result?.plate,
    runSearch,
    selectedFineIds.length,
  ]);

  useEffect(() => {
    if (!checkoutToken || paymentState !== "waiting" || paymentUrl) return;
    let cancelled = false;
    let checkingLink = false;
    const expiresAt = Date.now() + 120_000;
    let timer = 0;

    const stopWithError = () => {
      if (cancelled) return;
      cancelled = true;
      window.clearInterval(timer);
      if (paymentTabRef.current && !paymentTabRef.current.closed) {
        paymentTabRef.current.close();
      }
      paymentTabRef.current = null;
      setCheckoutToken("");
      setPaymentState("idle");
      setPaymentError(
        "Битрикс24 не сформировал ссылку вовремя. Нажмите «Оплатить выбранные» ещё раз — существующий платёж будет использован повторно.",
      );
    };

    const check = async () => {
      if (cancelled || checkingLink) return;
      if (Date.now() >= expiresAt) {
        stopWithError();
        return;
      }
      checkingLink = true;
      try {
        const response = await fetch("/api/payment/link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ checkoutToken }),
        });
        const payload = (await response.json()) as {
          ready?: boolean;
          paymentUrl?: string;
        };
        if (
          cancelled ||
          !response.ok ||
          !payload.ready ||
          !payload.paymentUrl
        ) {
          return;
        }
        setPaymentUrl(payload.paymentUrl);
        if (paymentTabRef.current && !paymentTabRef.current.closed) {
          navigatePaymentWindow(paymentTabRef.current, payload.paymentUrl);
        }
        startPaymentFinalization(checkoutToken);
      } catch {
        // Робот Битрикс24 может закончить работу при следующей проверке.
      } finally {
        checkingLink = false;
      }
    };
    void check();
    timer = window.setInterval(check, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [checkoutToken, paymentState, paymentUrl, startPaymentFinalization]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    shouldScrollToResultsRef.current = true;
    void runSearch();
  }

  function openPreparedPayment() {
    if (!paymentUrl) return;
    const paymentWindow = window.open(paymentUrl, FINE_PAYMENT_WINDOW_NAME);
    if (!paymentWindow) {
      setPaymentError(
        "Браузер заблокировал платёжное окно. Разрешите всплывающие окна и попробуйте ещё раз.",
      );
      return;
    }
    paymentTabRef.current = paymentWindow;
  }

  async function createPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (paymentRequestInFlightRef.current) return;
    if (
      !result?.accessToken ||
      !identity.consent ||
      selectedFines.length === 0
    ) {
      return;
    }

    if (isLocalDemoMode()) {
      setPaymentError("");
      setRemainingAfterPayment(
        Math.max(0, payableFines.length - selectedFines.length),
      );
      setPaymentState(
        selectedFines.length === payableFines.length ? "restored" : "paid",
      );
      setModalOpen(false);
      setIdentity(emptyIdentity);
      return;
    }

    paymentRequestInFlightRef.current = true;
    const submittedIdentity = { ...identity };
    const preparedTab = openPreparedPaymentWindow();
    paymentTabRef.current = preparedTab;

    setCreatingPayment(true);
    setPaymentError("");
    try {
      const response = await fetch("/api/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...submittedIdentity,
          plate: result.plate,
          itemIds: selectedFines.map((fine) => fine.id),
          accessToken: result.accessToken,
        }),
      });
      const payload = (await response.json()) as {
        paymentUrl?: string;
        checkoutToken?: string;
        pending?: boolean;
        error?: string;
      };
      if (!response.ok || !payload.checkoutToken) {
        throw new Error(
          userMessage(payload, "Не удалось подготовить оплату."),
        );
      }
      paymentIdentityRef.current = submittedIdentity;
      if (payload.paymentUrl) {
        navigatePaymentWindow(preparedTab, payload.paymentUrl);
        startPaymentFinalization(payload.checkoutToken);
      }
      setPaymentUrl(payload.paymentUrl ?? "");
      setCheckoutToken(payload.checkoutToken);
      setPaymentState("waiting");
      setModalOpen(false);
      setIdentity(emptyIdentity);
    } catch (error) {
      if (preparedTab && !preparedTab.closed) preparedTab.close();
      if (paymentTabRef.current === preparedTab) paymentTabRef.current = null;
      paymentIdentityRef.current = null;
      finalizingCheckoutRef.current = "";
      setPaymentError(
        error instanceof Error
          ? error.message
          : "Не удалось подготовить оплату.",
      );
    } finally {
      paymentRequestInFlightRef.current = false;
      setCreatingPayment(false);
    }
  }

  if (paymentReturn) {
    return (
      <main className="page-shell payment-return-page">
        <div className="ambient ambient-one" aria-hidden="true" />
        <div className="ambient ambient-two" aria-hidden="true" />
        <header className="site-header">
          <Link className="brand" href="/" aria-label="Лужники — к началу страницы">
            <img
              className="brand-logo"
              src="/brand/luzhniki-logo.png"
              alt="Лужники"
            />
            <span className="brand-service">Сервис оплаты нарушений</span>
          </Link>
        </header>
        <section className="payment-return-card" aria-live="polite">
          <div className="payment-return-icon" aria-hidden="true">✓</div>
          <p className="eyebrow">Оплата подтверждена</p>
          <h1>
            {paymentReturn.accessRestored
              ? "Доступ восстановлен"
              : "Штраф оплачен"}
          </h1>
          {paymentReturn.plate && (
            <p className="payment-return-plate">Госномер: {paymentReturn.plate}</p>
          )}
          <p className="payment-return-copy">
            {paymentReturn.accessRestored
              ? "Все нарушения автомобиля оплачены. Ограничение на въезд снято."
              : `Платёж принят. Осталось неоплаченных нарушений: ${paymentReturn.remaining}.`}
          </p>
          <Link className="primary-button payment-return-link" href="/">
            Проверить другой автомобиль <span aria-hidden="true">→</span>
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />

      <header className="site-header">
        <a className="brand" href="#top" aria-label="Лужники — к началу страницы">
          <img
            className="brand-logo"
            src="/brand/luzhniki-logo.png"
            alt="Лужники"
          />
          <span className="brand-service">Сервис оплаты нарушений</span>
        </a>
      </header>

      <section className="hero" aria-labelledby="page-title" id="top">
        <div className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">Онлайн-сервис для водителей</p>
            <h1 id="page-title">
              Проверьте автомобиль <em>на наличие нарушений</em>
            </h1>
            <p className="hero-lead">
              Введите государственный номер автомобиля, чтобы увидеть
              зафиксированные нарушения, материалы и сумму к оплате.
            </p>

            <div className="trust-row" aria-label="Особенности сервиса">
              <span><i aria-hidden="true">✓</i> Защищённое соединение</span>
              <span><i aria-hidden="true">✓</i> Оплата картами всех банков РФ</span>
            </div>
          </div>

          <aside className="search-card" aria-label="Проверка автомобиля">
            <p className="search-card-kicker">Проверка ограничений</p>
            <h2>Введите госномер</h2>
            <p className="search-card-copy">
              Покажем все нарушения, которые необходимо оплатить для
              восстановления въезда.
            </p>

            <form
              className="plate-search"
              action="/"
              method="get"
              noValidate
              onSubmit={submitSearch}
            >
              <label htmlFor="plate">Государственный номер</label>
              <div className="plate-search-row">
                <div className="plate-input-wrap">
                  <input
                    id="plate"
                    name="plate"
                    value={plate}
                    onChange={(event) => setPlate(event.target.value.toUpperCase())}
                    placeholder="А000АА77"
                    autoComplete="off"
                    autoCapitalize="characters"
                    enterKeyHint="search"
                    inputMode="text"
                    spellCheck={false}
                    maxLength={12}
                    aria-describedby={searchError ? "search-error" : undefined}
                  />
                  <span className="plate-country" aria-hidden="true">RUS</span>
                </div>
                <button
                  type="button"
                  className="primary-button"
                  disabled={searching || !searchReady}
                  onClick={() => {
                    shouldScrollToResultsRef.current = true;
                    void runSearch();
                  }}
                >
                  {!searchReady
                    ? "Загрузка…"
                    : searching
                      ? "Проверяем…"
                      : "Проверить"}
                  <span aria-hidden="true">→</span>
                </button>
              </div>
              {searchError && (
                <p className="form-error" id="search-error" role="alert">
                  {searchError}
                </p>
              )}
            </form>

            <p className="search-card-note">
              Въезд будет разрешён после погашения всех штрафов по автомобилю.
            </p>
          </aside>
        </div>
      </section>

      {result && (
        <section
          ref={resultsSectionRef}
          className="results-section"
          aria-live="polite"
        >
          {result.fines.length === 0 ? (
            <div className="clear-state">
              <span className="clear-icon" aria-hidden="true">✓</span>
              <div>
                <p className="eyebrow">Госномер {result.plate}</p>
                <h2>
                  {result.accessRestored
                    ? "Все штрафы оплачены"
                    : "Ограничений не найдено"}
                </h2>
                <p>
                  По этому автомобилю нет неоплаченных нарушений в воронке
                  пропускного режима.
                </p>
              </div>
            </div>
          ) : (
            <>
              <header className="results-header">
                <div>
                  <p className="eyebrow">Результат проверки · {result.plate}</p>
                  <h2>Найдено нарушений: <span>{result.outstandingCount}</span></h2>
                </div>
                <div className="total-card">
                  <span>Всего к оплате</span>
                  <strong>{money.format(result.total)}</strong>
                </div>
              </header>

              {paymentState === "waiting" && (
                <div className="payment-banner waiting" role="status">
                  <span className="pulse-dot" aria-hidden="true" />
                  <div>
                    <strong>Ожидаем подтверждение оплаты</strong>
                    <p>
                      {paymentUrl
                        ? "Ссылка готова и отправлена по SMS. Статус оплаты проверяется автоматически."
                        : "Битрикс24 формирует платёжную ссылку. Она появится здесь и будет отправлена по SMS."}
                    </p>
                  </div>
                  {paymentUrl && (
                    <button
                      type="button"
                      onClick={openPreparedPayment}
                    >
                      Перейти к оплате
                    </button>
                  )}
                </div>
              )}

              {paymentError && !modalOpen && paymentState === "idle" && (
                <div className="payment-banner error" role="alert">
                  <span aria-hidden="true">!</span>
                  <div>
                    <strong>Платёжная ссылка не открылась</strong>
                    <p>{paymentError}</p>
                  </div>
                </div>
              )}

              {(paymentState === "paid" || paymentState === "restored") && (
                <div className="payment-banner success" role="status">
                  <span aria-hidden="true">✓</span>
                  <div>
                    <strong>
                      {paymentState === "restored"
                        ? "Оплата принята — доступ восстановлен"
                        : "Оплата принята"}
                    </strong>
                    <p>
                      {paymentState === "restored"
                        ? "Все карточки автомобиля перенесены в статус «Оплатил штраф»."
                        : `Осталось неоплаченных нарушений: ${remainingAfterPayment}.`}
                    </p>
                  </div>
                </div>
              )}

              {payableFines.length > 0 && (
                <div className="selection-toolbar">
                  <label className="select-all">
                    <input
                      type="checkbox"
                      checked={allPayableSelected}
                      onChange={(event) =>
                        toggleAllFines(event.target.checked)
                      }
                      disabled={paymentState === "waiting"}
                    />
                    <span>Выбрать все штрафы</span>
                  </label>
                  <span>
                    Выбрано: {selectedFines.length} из {payableFines.length}
                  </span>
                </div>
              )}

              <div className="fine-list">
                {result.fines.map((fine) => (
                  <article
                    className={`fine-card${
                      selectedFineIds.includes(fine.id) ? " selected" : ""
                    }`}
                    key={fine.id}
                  >
                    <header className="fine-card-header">
                      <div className="fine-identification">
                        <div className="fine-plate-block">
                          <span>Госномер автомобиля</span>
                          <strong>{fine.plate}</strong>
                        </div>
                        <div className="fine-product-block">
                          <span>Название штрафа</span>
                          <h3>{fine.productName}</h3>
                        </div>
                      </div>
                      <div className="fine-card-actions">
                        {fine.payable && (
                          <label className="fine-selector">
                            <input
                              type="checkbox"
                              checked={selectedFineIds.includes(fine.id)}
                              onChange={(event) =>
                                toggleFine(fine.id, event.target.checked)
                              }
                              disabled={paymentState === "waiting"}
                              aria-label={`Выбрать штраф №${fine.id} для оплаты`}
                            />
                            <span>
                              {selectedFineIds.includes(fine.id)
                                ? "Выбран"
                                : "Выбрать"}
                            </span>
                          </label>
                        )}
                      </div>
                    </header>

                    <dl className="fine-facts fine-facts-single">
                      <div>
                        <dt>Дата и время нарушения</dt>
                        <dd>{formatDate(fine.occurredAt)}</dd>
                      </div>
                    </dl>

                    {(fine.photos.length > 0 || fine.videos.length > 0) && (
                      <div className="evidence">
                        <p>Фото и видео нарушения</p>
                        <div className="evidence-grid">
                          {fine.photos.map((photo) => (
                            <EvidencePreview
                              evidence={photo}
                              fineId={fine.id}
                              key={`photo-${photo.id}`}
                            />
                          ))}
                          {fine.videos.map((video) => (
                            <VideoEvidence
                              evidence={video}
                              fineId={fine.id}
                              key={`video-${video.id}`}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </article>
                ))}
              </div>

              {payableFines.length > 0 && (
                <div className="checkout-bar">
                  <div>
                    <span>
                      Выбрано: {selectedFines.length}{" "}
                      {selectedFines.length === 1 ? "нарушение" : "нарушения"}
                    </span>
                    <strong>{money.format(selectedTotal)}</strong>
                  </div>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => {
                      setPaymentError("");
                      setModalOpen(true);
                    }}
                    disabled={
                      paymentState === "waiting" || selectedFines.length === 0
                    }
                  >
                    {allPayableSelected
                      ? "Оплатить все штрафы"
                      : "Оплатить выбранные"}
                    <span aria-hidden="true">→</span>
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}

      <footer>
        <a className="footer-brand" href="#top" aria-label="Лужники — к началу страницы">
          <img src="/brand/luzhniki-logo.png" alt="Лужники" />
        </a>
      </footer>

      <LegalNotice />

      {modalOpen && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="identity-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="identity-title"
          >
            <header>
              <div>
                <p className="eyebrow">Перед оплатой</p>
                <h2 id="identity-title">Контактные данные водителя</h2>
              </div>
              <button
                ref={modalCloseRef}
                className="modal-close"
                type="button"
                aria-label="Закрыть"
                onClick={() => setModalOpen(false)}
                disabled={creatingPayment}
              >
                ×
              </button>
            </header>

            <p className="modal-intro">
              Создадим карточку клиента и привяжем её к выбранным нарушениям{" "}
              <strong>{result?.plate}</strong>. Сотрудник этих данных не знает до
              вашего ввода.
            </p>

            <form onSubmit={createPayment}>
              <div className="field-grid">
                <label>
                  Имя
                  <input
                    required
                    minLength={2}
                    autoComplete="given-name"
                    value={identity.firstName}
                    onChange={(event) =>
                      setIdentity({ ...identity, firstName: event.target.value })
                    }
                  />
                </label>
                <label>
                  Фамилия
                  <input
                    required
                    minLength={2}
                    autoComplete="family-name"
                    value={identity.lastName}
                    onChange={(event) =>
                      setIdentity({ ...identity, lastName: event.target.value })
                    }
                  />
                </label>
                <label>
                  Телефон
                  <input
                    required
                    type="tel"
                    autoComplete="tel"
                    inputMode="tel"
                    maxLength={17}
                    placeholder="+7 900 000-00-00"
                    aria-describedby="phone-format-hint"
                    value={identity.phone}
                    onChange={(event) =>
                      setIdentity((current) => ({
                        ...current,
                        phone: formatRussianPhoneInput(event.target.value),
                      }))
                    }
                  />
                  <small id="phone-format-hint" className="field-hint">
                    Можно вводить с 7, 8 или +7 — пробелы, скобки и дефисы
                    допустимы
                  </small>
                </label>
                <label>
                  Email
                  <input
                    required
                    type="email"
                    autoComplete="email"
                    placeholder="name@example.ru"
                    value={identity.email}
                    onChange={(event) =>
                      setIdentity({ ...identity, email: event.target.value })
                    }
                  />
                </label>
              </div>

              <label className="consent">
                <input
                  required
                  type="checkbox"
                  checked={identity.consent}
                  onChange={(event) =>
                    setIdentity({ ...identity, consent: event.target.checked })
                  }
                />
                <span>
                  Согласен на обработку данных для создания клиента и проведения
                  оплаты. Ознакомлен с{" "}
                  <a
                    href="/privacy"
                    target="_blank"
                    rel="noreferrer"
                    onClick={(event) => event.stopPropagation()}
                  >
                    политикой конфиденциальности
                  </a>
                </span>
              </label>

              <div className="modal-summary">
                <span>
                  Итого к оплате · {selectedFines.length}{" "}
                  {selectedFines.length === 1 ? "штраф" : "штрафа"}
                </span>
                <strong>{money.format(selectedTotal)}</strong>
              </div>
              {paymentError && (
                <p className="form-error" role="alert">{paymentError}</p>
              )}
              <button
                className="primary-button modal-submit"
                disabled={
                  creatingPayment ||
                  !identity.consent ||
                  selectedFines.length === 0
                }
              >
                {creatingPayment ? "Готовим ссылку…" : "Перейти к оплате"}
                <span aria-hidden="true">→</span>
              </button>
              <p className="delivery-note">
                Платёжная страница откроется сразу. Ссылка также может быть
                отправлена средствами Битрикс24.
              </p>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
