import fs from 'node:fs';

try {
  for (const key of ['VIBECODE_API_KEY', 'B24_WEBHOOK_URL', 'APP_SESSION_SECRET']) {
    if (!process.env[key]?.trim()) throw new Error(`Не задан ${key}`);
  }
  if (process.env.APP_SESSION_SECRET.length < 32) throw new Error('Слишком короткий APP_SESSION_SECRET');
  if (fs.existsSync('.env.local')) throw new Error('В серверной сборке не должно быть .env.local');
  const ids = (process.env.B24_FINE_PRODUCT_IDS || '').split(',').map(Number).sort((a,b) => a-b);
  if (ids.join(',') !== '4651,4652,4653,4750') throw new Error('Разрешены только товары 4651, 4652, 4653, 4750');
  for (const key of ['FISCAL_GUARD_READ_ONLY', 'FISCAL_GUARD_LIVE_TEST_ONLY']) {
    if (process.env[key] !== 'N') throw new Error(`В серверной сборке ${key} должен быть N`);
  }
  console.log(JSON.stringify({ ok: true, mode: 'production-config', products: ids, tenRubleProductAllowed: true }));
} catch (e) {
  console.error(e instanceof Error ? e.message : 'Ошибка конфигурации');
  process.exitCode = 1;
}
