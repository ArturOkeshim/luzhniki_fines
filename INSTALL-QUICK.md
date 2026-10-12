# Быстрая установка полной версии V54.2

Архив содержит полный сайт штрафов, серверные обработчики и рабочий `.env` с
ключами. Это приватный пакет для чистой установки, а не патч.

## 1. Распаковать и проверить

```bash
cd /root
sha256sum LUZHNIKI-FINES-SERVER-V54.2-FULL-2026-10-12.zip
unzip -n LUZHNIKI-FINES-SERVER-V54.2-FULL-2026-10-12.zip -d /root
cd /root/LUZHNIKI-FINES-SERVER-V54.2-FULL
sha256sum -c SHA256SUMS.txt
bash 00-check-read-only.sh
```

Хеш первой команды должен совпасть с файлом
`LUZHNIKI-FINES-SERVER-V54.2-FULL-2026-10-12.zip.sha256.txt`.

## 2. Установить сайт

```bash
cd /root/LUZHNIKI-FINES-SERVER-V54.2-FULL
bash 01-install-fresh.sh
bash 02-status-read-only.sh
```

Установщик остановится без изменений, если обнаружит уже существующий целевой
каталог. Существующую установку сначала сохраните отдельно.

## 3. Установить защитный обработчик Bitrix

```bash
cd /root/LUZHNIKI-FINES-SERVER-V54.2-FULL/server/bitrix
bash 00-check-read-only.sh
bash 01-install-handler.sh
bash 02-status-read-only.sh
```

## 4. Проверить после установки

Проведите одну оплату на 10 рублей и убедитесь, что:

1. Оплата открывается без долгого зависания.
2. После оплаты сайт показывает собственную страницу подтверждения.
3. Штраф автоматически уходит в воронку «Оплата штрафов».
4. В заказе заполнены email и телефон клиента.
5. В сделке сразу указан заполненный контакт клиента.
6. Создан ровно один чек, а письмо ОФД приходит на email клиента.

Расширенная инструкция и диагностика находятся в `INSTALL-FROM-SCRATCH.md` и
`README-FIRST.md`.
