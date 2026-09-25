/* window.DJ 冒煙測試：每個動詞至少呼叫一次，並驗證這層介面最重要的幾個承諾。
 *
 * 只透過 DJ 與畫布 DOM 驗證，不碰任何內部函式名——這份測試本身就是「外部呼叫者」，
 * 內部重構後它還能跑，才代表轉接層有盡到責任。
 *
 * 執行：用本機伺服器開 src/index.html（repo 根目錄當網站根，例如 python3 tools/serve.py），
 * 在 console 執行
 *
 *     await (await import('/tests/dj-smoke.js')).default()
 *
 * 回傳 {pass, fail, failures}。測試會暫時載入一份合成簡報，結束時還原成原本的內容；
 * 但瀏覽器的自動存檔在過程中仍會寫入，**請在空白分頁或另一個 port 上跑**，不要在正在工作的簡報上跑。
 */
const TEXT = (id, x, y, w, h, text, extra) => Object.assign(
  {id, type: 'text', x, y, w, h, paras: [{runs: [{text, sizePt: 18}]}]}, extra || {});
const LONG = '這是一段比較長的測試文字，用來確認文字框放不下時會被判定為溢出，而貼合內容之後會剛好裝下。';

function fixture() {
  return {
    title: 'DJ smoke', pages: [
      {id: 'pA', name: 'A', notes: '講稿 A', elements: [
        TEXT('tall', 40, 40, 400, 300, '短字'),
        TEXT('tight', 40, 380, 300, 24, LONG),
        TEXT('vert', 700, 40, 30, 300, LONG.slice(0, 20), {vert: 'eaVert'}),
        {id: 'tbl', type: 'table', x: 500, y: 400, colW: [100, 100], rowH: [30, 30],
          cells: [[{text: 'a'}, {text: 'b'}], [{text: 'c'}, {text: 'd'}]]},
      ]},
      {id: 'pB', name: 'B', elements: [TEXT('tall', 40, 40, 400, 300, '與 A 頁同 id（Morph 配對）')]},
    ],
  };
}

const PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
function template() {
  return {
    title: 'My template', stage: {w: 1280, h: 720}, pages: [
      {id: 'tSpec', name: 'Spec', skip: true, notes: 'rules', elements: [TEXT('s1', 0, 0, 400, 40, 'rules')]},
      {id: 'tEx', name: 'Example', elements: [TEXT('title', 20, 0, 900, 80, 'Title'), TEXT('sub', 40, 90, 900, 36, 'Subtitle')]},
      {id: 'tComp', name: 'Component', skip: true, elements: [{id: 'icon', type: 'image', x: 0, y: 0, w: 40, h: 40, dataUrl: PX}]},
    ],
  };
}

export default async function run() {
  const DJ = window.DJ, results = [];
  const ok = (name, cond, info) => results.push({name, pass: !!cond, info});
  const throws = async (name, fn) => {
    try { await fn(); ok(name, false, 'did not throw'); } catch (e) { ok(name, /^DJ: /.test(e.message), e.message); }
  };
  const el = (pid, id) => DJ.get(pid, id);
  const redFrames = () => [...document.querySelectorAll('#stage .el.overflow')].map(b => b.dataset.id).sort();

  const original = await DJ.toBlob();
  try {
    ok('version is 1', DJ.version === 1);
    const lr = await DJ.load(fixture());
    ok('load: two pages', DJ.list().length === 2);
    ok('load: clean fixture has no warnings', lr.warnings.length === 0, lr.warnings);
    ok('load: file handle cleared', DJ.info().file === null);

    // ---- 讀 ----
    const ol = DJ.outline('pA');
    ok('outline: 4 elements', ol.length === 4, ol);
    ok('outline: text preview', ol[0].text === '短字');
    ok('outline: table grid', ol.find(o => o.id === 'tbl').grid === '2x2');
    ok('outline: overflow flag', ol.find(o => o.id === 'tight').overflow === true);
    ok('get: element', el('pA', 'tall').type === 'text');
    ok('get: page keeps notes', DJ.get('pA').notes === '講稿 A');

    // ---- 版面：量測與溢出，且與畫布紅框一致 ----
    const mt = DJ.measure('pA', 'tall'), mg = DJ.measure('pA', 'tight');
    ok('measure: tall box needs less than it has', mt.needH < mt.h, mt);
    ok('measure: tight box needs more than it has', mg.needH > mg.h, mg);
    ok('overflow(page)', JSON.stringify(DJ.overflow('pA')) === '["tight","vert"]', DJ.overflow('pA'));
    ok('overflow(all)', JSON.stringify(DJ.overflow()) === '{"pA":["tight","vert"]}', DJ.overflow());
    DJ.show('pA'); await new Promise(r => setTimeout(r, 50));
    ok('overflow agrees with red frame (before fit)', JSON.stringify(redFrames()) === '["tight","vert"]', redFrames());

    // ---- 游標獨立：畫面停在 B，寫 A ----
    DJ.show('pB');
    const r1 = await DJ.patch('pA', [{id: 'tall', set: {x: 60}}]);
    ok('patch: targets pA while viewing pB', el('pA', 'tall').x === 60 && el('pB', 'tall').x === 40);
    ok('patch: view stays on pB', DJ.info().page === 'pB');
    ok('patch: page ids unique', new Set(DJ.list().map(p => p.id)).size === 2);
    ok('patch: returns overflow', JSON.stringify(r1.overflow) === '["tight","vert"]', r1);
    await DJ.patch('pA', [{id: 'pA', set: {notes: '改過'}}, {id: 'tall', unset: ['lineSpacing']}]);
    ok('patch: page field', DJ.get('pA').notes === '改過');

    // ---- 失敗不留半套 ----
    const before = JSON.stringify(DJ.get('pA'));
    await throws('patch: unknown element throws', () => DJ.patch('pA', [{id: 'tall', set: {x: 99}}, {id: 'nope', set: {x: 1}}]));
    ok('patch: failed call leaves deck unchanged', JSON.stringify(DJ.get('pA')) === before);
    await throws('patch: id is immutable', () => DJ.patch('pA', [{id: 'tall', set: {id: 'x'}}]));
    await throws('patch: page elements not patchable', () => DJ.patch('pA', [{id: 'pA', set: {elements: []}}]));
    await throws('unknown page throws', () => DJ.patch('zz', []));

    // ---- 貼合 ----
    const f = await DJ.fit('pA', ['tight', 'tall']);
    ok('fit: both changed', f.fitted.length === 2, f);
    ok('fit: only the unfitted box still overflows', JSON.stringify(f.overflow) === '["vert"]', f.overflow);
    ok('fit: height equals measured need', el('pA', 'tight').h === DJ.measure('pA', 'tight').needH);
    ok('fit: top edge stays', el('pA', 'tight').y === 380);
    const fv = await DJ.fit('pA', 'vert');
    ok('fit: vertical text changes width, not height', fv.fitted.length === 1 && el('pA', 'vert').h === 300, fv);
    ok('fit: no overflow left', fv.overflow.length === 0, fv.overflow);
    DJ.show('pA'); await new Promise(r => setTimeout(r, 50));
    ok('red frames gone after fit', redFrames().length === 0, redFrames());
    await throws('fit: table rejected', () => DJ.fit('pA', 'tbl'));
    await throws('fit: needs ids', () => DJ.fit('pA'));

    // ---- 表格列高貼合：量不在畫面上的頁，同 id 的表格在另一頁也不會量錯 ----
    const sumH = a => a.reduce((x, y) => x + y, 0);
    await DJ.add('pB', [{id: 'tbl', type: 'table', x: 0, y: 400, colW: [80], rowH: [20, 20],
      cells: [[{md: LONG}], [{md: 'x'}]]}]);
    DJ.show('pA');
    const ob = DJ.outline('pB').find(e => e.id === 'tbl');
    ok('outline: table height is the drawn height, not the rowH sum', ob.h > 40, ob);
    const ft = await DJ.fitTable('pB', ['tbl']);
    const fr = el('pB', 'tbl').rowH;
    ok('fitTable: wrapped row grows, one-line row gets the default pad', ft.fitted.length === 1 && fr[0] > 100 && fr[1] > 20 && fr[1] < 40, ft);
    ok('fitTable: outline height now equals the rowH sum', DJ.outline('pB').find(e => e.id === 'tbl').h === sumH(fr));
    ok('fitTable: same id on the current page untouched', JSON.stringify(el('pA', 'tbl').rowH) === '[30,30]', el('pA', 'tbl').rowH);
    ok('fitTable: already fitted is a no-op', (await DJ.fitTable('pB', 'tbl')).fitted.length === 0);
    await DJ.fitTable('pB', 'tbl', {pad: 0});
    ok('fitTable: pad 0 takes the pad back off', el('pB', 'tbl').rowH[1] === fr[1] - 10, el('pB', 'tbl').rowH);
    await throws('fitTable: text box rejected', () => DJ.fitTable('pA', 'tall'));
    await throws('fitTable: unknown option', () => DJ.fitTable('pB', 'tbl', {padding: 4}));
    await DJ.patch('pB', [{id: 'tbl', remove: true}]);

    // ---- 排版：外框、置中、對齊、堆疊（群組 id 整組移動） ----
    await DJ.add('pB', [TEXT('L1', 100, 100, 200, 50, 'a'), TEXT('L2', 400, 300, 100, 80, 'b', {groupId: 'gL'}),
      TEXT('L3', 420, 390, 60, 20, 'c', {groupId: 'gL'})]);
    const xy = id => { const e = el('pB', id); return [e.x, e.y]; };
    ok('bbox: element and group together', JSON.stringify(DJ.bbox('pB', ['L1', 'gL'])) === '{"x":100,"y":100,"w":400,"h":310}', DJ.bbox('pB', ['L1', 'gL']));
    const ce = await DJ.center('pB', ['L1', 'gL'], {area: {x: 0, y: 0, w: 1000, h: 600}});
    ok('center: group box lands in the middle of the area', JSON.stringify(ce.box) === '{"x":300,"y":145,"w":400,"h":310}', ce);
    ok('center: group members keep their offsets', xy('L3')[0] - xy('L2')[0] === 20 && xy('L3')[1] - xy('L2')[1] === 90, [xy('L2'), xy('L3')]);
    await DJ.align('pB', ['L1', 'gL'], 'bottom');
    ok('align: bottom edges meet', xy('L1')[1] + 50 === xy('L3')[1] + 20, [xy('L1'), xy('L3')]);
    await DJ.stack('pB', ['L1', 'gL'], {gap: 10});
    ok('stack: next unit starts gap below the previous one', xy('L2')[1] === xy('L1')[1] + 50 + 10 && xy('L1')[1] === 405, [xy('L1'), xy('L2')]);
    ok('center: warns when the group is bigger than the area', (await DJ.center('pB', 'gL', {area: {x: 0, y: 0, w: 50, h: 500}})).warnings.length === 1);
    await throws('arrange: element listed twice through its group', () => DJ.align('pB', ['L2', 'gL'], 'top'));
    await throws('arrange: unknown edge', () => DJ.align('pB', ['L1'], 'up'));
    await DJ.patch('pB', ['L1', 'L2', 'L3'].map(id => ({id, remove: true})));

    // ---- 增刪頁與元素 ----
    const a = await DJ.add('pB', [TEXT(null, 0, 500, 200, 40, '新增'), TEXT('tall', 0, 0, 10, 10, '撞號')]);
    ok('add: auto id', a.ids[0] && a.ids[0] !== 'tall');
    ok('add: same-page collision renamed', a.ids[1] !== 'tall', a.ids);
    const a2 = await DJ.add('pA', [TEXT('only-b', 0, 0, 100, 30, 'x')]);
    ok('add: cross-page id kept', a2.ids[0] === 'only-b');
    const np = await DJ.addPage({name: 'C', elements: [TEXT('c1', 0, 0, 100, 30, 'C')]}, 'pA');
    ok('addPage: inserted after pA', DJ.list()[1].id === np.page && np.n === 2, DJ.list());
    await DJ.replacePage(np.page, {elements: [TEXT('c2', 0, 0, 100, 30, 'C2')]});
    ok('replacePage: id kept, name falls back', DJ.list()[1].id === np.page && DJ.list()[1].name === 'C');
    ok('replacePage: elements replaced', DJ.outline(np.page).map(o => o.id).join() === 'c2');
    await DJ.patch('pB', [{id: a.ids[0], remove: true}]);
    ok('patch: remove element', !DJ.outline('pB').some(o => o.id === a.ids[0]));
    await DJ.removePage(np.page);
    ok('removePage', DJ.list().length === 2);

    // ---- 換文字、留樣式 ----
    const st = await DJ.add('pB', [{id: 'styled', type: 'text', x: 0, y: 0, w: 900, h: 100, valign: 'middle',
      paras: [{align: 'center', runs: [{text: 'Old title', sizePt: 44, color: '5E3687', bold: true}]}]}]);
    await DJ.patch('pB', [{id: 'styled', md: '新標題 **重點**\n第二行'}]);
    const sp = DJ.get('pB', 'styled').paras;
    ok('md: keeps size, color and paragraph align', sp[0].runs[0].sizePt === 44 && sp[0].runs[0].color === '5E3687' && sp[0].align === 'center', sp);
    ok('md: inline markdown still applies', sp[0].runs.some(r => r.text === '重點' && r.bold));
    ok('md: extra lines reuse the last paragraph style', sp.length === 2 && sp[1].runs[0].sizePt === 44, sp);
    ok('md: element fields untouched', DJ.get('pB', 'styled').valign === 'middle');
    // 段首粗體標籤：字元樣式取最長的 run（內文），不取第一個（標籤），否則整段變粗
    await DJ.add('pB', [{id: 'label', type: 'text', x: 0, y: 200, w: 900, h: 40,
      paras: [{runs: [{text: '目的', bold: true, sizePt: 14}, {text: '：一段比標籤長得多的內文', sizePt: 14}]}]}]);
    await DJ.patch('pB', [{id: 'label', md: '**方法**：換過的內文'}]);
    const lbl = DJ.get('pB', 'label').paras[0].runs;
    ok('md: bold label does not make the whole paragraph bold',
      lbl.some(r => r.text === '方法' && r.bold) && lbl.some(r => /換過的內文/.test(r.text) && !r.bold) && lbl.every(r => r.sizePt === 14), lbl);
    await DJ.patch('pB', [{id: 'label', remove: true}]);
    await throws('md: not on a table', () => DJ.patch('pA', [{id: 'tbl', md: 'x'}]));
    await throws('change keys are strict (typo "sett")', () => DJ.patch('pB', [{id: 'styled', sett: {x: 1}}]));
    await DJ.patch('pB', [{id: 'styled', remove: true}]);

    // ---- 不認得的欄位：只警告、照樣寫入 ----
    const w1 = await DJ.add('pB', [{type: 'shape', shape: 'line', x: 0, y: 600, w: 200, h: 0, endArrow: 'triangle'}]);
    ok('warn: endArrow gets the arrow hint', w1.warnings.length === 1 && /shape:'arrow'/.test(w1.warnings[0]), w1.warnings);
    ok('warn: element still added', DJ.outline('pB').some(o => o.id === w1.ids[0]));
    const w2 = await DJ.patch('pB', [{id: 'tall', set: {paras: [{runs: [{text: 'x', valign: 'middle'}]}]}}]);
    ok('warn: valign on a run points to the right level', w2.warnings.length === 1 && /not on a text run/.test(w2.warnings[0]), w2.warnings);
    const w3 = await DJ.patch('pB', [{id: 'tall', set: {fil: 'FF0000'}}]);
    ok('warn: typo suggests the near name', /did you mean "fill"/.test(w3.warnings[0] || ''), w3.warnings);
    const w4 = await DJ.add('pB', [{type: 'table', x: 0, y: 0, w: 300, colW: [100], rowH: [30], cells: [[{md: 'a'}]]}]);
    ok('warn: table w is not a table field', w4.warnings.length === 1 && /\.w: /.test(w4.warnings[0]), w4.warnings);
    const w5 = await DJ.add('pB', [{type: 'text', x: 0, y: 0, w: 100, h: 30, paras: [{md: 'ok', bullet: {type: 'bullet', level: 0}}], fill: 'EEEEEE', role: 'title'}]);
    ok('warn: valid element has no warnings (role is a documented field)', w5.warnings.length === 0, w5.warnings);
    ok('lint: finds what was written', DJ.lint('pB').length === 4, DJ.lint('pB'));
    ok('lint: clean page is clean', DJ.lint('pA').length === 0, DJ.lint('pA'));
    await DJ.patch('pB', [w1.ids[0], w4.ids[0], w5.ids[0]].map(id => ({id, remove: true})).concat([{id: 'tall', unset: ['fil']}]));

    // ---- 容易被換行拆開的寫法：只提醒，不修改 ----
    await DJ.add('pB', [{id: 'brk', type: 'text', x: 0, y: 300, w: 600, h: 40, paras: [{runs: [{text: '頻段 2–18 GHz，F-42%，RL < −10 dB', sizePt: 14}]}]}]);
    const bh = DJ.lint('pB').filter(w => /line can break/.test(w));
    ok('lint: line-break hints for unit, range, hyphen and comparison', bh.length === 4 && bh.every(w => w.startsWith('pB/brk:')), bh);
    ok('lint: hints do not touch the text', DJ.get('pB', 'brk').paras[0].runs[0].text === '頻段 2–18 GHz，F-42%，RL < −10 dB');
    // 狀態列：自己動手編輯的人看得到件數，按一下跳到那個元素（停手 300ms 後才重算）
    const hint = document.querySelector('#breakHint'), settle = () => new Promise(r => setTimeout(r, 400));
    DJ.show('pA'); await settle();
    ok('status bar: counts the spots', /\b5\b/.test(hint.textContent), hint.textContent);
    hint.click();
    ok('status bar: click jumps to the page and names the spots', DJ.info().page === 'pB' && /18 GHz/.test(hint.textContent) && /1\/1/.test(hint.textContent), [DJ.info().page, hint.textContent]);
    await DJ.patch('pB', [{id: 'brk', md: '頻段 2\u00a0至\u00a018\u00a0GHz，F\u201142%，RL\u00a0<\u00a0−10\u00a0dB'}]);
    ok('lint: no-break characters clear the hints', !DJ.lint('pB').some(w => /line can break/.test(w)), DJ.lint('pB'));
    await settle();
    ok('status bar: clears once fixed', hint.textContent === '', hint.textContent);
    await DJ.patch('pB', [{id: 'brk', remove: true}]);

    // ---- 從模板開新簡報 ----
    await DJ.load(template());
    const tplBlob = await DJ.toBlob();            // 走 .deck 容器（資產另存）這條路
    DJ.show(DJ.list()[0].id);
    const t1 = await DJ.fromTemplate(tplBlob);
    ok('fromTemplate: keeps only shown pages', t1.pages.length === 1 && t1.pages[0].id === 'tEx', t1.pages);
    ok('fromTemplate: reports dropped pages', t1.dropped.map(d => d.name).join() === 'Spec,Component', t1.dropped);
    ok('fromTemplate: template title not reused', DJ.info().title !== 'My template', DJ.info().title);
    ok('fromTemplate: settings kept, file cleared', DJ.info().stage.w === 1280 && DJ.info().file === null);
    const t2 = await DJ.fromTemplate(tplBlob, {pages: ['Component', 'tEx'], title: 'Report'});
    ok('fromTemplate: listed pages in given order', t2.pages.map(p => p.id).join() === 'tComp,tEx', t2.pages);
    ok('fromTemplate: title option', DJ.info().title === 'Report');
    // get() 把位元組遮成 @asset: 佔位；佔位只在記憶體裡真的有位元組時才會出現
    ok('fromTemplate: image bytes survive the container', /^@asset:[0-9a-f]{16} /.test(DJ.get('tComp', 'icon').dataUrl || ''), DJ.get('tComp', 'icon').dataUrl);
    const t3 = await DJ.fromTemplate(tplBlob, {pages: 'all'});
    ok('fromTemplate: all', t3.pages.length === 3 && t3.dropped.length === 0);
    const cp = await DJ.addPage(DJ.get('tEx'), 'tEx');
    ok('copy a template page with addPage(get())', cp.page !== 'tEx' && DJ.outline(cp.page).map(o => o.id).join() === 'title,sub', DJ.list());
    const beforeBad = JSON.stringify(DJ.list());
    await throws('fromTemplate: unknown page throws', () => DJ.fromTemplate(tplBlob, {pages: ['Nope']}));
    ok('fromTemplate: failed call leaves deck unchanged', JSON.stringify(DJ.list()) === beforeBad);
    await throws('fromTemplate: duplicate page throws', () => DJ.fromTemplate(tplBlob, {pages: ['tEx', 'Example']}));
    await DJ.load(fixture());

    // ---- 圖片資產：佔位按內容，不按元素 id ----
    const px2 = (() => {
      const k = document.createElement('canvas'); k.width = 3; k.height = 2;
      const g = k.getContext('2d'); g.fillStyle = '#00f'; g.fillRect(0, 0, 3, 2); return k.toDataURL('image/png');
    })();
    const IMG = (url, natW, natH) => ({id: 'pic', type: 'image', x: 10, y: 10, w: 90, h: 60, natW, natH, dataUrl: url});
    await DJ.load({pages: [{id: 'iA', elements: [IMG(PX, 1, 1)]}, {id: 'iB', elements: [IMG(px2, 3, 2)]},
      {id: 'iC', bgImage: px2, elements: []}]});
    const gA = DJ.get('iA');
    await DJ.replacePage('iA', gA);
    // 兩頁都有 id 為 pic 的圖：按 id 還原會拿到 iB 那張（2026-09-25 的 bug）
    ok('assets: same id on two pages keeps its own image',
      DJ.get('iA', 'pic').dataUrl === gA.elements[0].dataUrl && DJ.get('iA', 'pic').dataUrl !== DJ.get('iB', 'pic').dataUrl,
      [DJ.get('iA', 'pic').dataUrl, DJ.get('iB', 'pic').dataUrl]);
    const as = DJ.assets();
    ok('assets: one entry per distinct image', as.length === 2, as);
    const blue = as.find(a => a.natW === 3);
    ok('assets: usedBy lists the element and the page background',
      !!blue && blue.usedBy.length === 2 && blue.usedBy.some(u => u.page === 'iC' && u.field === 'bgImage'), blue);
    const ra = await DJ.add('iA', [{type: 'image', x: 200, y: 10, w: 90, h: 60, dataUrl: blue.asset}]);
    const key = u => String(u).split(' ')[0];   // 佔位後面帶「 (大小)」，比對只看鍵
    const reused = DJ.get('iA', ra.ids[0]);
    ok('assets: reuse by placeholder, natW/natH filled in', key(reused.dataUrl) === blue.asset && reused.natW === 3 && reused.natH === 2, reused);
    ok('assets: reuse adds no new asset', DJ.assets().length === 2, DJ.assets());
    // 舊式佔位（元素 id）：id 全簡報唯一時照樣還原；對到多張不同的圖就擋下，不猜
    await DJ.patch('iA', [{id: ra.ids[0], set: {dataUrl: '@asset:' + ra.ids[0] + ' (1KB)'}}]);
    ok('assets: old id placeholder still resolves when unambiguous', key(DJ.get('iA', ra.ids[0]).dataUrl) === blue.asset);
    const beforeOld = JSON.stringify(DJ.get('iA'));
    let oldErr = '';
    try { await DJ.patch('iA', [{id: 'pic', set: {dataUrl: '@asset:pic (1KB)'}}]); } catch (e) { oldErr = e.message; }
    ok('assets: ambiguous old id placeholder throws', /@asset:pic/.test(oldErr), oldErr || 'did not throw');
    ok('assets: failed call leaves deck unchanged', JSON.stringify(DJ.get('iA')) === beforeOld);

    // ---- addImage：轉碼、原始尺寸、不變形的框 ----
    const canvasBlob = (w, h, noise) => new Promise(res => {
      const k = document.createElement('canvas'); k.width = w; k.height = h;
      const g = k.getContext('2d');
      if (noise) {   // 雜訊壓不小，用來做出「原圖遠大於所需」的檔
        const d = g.createImageData(w, h);
        for (let i = 0; i < d.data.length; i += 4) { d.data[i] = Math.random() * 255; d.data[i + 1] = Math.random() * 255; d.data[i + 2] = Math.random() * 255; d.data[i + 3] = 255; }
        g.putImageData(d, 0, 0);
      } else { g.fillStyle = '#f80'; g.fillRect(0, 0, w, h); }
      k.toBlob(res, 'image/png');
    });
    const wide = await canvasBlob(400, 200);
    const box = (pid, id) => { const e = DJ.get(pid, id); return [e.x, e.y, e.w, e.h, e.natW, e.natH].join(); };
    const i1 = await DJ.addImage('iA', wide, {x: 100, y: 100, w: 300, h: 300, alt: 'orange'});
    ok('addImage: contain in box keeps aspect and centers', box('iA', i1.id) === '100,175,300,150,400,200', box('iA', i1.id));
    ok('addImage: alt and no warnings', DJ.get('iA', i1.id).alt === 'orange' && i1.warnings.length === 0, i1);
    const i2 = await DJ.addImage('iA', wide, {x: 0, y: 0, h: 100});
    ok('addImage: only h gives w from aspect', box('iA', i2.id) === '0,0,200,100,400,200', box('iA', i2.id));
    const i3 = await DJ.addImage('iA', wide);
    ok('addImage: no size = half size, centered', box('iA', i3.id) === '540,310,200,100,400,200', box('iA', i3.id));
    const i4 = await DJ.addImage('iA', wide, {x: 0, y: 0, w: 300, h: 300, fit: 'cover'});
    ok('addImage: cover fills the box', box('iA', i4.id) === '0,0,300,300,400,200' && DJ.get('iA', i4.id).fit === 'cover', DJ.get('iA', i4.id));
    const bu = URL.createObjectURL(wide);
    const i5 = await DJ.addImage('iA', bu, {w: 100});
    URL.revokeObjectURL(bu);
    ok('addImage: fetches a URL', box('iA', i5.id).endsWith('100,50,400,200'), box('iA', i5.id));
    ok('addImage: same bytes from Blob and URL are one asset', DJ.assets().length === 3, DJ.assets().map(a => a.asset));
    const i6 = await DJ.addImage('iA', blue.asset, {w: 30});
    ok('addImage: reuse an @asset placeholder', key(DJ.get('iA', i6.id).dataUrl) === blue.asset && DJ.get('iA', i6.id).h === 20, DJ.get('iA', i6.id));
    const beforeImg = JSON.stringify(DJ.outline('iA'));
    await throws('addImage: 404 throws', () => DJ.addImage('iA', '/no-such-image-dj-smoke.png'));
    await throws('addImage: non-image URL throws', () => DJ.addImage('iA', '/tests/dj-smoke.js'));
    await throws('addImage: unknown option throws', () => DJ.addImage('iA', wide, {width: 100}));
    await throws('addImage: cover needs a box', () => DJ.addImage('iA', wide, {w: 100, fit: 'cover'}));
    ok('addImage: failed calls leave deck unchanged', JSON.stringify(DJ.outline('iA')) === beforeImg);
    const big = await canvasBlob(900, 600, true);
    const i7 = await DJ.addImage('iA', big, {w: 150});
    ok('addImage: warns when far larger than shown', i7.warnings.some(w => /compress/.test(w)), i7.warnings);
    const i8 = await DJ.addImage('iA', big, {w: 150, compress: 'web'});
    ok('addImage: compress shrinks to display need', i8.natW === 225 && i8.kb < i7.kb && i8.warnings.length === 0, [i7.kb, i8]);
    // 事後壓縮：框與群組不動；同一張圖同一尺寸只編碼一次，壓完仍是同一份資產
    const i9 = await DJ.addImage('iA', big, {w: 150});
    await DJ.patch('iA', [{id: i7.id, set: {groupId: 'gImg'}}]);
    const frame = id => box('iA', id).split(',').slice(0, 4).join();
    const box7 = frame(i7.id);
    const cmp = await DJ.compress('iA', [i7.id, i9.id], 'web');
    ok('compress: shrinks placed images to display need', cmp.compressed.length === 2 && DJ.get('iA', i7.id).natW === 225 && cmp.kb.after < cmp.kb.before, cmp);
    ok('compress: frame and group untouched', frame(i7.id) === box7 && DJ.get('iA', i7.id).groupId === 'gImg', [frame(i7.id), box7]);
    ok('compress: same picture stays one asset', key(DJ.get('iA', i7.id).dataUrl) === key(DJ.get('iA', i9.id).dataUrl));
    const cmp2 = await DJ.compress('iA', i7.id, 'web');
    ok('compress: already small is skipped', cmp2.compressed.length === 0 && cmp2.skipped.length === 1, cmp2);
    await DJ.add('iA', [TEXT('capt', 0, 0, 100, 20, 'caption')]);
    await throws('compress: non-image rejected', () => DJ.compress('iA', 'capt'));
    await throws('compress: unknown preset', () => DJ.compress('iA', i7.id, 'tiny'));
    await DJ.load(fixture());

    // ---- 進出 ----
    const blob = await DJ.toBlob();
    const snapA = JSON.stringify(DJ.outline('pA'));
    await DJ.load(blob);
    ok('toBlob/load roundtrip', JSON.stringify(DJ.outline('pA')) === snapA);
    const png = await DJ.snapshot('pA');
    ok('snapshot: png blob', png.type === 'image/png' && png.size > 1000, png.size);
    const pptx = await DJ.exportPptx();
    const magic = new Uint8Array(await pptx.slice(0, 2).arrayBuffer());
    ok('exportPptx: zip blob', magic[0] === 0x50 && magic[1] === 0x4b, pptx.size);
  } catch (e) {
    ok('unexpected exception', false, e.stack || String(e));
  } finally {
    await DJ.load(original);
  }
  const failures = results.filter(r => !r.pass);
  return {pass: results.length - failures.length, fail: failures.length, failures};
}
