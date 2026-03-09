import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const HOST = '127.0.0.1';
const PORT = Number(process.env.QA_PORT || '5181');
const BASE_URL = `http://${HOST}:${PORT}`;
const outputDir = path.resolve(process.env.QA_OUTPUT_DIR || '../output/playwright/frontend-smoke');

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: 'inherit',
      shell: false,
      ...options,
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with ${code}`));
    });
  });
}

async function waitForServer(url, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function captureMetrics(page) {
  return page.evaluate(() => ({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    canScrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    canScrollY: document.documentElement.scrollHeight > document.documentElement.clientHeight,
  }));
}

async function runRaceChecks(page, results) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const OLD_ADDR = 'ZER0x1111111111111111111111111111111111111111';
  const NEW_ADDR = 'ZER0x2222222222222222222222222222222222222222';

  await page.route('**/api/network/health', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ backend_ok: true, rpc_ok: true, rpc_latency_ms: 1, checked_at_unix: 1773032000, detail: 'ok' }) });
  });

  await page.route('**/api/search/*', async (route) => {
    const url = new URL(route.request().url());
    const query = decodeURIComponent(url.pathname.split('/').pop() || '');
    if (query === 'slow-old') await sleep(1200);
    if (query === 'fast-new') await sleep(50);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ kind: 'address', primary_id: query, canonical_route: `/search/${query}`, value: { query } }),
    });
  });

  await page.route('**/api/accounts/*/blocks?*', async (route) => {
    const url = route.request().url();
    if (url.includes(OLD_ADDR)) await sleep(1200);
    if (url.includes(NEW_ADDR)) await sleep(50);
    const address = decodeURIComponent(url.split('/api/accounts/')[1].split('/blocks')[0]);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ address, page: 1, limit: 20, total_blocks: 0, items: [] }) });
  });

  await page.route('**/api/accounts/*/txs?*', async (route) => {
    const url = route.request().url();
    if (url.includes(OLD_ADDR)) await sleep(1200);
    if (url.includes(NEW_ADDR)) await sleep(50);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ page: 1, limit: 20, total: 0, has_more: false, items: [] }) });
  });

  await page.route('**/api/accounts/*', async (route) => {
    const url = route.request().url();
    if (url.includes('/blocks') || url.includes('/txs')) {
      await route.fallback();
      return;
    }
    if (url.includes(OLD_ADDR)) await sleep(1200);
    if (url.includes(NEW_ADDR)) await sleep(50);
    const address = decodeURIComponent(url.split('/api/accounts/')[1]);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ address, balance_hex: address === OLD_ADDR ? '0x1' : '0x2', nonce_hex: '0x0', tx_count_hex: '0x0', utxos: [] }),
    });
  });

  await page.route('**/api/blocks?**', async (route) => {
    const url = new URL(route.request().url());
    const pageNum = Number(url.searchParams.get('page') || '1');
    if (pageNum === 1) await sleep(1200);
    if (pageNum === 2) await sleep(50);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        latest_number: 99,
        page: pageNum,
        limit: 20,
        has_more: pageNum < 3,
        items: [{
          number: pageNum === 1 ? 101 : 202,
          number_hex: pageNum === 1 ? '0x65' : '0xca',
          hash: `0x${(pageNum === 1 ? '1' : '2').repeat(64)}`,
          parent_hash: `0x${'a'.repeat(64)}`,
          timestamp: 1773032000,
          difficulty: '0x1',
          nonce: 1,
          miner: 'ZER0x526Dc404e751C7d52F6fFF75d563d8D0857C94E9',
          tx_count: pageNum,
          extra_data: null,
        }],
      }),
    });
  });

  await page.route('**/api/blocks/*', async (route) => {
    const number = decodeURIComponent(route.request().url().split('/api/blocks/')[1]);
    if (number === '2') await sleep(1200);
    if (number === '9') await sleep(50);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ source: 'mock', block: {
        number: number === '2' ? '0x2' : '0x9',
        hash: `0x${number.repeat(64).slice(0, 64)}`,
        parent_hash: `0x${'b'.repeat(64)}`,
        coinbase: 'ZER0x526Dc404e751C7d52F6fFF75d563d8D0857C94E9',
        timestamp: 1773032000,
        difficulty: '0x1',
        nonce: 1,
      } }),
    });
  });

  await page.goto(`${BASE_URL}/search/slow-old`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input');
  await page.waitForTimeout(100);
  const searchInput = page.locator('input').first();
  await searchInput.fill('fast-new');
  await searchInput.press('Enter');
  await page.waitForURL('**/search/fast-new');
  await page.waitForTimeout(1600);
  const searchText = await page.locator('main').innerText();
  results.races.search = {
    ok: searchText.includes('Search: fast-new') && searchText.includes('fast-new') && !searchText.includes('slow-old'),
    snippet: searchText.slice(0, 400),
  };

  await page.goto(`${BASE_URL}/accounts/${OLD_ADDR}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(100);
  await page.evaluate((nextAddr) => {
    window.history.pushState({}, '', `/accounts/${nextAddr}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, NEW_ADDR);
  await page.waitForURL(`**/accounts/${NEW_ADDR}`);
  await page.waitForTimeout(1600);
  const accountText = await page.locator('main').innerText();
  results.races.account = {
    ok: accountText.includes(NEW_ADDR) && accountText.includes('0x2') && !accountText.includes(OLD_ADDR),
    snippet: accountText.slice(0, 500),
  };

  await page.goto(`${BASE_URL}/blocks`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(100);
  await page.getByRole('button', { name: 'Next' }).click();
  await page.waitForTimeout(1600);
  const blocksText = await page.locator('main').innerText();
  results.races.blocks = {
    ok: blocksText.includes('Page 2') && blocksText.includes('202') && !blocksText.includes('101'),
    snippet: blocksText.slice(0, 400),
  };

  await page.goto(`${BASE_URL}/blocks/2`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    window.history.pushState({}, '', '/blocks/9');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.waitForURL('**/blocks/9');
  await page.waitForTimeout(1600);
  const detailText = await page.locator('main').innerText();
  results.races.blockDetail = {
    ok: detailText.includes('Block #9') && detailText.includes('0x9') && !detailText.includes('Block #2'),
    snippet: detailText.slice(0, 400),
  };

  await page.unroute('**/api/search/*');
  await page.unroute('**/api/accounts/*/blocks?*');
  await page.unroute('**/api/accounts/*/txs?*');
  await page.unroute('**/api/accounts/*');
  await page.unroute('**/api/blocks?**');
  await page.unroute('**/api/blocks/*');
}

async function runDetailChecks(page, results) {
  const hash64 = (char) => `0x${char.repeat(64)}`;
  const miner = 'ZER0x526Dc404e751C7d52F6fFF75d563d8D0857C94E9';

  await page.route('**/api/network/health', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ backend_ok: true, rpc_ok: true, rpc_latency_ms: 1, checked_at_unix: 1773033000, detail: 'ok' }) });
  });
  await page.route('**/api/compute/*', async (route) => {
    const id = decodeURIComponent(route.request().url().split('/api/compute/')[1]);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ tx_id: id, result: { ok: true, submitted_at_unix: 1773033000, created_outputs: 1 } }) });
  });
  await page.route('**/api/tx/*', async (route) => {
    const id = decodeURIComponent(route.request().url().split('/api/tx/')[1]);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ tx_id: id, result: { ok: true, kind: 'transfer' } }) });
  });
  await page.route('**/api/objects/*', async (route) => {
    const id = decodeURIComponent(route.request().url().split('/api/objects/')[1]);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id, kind: 'Object', value: { owner: miner, state: '0x01' } }) });
  });
  await page.route('**/api/outputs/*', async (route) => {
    const id = decodeURIComponent(route.request().url().split('/api/outputs/')[1]);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id, kind: 'Output', value: { object_id: hash64('d'), amount: '0x64' } }) });
  });
  await page.route('**/api/domains/*', async (route) => {
    const id = decodeURIComponent(route.request().url().split('/api/domains/')[1]);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ domain_id: id, name: 'main', vm: 'wasm', public: true }) });
  });
  await page.route('**/api/txs/recent?**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ page: 1, limit: 20, total: 1, has_more: false, items: [{ tx_hash: hash64('a'), kind: 'transfer', from: miner, to: 'ZER0x1111111111111111111111111111111111111111', value: '0x64', timestamp: 1773033000, result: { ok: true } }] }) });
  });
  await page.route('**/api/miners?**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ latest_block: 9, lookback_blocks: 2000, unique_miners: 1, items: [{ address: miner, blocks_mined: 9, first_block: 1, last_block: 9, last_seen_unix: 1773033000, share_of_window: 0.9 }] }) });
  });
  await page.route('**/api/miners/*?**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ miner: { address: miner, blocks_mined: 9, first_block: 1, last_block: 9, last_seen_unix: 1773033000, share_of_window: 0.9 }, page: 1, limit: 20, total_blocks: 1, blocks: [{ number: 9, number_hex: '0x9', hash: hash64('9'), parent_hash: hash64('8'), timestamp: 1773033000, difficulty: '0x1', nonce: 1, miner, tx_count: 0, extra_data: null }] }) });
  });

  const checks = [
    { key: 'compute', url: `${BASE_URL}/compute/${hash64('c')}`, expect: ['Compute Tx Result', hash64('c')] },
    { key: 'tx', url: `${BASE_URL}/tx/${hash64('b')}`, expect: ['Tx', hash64('b')] },
    { key: 'object', url: `${BASE_URL}/objects/${hash64('e')}`, expect: ['Object (zero_getObject)', hash64('e')] },
    { key: 'output', url: `${BASE_URL}/outputs/${hash64('f')}`, expect: ['Output (zero_getOutput)', hash64('f')] },
    { key: 'domain', url: `${BASE_URL}/domains/7`, expect: ['Domain (zero_getDomain)', 'main'] },
    { key: 'txs', url: `${BASE_URL}/txs`, expect: ['Recent Transactions', 'transfer'] },
    { key: 'miners', url: `${BASE_URL}/miners`, expect: ['Miner Leaderboard', '90.00%', 'latest=9'] },
    { key: 'miner-detail', url: `${BASE_URL}/miners/${miner}`, expect: [`Miner ${miner}`, 'blocks_mined'] },
  ];

  for (const check of checks) {
    await page.goto(check.url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);
    const text = await page.locator('main').innerText();
    results.pages[check.key] = {
      ok: check.expect.every((item) => text.includes(item)),
      url: page.url(),
      snippet: text.slice(0, 800),
      metrics: await captureMetrics(page),
    };
    await page.screenshot({ path: path.join(outputDir, `${check.key}.png`), type: 'png' });
  }
}

async function main() {
  await ensureDir(outputDir);
  const results = {
    baseUrl: BASE_URL,
    races: {},
    pages: {},
    consoleErrors: [],
    pageErrors: [],
  };

  await runCommand('npm', ['run', 'build']);

  const preview = spawn('npm', ['run', 'preview', '--', '--host', HOST, '--port', String(PORT)], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });

  preview.stdout.on('data', (chunk) => process.stdout.write(chunk));
  preview.stderr.on('data', (chunk) => process.stderr.write(chunk));

  try {
    await waitForServer(BASE_URL);
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.on('console', (msg) => {
      if (msg.type() === 'error') results.consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => results.pageErrors.push(String(err)));

    await runRaceChecks(page, results);
    await runDetailChecks(page, results);

    await browser.close();
    await fs.writeFile(path.join(outputDir, 'results.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
  } finally {
    preview.kill('SIGINT');
  }
}

await main();
