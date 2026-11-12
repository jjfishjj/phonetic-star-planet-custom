const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const BASE = '/smoke/';
const PUBLIC_CONFIG = `window.PHONETIC_CONFIG=Object.freeze({supabaseUrl:'https://mock.supabase.test',supabaseAnonKey:'sb_publishable_browser_smoke'});`;
const project = { server: null, url: null };

function mime(file) {
  return { '.html':'text/html; charset=utf-8', '.js':'application/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }[path.extname(file)] || 'application/octet-stream';
}
async function startServer() {
  project.server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://local').pathname;
    if (!pathname.startsWith(BASE)) { res.writeHead(404); return res.end('not found'); }
    let relative = pathname.slice(BASE.length);
    if (!relative || relative.endsWith('/')) relative += 'index.html';
    const file = path.resolve(ROOT, relative);
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': mime(file), 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => project.server.listen(0, '127.0.0.1', resolve));
  project.url = `http://127.0.0.1:${project.server.address().port}${BASE}`;
}
async function stopServer() { if (project.server) await new Promise(resolve => project.server.close(resolve)); }

test.before(async () => startServer());
test.after(async () => stopServer());

function deck(id='en', i=0) { return { id, name: i ? `Deck ${i}` : '英語', native:'English', flag:'🇬🇧', region:'europe', lang:'en-US', position:i, published:true }; }
function card(id, i, extra={}) { return { id, deck_id:'en', word:`cloud-${i}`, roman:'/cloud/', hint:'雲', meaning:'雲', cue:'看見雲', position:i, published:true, ...extra }; }
function json(res, body, status=200, headers={}) { res.fulfill({ status, contentType:'application/json', headers, body:JSON.stringify(body) }); }
function restRange(req) {
  const u = new URL(req.url());
  const offset = Number(u.searchParams.get('offset') || 0);
  const limit = Number(u.searchParams.get('limit') || 1000);
  return [offset, offset + limit - 1];
}
async function installPublicRoutes(page, { cloud=false, xss=false, requests=null } = {}) {
  await page.route('**/supabase-config.js', r => r.fulfill({ status:200, contentType:'application/javascript', body:PUBLIC_CONFIG }));
  await page.route('**/rest/v1/**', async r => {
    const u = new URL(r.request().url());
    if (requests) requests.push({url:r.request().url(), headers:r.request().headers()});
    const table = u.pathname.split('/').pop();
    if (!cloud) return json(r, []);
    const offset = Number(u.searchParams.get('offset') || 0);
    const limit = Number(u.searchParams.get('limit') || 1000);
    if (table === 'phonetic_decks') return json(r, [deck()], 200, {'content-range':'0-0/*'});
    if (table === 'phonetic_cards') {
      const rows = Array.from({ length: 1200 }, (_, i) => card(`c-${i}`, i));
      if (xss) rows[0] = card('xss',0,{word:'<img src=x onerror=window.__xss=1>',meaning:'<b>not html</b>'});
      return json(r, rows.slice(offset, offset + limit));
    }
    return json(r, []);
  });
}

async function freshPage() {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  const browser = await chromium.launch({ headless:true, ...(executablePath ? {executablePath} : {}) });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('pageerror', e => console.error('PAGEERROR', e.message));
  return { browser, context, page };
}

 test('public fallback renders bundled 12 decks x 100 cards and preserves legacy local state', async () => {
  const { browser, page } = await freshPage();
  try {
    await page.route('**/rest/v1/**', r => r.abort('failed'));
    await page.addInitScript(() => localStorage.setItem('phonetic-star-planet-v1', JSON.stringify({ learned:[], favorites:['en:0'], xp:0, reviewed:0, selected:'en', index:0, revealed:false, customDecks:[] })));
    await page.goto(project.url, { waitUntil:'networkidle' });
    await page.locator('#deckGrid .deck').first().waitFor({state:'attached'});
    assert.equal(await page.locator('#deckGrid .deck').count(), 12);
    assert.equal(await page.locator('#deckGrid .deck').first().getAttribute('data-deck'), 'en');
    assert.match(await page.locator('#publicCardCount').textContent(), /1,200/);
    await page.locator('[data-deck="en"]').click();
    assert.equal(await page.locator('#favoriteStat').textContent(), '1 張');
    await page.locator('#favoriteBtn').click();
    assert.equal(await page.locator('#favoriteStat').textContent(), '0 張');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('phonetic-star-planet-v1')));
    assert.deepEqual(stored.learned, []);
  } finally { await browser.close(); }
});

test('public cloud loads 1200 cards with limit/offset paging, omits auth, renders new card text safely, and handles empty cloud', async () => {
  const { browser, context, page } = await freshPage();
  const requests = [];
  try {
    await installPublicRoutes(page, {cloud:true, xss:true, requests});
        await page.goto(project.url, {waitUntil:'networkidle'});
    await page.locator('#deckGrid .deck').first().waitFor();
    assert.equal(await page.locator('#deckGrid .deck').count(), 1);
    assert.equal(await page.locator('#publicCardCount').textContent(), '1,200');
    assert.equal(requests.filter(x => x.url.includes('phonetic_cards')).length, 2);
    for (const req of requests) { assert.equal(req.headers.authorization, undefined); assert.equal(req.headers.cookie, undefined); }
    await page.locator('[data-deck="en"]').click();
    await page.locator('#wordText').waitFor();
    const words = await page.locator('#wordText').allTextContents();
    assert.equal(words[0], '<img src=x onerror=window.__xss=1>');
    assert.equal(await page.locator('#wordText img').count(), 0);

    const empty = await context.newPage();
    await installPublicRoutes(empty, {cloud:false});
    await empty.goto(project.url, {waitUntil:'networkidle'});
    assert.equal(await empty.locator('#deckGrid .deck').count(), 0);
    await empty.locator('#practice').waitFor({state:'attached'});
    await empty.close();
  } finally { await browser.close(); }
});

test('custom deck and card create/edit remain local and persist after reload', async () => {
  const { browser, page } = await freshPage();
  try {
    await page.route('**/rest/v1/**', r => r.abort('failed'));
    await page.goto(project.url, {waitUntil:'networkidle'});
    await page.click('#createDeckBtn');
    await page.fill('#deckNameInput','旅行自訂');
    await page.fill('#deckNativeInput','Trip');
    await page.click('#saveDeckBtn');
    await page.locator('#deckGrid [data-deck^="custom-"]').waitFor();
    await page.fill('#cardWordInput','bonjour'); await page.fill('#cardHintInput','蹦啾'); await page.fill('#cardMeaningInput','你好');
    await page.click('#saveCardBtn');
    await page.locator('#customCardList').getByText('bonjour').waitFor();
    await page.locator('#customCardList').getByText('編輯').click();
    await page.fill('#cardMeaningInput','您好'); await page.click('#saveCardBtn');
    assert.equal(await page.locator('#customCardList').getByText('您好').count(), 1);
    await page.reload({waitUntil:'networkidle'});
    await page.locator('#deckGrid [data-deck^="custom-"]').waitFor();
    await page.click('#deckGrid [data-deck^="custom-"]'); await page.click('#manageDeckBtn');
    assert.equal(await page.locator('#customCardList').getByText('您好').count(), 1);
  } finally { await browser.close(); }
});

function authRoutes(page, { session=null, admin=false, invalid=false, cards=1201, draftIndex=-1, writes=[] } = {}) {
  return page.route('**/*', async r => {
    const req = r.request(), u = new URL(req.url());
    if (u.pathname.endsWith('/supabase-config.js')) return r.fulfill({status:200,contentType:'application/javascript',body:PUBLIC_CONFIG});
    if (!u.hostname.includes('mock.supabase.test')) return r.continue();
    if (req.method() === 'OPTIONS') return r.fulfill({status:204, headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});
    if (u.pathname.includes('/auth/v1/token')) {
      if (invalid) return json(r,{error:'invalid_credentials',error_description:'Invalid login credentials'},400);
      return json(r,{access_token:'access-token',refresh_token:'refresh-token',token_type:'bearer',expires_in:3600,user:{id:'admin-user',email:'admin@example.test'}});
    }
    if (u.pathname.includes('/auth/v1/user')) return session ? json(r,session.user) : json(r,{},401);
    if (u.pathname.includes('/rest/v1/rpc/phonetic_is_admin')) return json(r,admin);
    if (u.pathname.includes('/rest/v1/rpc/phonetic_import_cards')) { const body=req.postDataJSON(); writes.push({kind:'rpc',body}); return json(r,{inserted:body.p_rows.length,updated:0}); }
    if (u.pathname.includes('/rest/v1/phonetic_decks')) {
      if (req.method()==='GET') return json(r,[deck()]);
      writes.push({kind:req.method(),table:'decks',body:req.postDataJSON()}); return json(r,[]);
    }
    if (u.pathname.includes('/rest/v1/phonetic_cards')) {
      if (req.method()==='GET') { const [from,to]=restRange(req); const rows=Array.from({length:cards},(_,i)=>card(`admin-${i}`,i,{published:i!==draftIndex})).slice(from,to+1); return json(r,rows,200,{'content-range':`${from}-${from+rows.length-1}/${cards}`}); }
      writes.push({kind:req.method(),table:'cards',body:req.postDataJSON()}); return json(r,[]);
    }
    return json(r,{});
  });
}
function session() { return {access_token:'access-token',refresh_token:'refresh-token',user:{id:'admin-user',email:'admin@example.test'}}; }

 test('admin invalid credentials stays on auth with visible error; non-admin session is denied', async () => {
  const bad = await freshPage();
  try {
    await authRoutes(bad.page,{invalid:true}); await bad.page.goto(project.url+'admin/',{waitUntil:'networkidle'});
    await bad.page.fill('#emailInput','bad@example.test'); await bad.page.fill('#passwordInput','wrong'); await bad.page.click('#loginForm button');
    await assert.doesNotReject(() => bad.page.locator('#authError').getByText('Invalid login credentials').waitFor());
  } finally { await bad.browser.close(); }
  const denied = await freshPage();
  try {
    await authRoutes(denied.page,{session:session(),admin:false}); await denied.page.goto(project.url+'admin/',{waitUntil:'networkidle'});
    await denied.page.fill('#emailInput','user@example.test'); await denied.page.fill('#passwordInput','password'); await denied.page.click('#loginForm button');
    await denied.page.waitForLoadState('networkidle'); await denied.page.locator('#deniedState:not([hidden])').waitFor();
  } finally { await denied.browser.close(); }
});

test('admin session pages 1201 cards, writes whitelisted card fields, imports real xlsx, blocks invalid import, and exports valid xlsx', async () => {
  const {browser,page} = await freshPage(); const writes=[];
  try {
    await authRoutes(page,{session:session(),admin:true,cards:1201,writes});
    await page.goto(project.url+'admin/',{waitUntil:'networkidle'});
    await page.fill('#emailInput','admin@example.test'); await page.fill('#passwordInput','password'); await page.click('#loginForm button'); await page.waitForLoadState('networkidle');
    await page.locator('#appState:not([hidden])').waitFor();
    assert.equal(await page.locator('#cardCount').textContent(),'1201');
    assert.match(await page.locator('#pageInfo').textContent(),/第 1 \/ 61 頁/);
    await page.click('#nextPage'); assert.match(await page.locator('#pageInfo').textContent(),/第 2 \/ 61 頁/);
    await page.click('#prevPage'); await page.locator('#cardTable tr').first().waitFor();
    await page.locator('#cardTable tr').first().getByText('編輯').click();
    const editor=page.locator('.card-editor'); await editor.locator('[name=word]').fill('edited'); await editor.locator('[name=hint]').fill('提示'); await editor.locator('[name=meaning]').fill('意思'); await editor.locator('button[type=submit]').click();
    await page.locator('#cardTable').waitFor();
    const cardWrite=writes.find(x=>x.table==='cards' && x.kind==='PATCH'); assert.ok(cardWrite); assert.deepEqual(Object.keys(cardWrite.body).sort(),['cue','hint','meaning','position','published','roman','word']);
    await page.locator('#cardTable tr').first().getByText('取消發布').click();
    assert.ok(writes.filter(x=>x.table==='cards' && x.kind==='PATCH').length >= 2);

    const xlsx = makeXlsx([['word','roman','hint','meaning','cue','published','position','id'],['imported','/i/','提示','匯入','畫面','true','3','']]);
    await page.setInputFiles('#importFile',{name:'cards.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:xlsx});
    await page.locator('#importSummary').getByText('可以匯入').waitFor(); await page.click('#importBtn'); await page.locator('#toast').getByText(/匯入完成/).waitFor();
    const rpc=writes.find(x=>x.kind==='rpc'); assert.equal(rpc.body.p_rows[0].word,'imported'); assert.equal(rpc.body.p_rows[0].position,3);
    const invalid=makeXlsx([['word','hint','meaning'],['bad','','x']]); await page.setInputFiles('#importFile',{name:'bad.xlsx',buffer:invalid}); await page.locator('#previewErrors').getByText(/缺少諧音/).waitFor(); assert.equal(await page.locator('#importBtn').isDisabled(),true);
    const downloadPromise=page.waitForEvent('download'); await page.click('#exportBtn'); const download=await downloadPromise; const file=await download.path(); assert.ok(file && fs.statSync(file).size>100);
    const exported=readXlsx(file); assert.equal(exported[0].word,'cloud-0');
  } finally { await browser.close(); }
});

test('Excel update without a publication column leaves draft status omitted in the RPC', async () => {
  const {browser,page} = await freshPage(); const writes=[];
  try {
    await authRoutes(page,{session:session(),admin:true,cards:2,draftIndex:1,writes});
    await page.goto(project.url+'admin/',{waitUntil:'networkidle'});
    await page.fill('#emailInput','admin@example.test');
    await page.fill('#passwordInput','password');
    await page.click('#loginForm button');
    await page.locator('#appState:not([hidden])').waitFor();
    await page.locator('#cardTable tr').nth(1).getByText('未發布',{exact:true}).waitFor();
    await page.check('input[name="importMode"][value="update"]');
    const xlsx = makeXlsx([['word','hint','meaning'],['cloud-1','提示','草稿更新']]);
    await page.setInputFiles('#importFile',{name:'update-draft.xlsx',buffer:xlsx});
    await page.locator('#importSummary').getByText('可以匯入').waitFor();
    await page.click('#importBtn');
    await page.locator('#toast').getByText(/匯入完成/).waitFor();
    const rpc=writes.find(x=>x.kind==='rpc');
    assert.equal(rpc.body.p_update_existing,true);
    assert.equal(Object.hasOwn(rpc.body.p_rows[0],'published'),false);
    await page.locator('#cardTable tr').nth(1).getByText('未發布',{exact:true}).waitFor();
  } finally { await browser.close(); }
});

function makeXlsx(rows) {
  const sandbox={}; vm.runInNewContext(fs.readFileSync(path.join(ROOT,'vendor/xlsx.full.min.js'),'utf8'),sandbox);
  const wb=sandbox.XLSX.utils.book_new();
  sandbox.XLSX.utils.book_append_sheet(wb,sandbox.XLSX.utils.aoa_to_sheet(rows),'cards');
  return Buffer.from(sandbox.XLSX.write(wb,{bookType:'xlsx',type:'buffer'}));
}
function readXlsx(file) {
  const sandbox={}; vm.runInNewContext(fs.readFileSync(path.join(ROOT,'vendor/xlsx.full.min.js'),'utf8'),sandbox);
  const wb=sandbox.XLSX.read(fs.readFileSync(file),{type:'buffer'}); return sandbox.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
}
