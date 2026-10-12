import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("contains the finished Russian service and metadata", async () => {
  const [client, layout, page, privacy, legal, legalNotice, styles] = await Promise.all([
    readFile(new URL("../app/FinesPortal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/privacy/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/legal/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/LegalNotice.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /<html lang="ru"/i);
  assert.match(layout, /Проверка ограничений на въезд · Лужники/i);
  assert.match(layout, /\/og\.png/);
  assert.match(client, /Проверьте автомобиль/);
  assert.match(client, /\/brand\/luzhniki-logo\.png/);
  assert.match(client, /Государственный номер/);
  assert.match(client, /enterKeyHint="search"/);
  assert.match(client, /type="button"/);
  assert.match(client, /event\.stopPropagation\(\)/);
  assert.match(client, /setSearchReady\(true\)/);
  assert.match(client, /AbortSignal\.timeout\(20_000\)/);
  assert.match(client, /Оплатить все штрафы/);
  assert.match(client, /Оплата картами всех банков РФ/);
  assert.doesNotMatch(client, /Оплата через Битрикс24/);
  assert.doesNotMatch(client, /Один госномер — единая проверка/);
  assert.doesNotMatch(client, /Как это работает/);
  assert.match(client, /href="\/privacy"/);
  assert.match(legalNotice, /Политика обработки персональных данных/);
  assert.match(privacy, /<h1>Политика обработки персональных данных<\/h1>/);
  assert.match(privacy, /Политика в отношении обработки персональных данных/);
  assert.match(privacy, /12\. Заключительные положения/);
  assert.match(privacy, /adminluzh@luzhniki\.ru/);
  assert.match(legalNotice, /https:\/\/www\.luzhniki\.ru\/documents\/421\//);
  assert.match(client, /<LegalNotice \/>/);
  assert.match(privacy, /<LegalNotice \/>/);
  assert.match(legal, /Реквизиты и контакты/);
  assert.match(legal, /callcenter@luzhniki\.ru/);
  assert.match(legalNotice, /ОГРН 1027700111120/);
  assert.match(legalNotice, /КПП 770401001/);
  assert.match(legalNotice, /href="\/legal"/);
  assert.match(page, /<FinesPortal \/>/);
  assert.match(styles, /\.hero-lead,\s*\.trust-row\s*{\s*display: none;/);
  assert.match(styles, /font-size: clamp\(34px, 9\.8vw, 44px\)/);
  assert.match(styles, /padding-block: 20px 28px/);
  assert.match(styles, /overflow-wrap: anywhere/);
  assert.match(styles, /@media \(max-width: 360px\)/);
  assert.match(styles, /\.privacy-header \.brand-logo\s*{\s*width: 148px;/);
  assert.doesNotMatch(
    `${client}\n${layout}\n${page}`,
    /codex-preview|SkeletonPreview|Starter Project/,
  );
});

test("keeps credentials server-side and removes starter preview", async () => {
  const [
    client,
    bitrix,
    config,
    fines,
    finesApi,
    workflow,
    evidenceFolders,
    evidence,
    payment,
    paymentContact,
    paymentLink,
    paymentFinalize,
    paymentStatus,
    worker,
    imageStream,
  ] =
    await Promise.all([
      readFile(new URL("../app/FinesPortal.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/lib/bitrix.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/lib/config.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/lib/fines.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/fines/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/lib/workflow.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../app/lib/evidence-folders.ts", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../app/api/evidence/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/payment/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/lib/payment-contact.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../app/api/payment/link/route.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/api/payment/finalize/route.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/api/payment/status/route.ts", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/lib/image-stream.ts", import.meta.url), "utf8"),
    ]);

  assert.doesNotMatch(client, /VIBECODE_API_KEY|urlMachine/);
  assert.match(config, /requiredRuntimeValue/);
  assert.match(config, /crm\.luzhniki\.ru/);
  assert.match(fines, /ALLOWED_FINE_AMOUNTS = \[10, 5000, 10000, 25000\]/);
  assert.match(fines, /583: 5000/);
  assert.match(fines, /584: 10000/);
  assert.match(fines, /585: 25000/);
  assert.match(fines, /586: 10/);
  assert.match(fines, /comment: "ufCrm18_1785332296250"/);
  assert.match(fines, /materials: "ufCrm18_1785752541701"/);
  assert.match(fines, /getFineProductName/);
  assert.match(fines, /listFineItemsByPlate/);
  assert.match(fines, /filter\[categoryId\]/);
  assert.match(fines, /filter\[\$\{FIELDS\.plate\}\]/);
  assert.match(fines, /query\.set\("limit", "100"\)/);
  assert.match(fines, /UNKNOWN_FILTER_FIELD/);
  assert.match(fines, /FINE_LIST_VIBECODE_FALLBACK/);
  assert.match(fines, /"crm\.item\.list"/);
  assert.match(fines, /\/products`/);
  assert.match(fines, /row\.productName/);
  assert.match(fines, /allEvidenceFiles/);
  assert.match(fines, /fileNameFromUrl/);
  assert.match(fines, /typeof record\.url === "string"/);
  assert.match(fines, /\.\.\.materials/);
  assert.match(fines, /FIELDS\.photo\), "photo"/);
  assert.match(fines, /FIELDS\.video\), "video"/);
  assert.match(fines, /return file\.kindHint \?\? "unknown"/);
  assert.match(fines, /export function evidenceType/);
  assert.match(fines, /IMAGE_EXTENSIONS/);
  assert.match(fines, /hydrateEvidenceFile/);
  assert.match(fines, /VIDEO_EXTENSIONS/);
  assert.match(fines, /contentType\?\.startsWith\("video\/"\)/);
  assert.match(fines, /method: "HEAD"/);
  assert.match(fines, /Range: "bytes=0-0"/);
  assert.match(fines, /AbortSignal\.timeout\(8_000\)/);
  assert.match(fines, /content-disposition/);
  assert.doesNotMatch(fines, /v1\/files\/\$\{file\.id\}/);
  assert.match(
    finesApi,
    /productName: textField\(productName, `Штраф №\$\{id\}`\)/,
  );
  assert.match(finesApi, /getFineProductName\(id\)\.catch/);
  assert.doesNotMatch(finesApi, /getFineItem\(Number\(item\.id\)\)/);
  assert.match(fines, /FINE_PRODUCT_CACHE_TTL_MS/);
  assert.match(fines, /__luzhnikiFineProductCache/);
  assert.doesNotMatch(finesApi, /ensureEvidenceFolder/);
  assert.match(finesApi, /await Promise\.all\(items\.map\(async \(item\)/);
  assert.match(finesApi, /listFineItemsByPlate\(plate\)/);
  assert.doesNotMatch(finesApi, /listFineCategoryItems/);
  assert.match(finesApi, /evidenceKind\(file\) === "video"/);
  assert.match(finesApi, /probeVideoUrl/);
  assert.match(finesApi, /previewUrl/);
  assert.match(finesApi, /evidenceType\(file\) === "unknown"/);
  assert.doesNotMatch(finesApi, /allEvidenceFiles\(item\)\.map\(hydrateEvidenceFile\)/);
  assert.match(client, /function EvidencePreview/);
  assert.match(client, /Госномер автомобиля/);
  assert.match(client, /Название штрафа/);
  assert.match(client, /Фото и видео нарушения/);
  assert.doesNotMatch(client, /<dt>Место нарушения<\/dt>/);
  assert.doesNotMatch(client, /<p>Комментарий по штрафу<\/p>/);
  assert.match(client, /import\("heic-to\/csp"\)/);
  assert.match(client, /isHeic\(sourceFile\)/);
  assert.match(client, /quality: 0\.62/);
  assert.match(client, /image\\\/\(\?:avif\|gif\|jpeg\|png\|webp\)/);
  assert.match(client, /Файл обрабатывается на устройстве/);
  assert.match(client, /AbortSignal\.timeout\(15_000\)/);
  assert.match(client, /Скачать фото/);
  assert.match(client, /evidence-item evidence-card video preview/);
  assert.match(client, /evidence-item evidence-card photo preview/);
  assert.match(client, /className="evidence-card-footer"/);
  assert.match(client, /className="evidence-card-action"/);
  assert.match(client, /function EvidenceDownload/);
  assert.match(client, /Скачать файл ↓/);
  assert.match(client, /fine\.photos\.map/);
  assert.match(client, /fine\.videos\.map/);
  assert.match(client, /<video/);
  assert.match(client, /preload="metadata"/);
  assert.doesNotMatch(client, /controls/);
  assert.match(client, /selectedFineIds/);
  assert.match(client, /Выбрать все штрафы/);
  assert.match(client, /Оплатить выбранные/);
  assert.doesNotMatch(client, /Комментарий по штрафу/);
  assert.match(client, /itemIds: selectedFines\.map/);
  assert.doesNotMatch(fines, /DT1112_71:1|isPaidFineStage/);
  assert.match(workflow, /stageId: STAGES\.paidInFines/);
  assert.doesNotMatch(
    workflow,
    /categoryId: bitrixConfig\.paidCategoryId,[\s\S]*stageId: STAGES\.paidAtBuilding/,
  );
  assert.match(workflow, /confirmedPayments\.has\(paymentId\)/);
  assert.match(
    paymentStatus,
    /reconcilePlate\(checkout\.plate, items, \[\s*checkout\.paymentId/,
  );
  assert.doesNotMatch(paymentStatus, /stageId: STAGES\.paidInFines/);
  assert.match(finesApi, /reconciliation\.allPaid && reconciliation\.moved/);
  assert.match(fines, /item\.stageId !== STAGES\.paidAtBuilding/);
  assert.match(payment, /isAllowedFineAmount\(amount\)/);
  assert.match(payment, /const selected = outstanding\.filter/);
  assert.match(payment, /selected\.map\(amountFromItem\)/);
  assert.match(paymentFinalize, /\[FIELDS\.paymentUrl\]: paymentUrl/);
  assert.match(evidenceFolders, /B24_EVIDENCE_ROOT_FOLDER_ID/);
  assert.match(evidenceFolders, /\/v1\/files\/upload/);
  assert.match(payment, /PAYMENT_FLOW_ERROR/);
  assert.match(payment, /reference: `payment-\$\{paymentStep\}`/);
  assert.match(payment, /getPublicPaymentUrl/);
  assert.doesNotMatch(payment, /waitForRobotPaymentUrl/);
  assert.doesNotMatch(payment, /triggerPaymentRobot/);
  assert.match(payment, /paymentStep = "order"/);
  assert.match(payment, /access\.fineIds\.map\(\(id\) => getFineItem\(id\)\)/);
  assert.match(payment, /createFineBasket\(orderId, lines\)/);
  assert.match(payment, /setFineBuyer\(orderId, buyer\)/);
  assert.match(payment, /verifyFineOrder\(orderId, lines, total\)/);
  assert.match(bitrix, /salescenter\.payment\.getPublicUrl/);
  assert.match(bitrix, /crm\.orderentity\.list/);
  assert.match(bitrix, /crm\.item\.update/);
  assert.match(bitrix, /crm\.item\.get/);
  assert.match(bitrix, /currentCategoryId\s*===\s*bitrixConfig\.finePaymentsDealCategoryId/);
  assert.match(bitrix, /currentCategoryId\s*!==\s*0/);
  assert.match(bitrix, /entityTypeId:\s*2/);
  assert.match(bitrix, /finePaymentsDealCategoryId/);
  assert.match(payment, /moveOrderDealToFinePayments\(orderId\)/);
  assert.match(payment, /movePaymentDealToFinePayments\(existing\.paymentId\)/);
  assert.match(payment, /upsertPaymentContact\(contactIdentity\)/);
  assert.match(payment, /attachPaymentDealContact\(paymentId, contactId\)/);
  assert.match(
    payment,
    /attachPaymentDealContact\(existing\.paymentId, contactId\)/,
  );
  assert.match(paymentStatus, /movePaymentDealToFinePayments\(checkout\.paymentId\)/);
  assert.match(worker, /url\.pathname === "\/api\/evidence"/);
  assert.match(worker, /evidenceSource\(file\.machineUrl/);
  assert.match(worker, /headers: source\.headers/);
  assert.match(worker, /evidenceResponseHeaders/);
  assert.match(bitrix, /requiredRuntimeValue\("B24_WEBHOOK_URL"\)/);
  assert.match(bitrix, /AbortSignal\.timeout\(8_000\)/);
  assert.match(
    await readFile(new URL("../app/lib/vibecode.ts", import.meta.url), "utf8"),
    /AbortSignal\.timeout\(15_000\)/,
  );
  assert.match(paymentLink, /getPublicPaymentUrl\(checkout\.paymentId\)/);
  assert.doesNotMatch(paymentLink, /getFineItem|itemPaymentUrl|itemPaymentId/);
  assert.match(paymentLink, /ready: false/);
  assert.match(paymentLink, /ready: true, paymentUrl/);
  assert.doesNotMatch(paymentLink, /updateFineItem|stageId/);
  assert.doesNotMatch(paymentLink, /stageId: STAGES\.prohibited/);
  assert.match(paymentFinalize, /upsertPaymentContact/);
  assert.match(
    paymentFinalize,
    /attachPaymentDealContact\(checkout\.paymentId, contactId\)/,
  );
  assert.match(paymentFinalize, /isPaymentPaid\(checkout\.paymentId\)/);
  assert.match(paymentFinalize, /PAYMENT_FINALIZE_ERROR/);
  assert.match(paymentFinalize, /notificationsQueued/);
  assert.match(client, /\/api\/payment\/finalize/);
  assert.match(client, /keepalive: true/);
  assert.match(client, /startPaymentFinalization\(payload\.checkoutToken\)/);
  assert.match(client, /let checkingLink = false/);
  assert.match(client, /Date\.now\(\) \+ 120_000/);
  assert.match(client, /window\.setInterval\(check, 1000\)/);
  assert.match(paymentContact, /Promise\.all\(\[\s*findContact\("phone"/);
  assert.match(paymentContact, /crm\.duplicate\.findbycomm/);
  assert.match(paymentContact, /entity_type: "CONTACT"/);
  assert.doesNotMatch(paymentContact, /filter\[\$\{filter\}\]/);
  assert.match(paymentContact, /crm\.contact\.add/);
  assert.match(paymentContact, /crm\.contact\.update/);
  assert.match(
    paymentContact,
    /assertContactIdentity\(await getContact\(id\), identity\)/,
  );
  assert.match(paymentContact, /VALUE_TYPE: "OTHER"/);
  assert.match(bitrix, /crm\.deal\.update/);
  assert.match(bitrix, /crm\.deal\.get/);
  assert.match(bitrix, /CONTACT_ID: contactId/);
  assert.doesNotMatch(client, /about:blank/);
  assert.doesNotMatch(client, /window\.location\.assign/);
  assert.match(client, /function openPreparedPaymentWindow\(\)/);
  assert.match(
    client,
    /navigatePaymentWindow\(paymentTabRef\.current, payload\.paymentUrl\)/,
  );
  assert.doesNotMatch(
    client,
    /location\.replace\(payload\.paymentUrl\);\s*paymentTabRef\.current\s*=\s*null/,
  );
  assert.match(client, /window\.setInterval\(check, 2000\)/);
  assert.match(client, /reconcile: true/);
  assert.match(client, /keepalive: true/);
  assert.match(paymentStatus, /if \(!body\.reconcile\)/);
  assert.match(paymentStatus, /\{ paid: true \}/);
  assert.match(client, /returnUrl\.searchParams\.set\("payment", "success"\)/);
  assert.match(client, /navigatePaymentWindow\(paymentTabRef\.current, returnUrl\.toString\(\)\)/);
  assert.match(client, /params\.get\("payment"\) !== "success"/);
  assert.match(client, /className="payment-return-card"/);
  assert.match(client, /window\.open\(returnUrl\.toString\(\), FINE_PAYMENT_WINDOW_NAME\)/);
  assert.match(client, /function openPreparedPayment\(\)/);
  assert.match(client, /paymentTabRef\.current\s*=\s*paymentWindow/);
  assert.match(client, /onClick=\{openPreparedPayment\}/);
  assert.match(client, /if \(paymentRequestInFlightRef\.current\) return/);
  assert.match(client, /paymentRequestInFlightRef\.current = true/);
  assert.match(client, /paymentRequestInFlightRef\.current = false/);
  assert.match(evidence, /return redirectToBitrix\(source\.url\)/);
  assert.match(evidence, /await fetch\(source\.url/);
  assert.match(evidence, /sniffImageStream/);
  assert.doesNotMatch(evidence, /PHOTO_CHUNK_SIZE|arrayBuffer\(|imageBinding/);
  assert.match(evidence, /NextResponse\.redirect\(url, 307\)/);
  assert.match(worker, /url\.pathname === "\/api\/evidence"/);
  assert.match(worker, /verifyToken<FineAccessToken>/);
  assert.match(worker, /allEvidenceFiles\(item\)\.find/);
  assert.match(worker, /Location: source\.url\.toString\(\)/);
  assert.match(worker, /status: 307/);
  assert.doesNotMatch(worker, /arrayBuffer\(/);
  assert.match(imageStream, /bytes\[0\] === 0xff/);
  assert.match(imageStream, /return "image\/jpeg"/);
  assert.match(imageStream, /ReadableStream<Uint8Array>/);
  assert.doesNotMatch(imageStream, /arrayBuffer\(/);
  assert.match(paymentFinalize, /finalizeStep = "notifications"/);
  assert.match(paymentFinalize, /stageId: STAGES\.awaiting/);
  assert.match(paymentFinalize, /stageId: STAGES\.prohibited/);
  assert.match(paymentFinalize, /alreadyFinalized/);
  assert.doesNotMatch(
    `${bitrix}\n${config}\n${evidenceFolders}\n${payment}\n${paymentContact}\n${paymentLink}\n${paymentFinalize}`,
    /vibe_api_[A-Za-z0-9_-]+|\/rest\/\d+\/[A-Za-z0-9_-]+\//,
  );
  await assert.rejects(
    access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)),
  );
  await access(new URL("../public/og.png", import.meta.url));
  await access(new URL("../public/brand/luzhniki-logo.png", import.meta.url));
  await access(new URL("../public/brand/als-trigger-black.otf", import.meta.url));
  await access(new URL("../public/brand/als-pofo-bold.ttf", import.meta.url));
});

test("never uses the Bitrix system mailbox as a customer recipient", async () => {
  const [paymentContact, finePayment, fineFinalize, parkingOrder] =
    await Promise.all([
      readFile(new URL("../app/lib/payment-contact.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/payment/route.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../app/api/payment/finalize/route.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/api/parking-subscription/route.ts", import.meta.url),
        "utf8",
      ),
    ]);

  assert.match(paymentContact, /"adminluzh@luzhniki\.ru"/);
  assert.match(paymentContact, /isSuppressedNotificationEmail/);
  assert.match(finePayment, /isSuppressedNotificationEmail\(email\)/);
  assert.match(fineFinalize, /isSuppressedNotificationEmail\(email\)/);
  assert.match(parkingOrder, /isSuppressedNotificationEmail\(email\)/);
});
