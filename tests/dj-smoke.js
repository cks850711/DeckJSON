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
    // 開機（還原自動存檔等）做完才放行寫入：ready() 回 info()，之後 info().ready 為 true
    const rd = await DJ.ready();
    ok('ready: resolves to info()', rd && rd.version === 1 && typeof rd.pages === 'number', rd);
    ok('info: ready after boot', DJ.info().ready === true);
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

    // ---- 均分：照給的順序、間距相等；有 area 貼齊兩端，沒有就保留現有兩端 ----
    // 三張卡先疊在同一處（AI 常這樣先放再排），寬 100／200／100
    await DJ.add('pB', [TEXT('D1', 50, 600, 100, 40, '1'), TEXT('D2', 50, 600, 200, 40, '2'), TEXT('D3', 50, 600, 100, 40, '3')]);
    const dx3 = () => ['D1', 'D2', 'D3'].map(id => el('pB', id).x);
    const ds = await DJ.distribute('pB', ['D1', 'D2', 'D3'], {area: {x: 40, y: 0, w: 1200, h: 720}});
    // (1200 − 400) / 2 = 400 的間距：40、540、1140
    ok('distribute: first and last meet the area ends, equal gaps', dx3().join() === '40,540,1140' && ds.warnings.length === 0, [dx3(), ds]);
    ok('distribute: the other axis is left alone', ['D1', 'D2', 'D3'].every(id => el('pB', id).y === 600));
    await DJ.patch('pB', [{id: 'D2', set: {x: 900}}]);
    await DJ.distribute('pB', ['D1', 'D2', 'D3']);
    ok('distribute: without area the two ends stay put', dx3().join() === '40,540,1140', dx3());
    ok('distribute: warns when they cannot fit', (await DJ.distribute('pB', ['D1', 'D2', 'D3'], {area: {x: 0, y: 0, w: 300, h: 100}})).warnings.length === 1);
    await throws('distribute: needs two or more', () => DJ.distribute('pB', ['D1']));
    await throws('distribute: unknown axis', () => DJ.distribute('pB', ['D1', 'D2'], {axis: 'z'}));
    await DJ.patch('pB', ['D1', 'D2', 'D3'].map(id => ({id, remove: true})));

    // ---- 複製：圖片位元組跟著走，群組換新 id ----
    const {page: pC} = await DJ.addPage({name: 'components', elements: [
      {id: 'ic', type: 'image', x: 10, y: 10, w: 20, h: 20, natW: 1, natH: 1, dataUrl: PX, groupId: 'gK'},
      TEXT('lab', 40, 10, 100, 20, 'label', {groupId: 'gK'})]});
    const c1 = await DJ.copy(pC, 'gK', 'pB', {x: 500, y: 500});
    const c2 = await DJ.copy(pC, 'gK', 'pB', {dx: 0, dy: 100});
    const g1 = el('pB', c1.map.ic).groupId, g2 = el('pB', c2.map.ic).groupId;
    ok('copy: group copied twice becomes two groups', g1 && g2 && g1 !== g2 && el('pB', c1.map.lab).groupId === g1, [g1, g2]);
    ok('copy: {x, y} places the group box, offsets kept', JSON.stringify(DJ.bbox('pB', g1)) === '{"x":500,"y":500,"w":130,"h":20}', DJ.bbox('pB', g1));
    ok('copy: {dx, dy} shifts from the source position', el('pB', c2.map.ic).y === 110 && el('pB', c2.map.lab).x === 40);
    const one = await DJ.copy(pC, 'lab', 'pB');
    ok('copy: a lone member drops its group', el('pB', one.ids[0]).groupId === undefined, el('pB', one.ids[0]));
    await DJ.removePage(pC);
    await DJ.load(await DJ.toBlob());   // 走一次存檔：資產要真的留在簡報裡，不是只留在記憶體
    ok('copy: picture survives removing the source page', DJ.outline('pB').filter(e => e.type === 'image').length === 2 && DJ.assets().some(a => a.usedBy.some(u => u.page === 'pB')));
    const wa = await DJ.add('pB', [TEXT(null, 0, 0, 50, 20, 'x', {groupId: g1})]);
    ok('add: warns when joining an existing group', wa.warnings.some(w => /already used/.test(w)), wa.warnings);
    await throws('copy: both {x,y} and {dx,dy}', () => DJ.copy('pB', g1, 'pB', {x: 0, dx: 1}));
    await throws('copy: unknown source', () => DJ.copy('pB', 'nope', 'pB'));
    await DJ.patch('pB', DJ.outline('pB').filter(e => e.group === g1 || e.group === g2 || e.id === one.ids[0]).map(e => ({id: e.id, remove: true})));

    // ---- 增刪頁與元素 ----
    const a = await DJ.add('pB', [TEXT(null, 0, 500, 200, 40, '新增'), TEXT('tall', 0, 0, 10, 10, '撞號')]);
    ok('add: auto id', a.ids[0] && a.ids[0] !== 'tall');
    ok('add: same-page collision renamed', a.ids[1] !== 'tall', a.ids);
    const a2 = await DJ.add('pA', [TEXT('only-b', 0, 0, 100, 30, 'x')]);
    ok('add: cross-page id kept', a2.ids[0] === 'only-b');
    const np = await DJ.addPage({name: 'C', elements: [TEXT('c1', 0, 0, 100, 30, 'C')]}, 'pA');
    ok('addPage: inserted after pA', DJ.list()[1].id === np.page && np.n === 2, DJ.list());
    // 裸陣列與 replacePage 一致；原本會攤成 "0" 欄位、元素一個都沒進頁
    const na = await DJ.addPage([TEXT('arr', 0, 0, 100, 30, 'A')]);
    ok('addPage: bare elements array accepted', DJ.outline(na.page).map(o => o.id).join() === 'arr' && !('0' in DJ.get(na.page)), DJ.get(na.page));
    await DJ.removePage(na.page);
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
    // 原本就是粗體的標題：**重點** 與前文同樣式，會併成一個 run，所以看「重點」所在的 run 是否粗體
    ok('md: inline markdown still applies', sp[0].runs.some(r => r.text.includes('重點') && r.bold), sp[0].runs);
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
    // 同一段裡顏色或字級不同：md 只留得下一種，所以報錯、簡報不動
    await DJ.add('pB', [{id: 'mixed', type: 'text', x: 0, y: 200, w: 900, h: 40, paras: [{runs: [
      {text: 'Tag | ', bold: true, color: '1F3A5F', sizePt: 14}, {text: 'grey body text', color: '666666', sizePt: 14}]}]}]);
    const mixedBefore = JSON.stringify(DJ.get('pB', 'mixed'));
    await throws('md: refuses to flatten mixed colors', () => DJ.patch('pB', [{id: 'mixed', md: 'new text'}]));
    ok('md: refused change leaves the element as it was', JSON.stringify(DJ.get('pB', 'mixed')) === mixedBefore);
    await DJ.patch('pB', [{id: 'mixed', remove: true}]);

    // ---- md 簡寫：巢狀、HTML 標籤、簡報層設定 ----
    await DJ.add('pB', [{id: 'mdx', type: 'text', x: 0, y: 300, w: 900, h: 40,
      paras: [{md: '==**key**== **H<sub>2</sub>O** 10<sup>3</sup> <u>under</u> \\*lit\\* a * b * c'}]}]);
    const mx = DJ.get('pB', 'mdx').paras[0].runs, mxRun = t => mx.find(r => r.text === t) || {};
    const mxText = mx.map(r => r.text).join('');
    ok('md: nested marks', mxRun('key').bold && mxRun('key').highlight === 'FFFF00', mx);
    ok('md: html tags, also inside bold', mxRun('2').sub && mxRun('2').bold && mxRun('3').sup && mxRun('under').underline, mx);
    ok('md: escapes and spaced asterisks stay literal', mxText.includes('*lit*') && mxText.includes('a * b * c'), mxText);
    ok('info: usedHighlight', DJ.info().usedHighlight === 'FFFF00', DJ.info().usedHighlight);
    const sd = await DJ.setDeck({markdown: {highlight: '#e9c46a', syntax: {html: false}}});
    ok('setDeck: markdown normalised and filled in', sd.markdown.highlight === 'E9C46A' && sd.markdown.syntax.html === false && sd.markdown.syntax.mark === true, sd);
    ok('info: markdown settings', DJ.info().markdown.highlight === 'E9C46A');
    ok('setDeck: existing highlights keep their color', mxRun('key').highlight === 'FFFF00' && DJ.get('pB', 'mdx').paras[0].runs.find(r => r.text === 'key').highlight === 'FFFF00');
    await DJ.patch('pB', [{id: 'mdx', set: {paras: [{md: '==new== <sub>x</sub>'}]}}]);
    const my = DJ.get('pB', 'mdx').paras[0].runs;
    ok('md: new highlights use the deck color', (my.find(r => r.text === 'new') || {}).highlight === 'E9C46A', my);
    ok('md: html switched off keeps tags literal', my.map(r => r.text).join('').includes('<sub>x</sub>'), my);
    await throws('setDeck: fields outside the list', () => DJ.setDeck({stage: {w: 100, h: 100}}));
    await throws('setDeck: needs an object', () => DJ.setDeck('x'));
    const sd2 = await DJ.setDeck({markdown: null});
    ok('setDeck: null returns to the defaults', sd2.markdown.highlight === 'FFFF00' && sd2.markdown.syntax.html === true, sd2);
    await DJ.patch('pB', [{id: 'mdx', remove: true}]);
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

    // ---- 編號清單：畫布與匯出同一套流水號（規則照 PowerPoint 實測）----
    const NUM = (t, level, extra) => ({runs: [{text: t, sizePt: 40}], bullet: Object.assign({type: 'number', level}, extra || {})});
    await DJ.load({pages: [{id: 'nA', elements: [{id: 'list', type: 'text', x: 40, y: 40, w: 600, h: 640, paras: [
      NUM('a', 0, {startAt: 9}), NUM('b', 0), NUM('c', 1), NUM('d', 1), NUM('e', 0),
      {runs: [{text: 'plain'}]}, NUM('f', 0), NUM('g', 0, {startAt: 100})]}]}]});
    DJ.show('nA');
    const marks = [...document.querySelectorAll('#stage [data-id="list"] [data-mk="1"]')];
    ok('numbering: levels count separately, startAt only restarts',
      marks.map(m => m.textContent).join(' ') === '9. 10. 1. 2. 11. 1. 100.', marks.map(m => m.textContent));
    // 40pt 的「10.」比一層縮排寬：符號框要撐開而不是把「1」「0」「.」折成好幾行（一行約 64px）
    ok('numbering: a wide number stays on one line', marks.every(m => m.offsetHeight < 100), marks.map(m => m.offsetHeight));
    const nz = await JSZip.loadAsync(await (await DJ.exportPptx()).arrayBuffer());
    const starts = [...(await nz.file('ppt/slides/slide1.xml').async('string')).matchAll(/buAutoNum[^>]*startAt="(\d+)"/g)].map(m => m[1]);
    // PPT 看到相鄰同層段落 startAt 不同就重新起算，所以每段要寫「這組的起始值」
    ok('numbering: export writes the list start on every item', starts.join() === '9,9,1,1,9,1,100', starts);
    await DJ.load(fixture());

    // ---- 方程式段落：$$…$$、math 欄位、畫布 KaTeX、匯出 OMML、lint ----
    const Q = String.raw`x=\frac{-b\pm\sqrt{b^2-4ac}}{2a}`;
    await DJ.load({pages: [{id: 'mA', elements: [
      {id: 'solo', type: 'text', x: 40, y: 40, w: 600, h: 120, paras: [{md: '$$' + Q + '$$', runs: [{text: '', sizePt: 24, color: 'C00000'}]}]},
      {id: 'mix', type: 'text', x: 40, y: 200, w: 900, h: 400, paras: [
        {md: 'intro **text**'},
        {math: String.raw`\sum_{n=1}^{\infty}\frac{1}{n^2}=\frac{\pi^2}{6}`},
        {md: String.raw`$$\left(\frac{a}{b}\right)^2+\hat{x}+\text{in}+\sin h$$`, align: 'center'},
        {md: 'price NT$100 and $$ inside'},
        {md: String.raw`$$\frac{a$$`}]}]}]});
    DJ.show('mA');
    const mp = DJ.get('mA', 'mix').paras, sq = DJ.get('mA', 'solo').paras[0];
    ok('math: $$…$$ becomes an equation paragraph with the LaTeX in its run',
      sq.math === true && sq.runs.length === 1 && sq.runs[0].text === Q && sq.runs[0].sizePt === 24 && sq.runs[0].color === 'C00000', sq);
    ok('math: math given as a string is the same form', mp[1].math === true && mp[1].runs[0].text.startsWith(String.raw`\sum`), mp[1]);
    ok('math: $$ in the middle of a paragraph stays literal', !mp[3].math && mp[3].runs.map(r => r.text).join('') === 'price NT$100 and $$ inside', mp[3]);
    ok('math: canvas draws equations with KaTeX, a broken one in red', document.querySelectorAll('#stage [data-id="mix"] .katex').length === 2
      && document.querySelectorAll('#stage [data-id="mix"] .katex-error').length === 1 && document.querySelector('#stage [data-id="solo"] .katex .mfrac'));
    ok('math: outline shows the LaTeX', DJ.outline('mA').find(o => o.id === 'solo').text.startsWith('x=\\frac'));
    const ml = DJ.lint('mA');
    ok('lint: a broken equation is reported', ml.length === 1 && /mA\/mix: paragraph 5: the LaTeX cannot be parsed/.test(ml[0]), ml);
    ok('lint: LaTeX is not checked for line breaks', !ml.some(w => /line can break/.test(w)));
    const mz = await JSZip.loadAsync(await (await DJ.exportPptx()).arrayBuffer());
    const mx1 = await mz.file('ppt/slides/slide1.xml').async('string');
    const soloXml = mx1.slice(mx1.indexOf('name="solo"'), mx1.indexOf('</p:sp>', mx1.indexOf('name="solo"')));
    ok('export: a lone equation is a bare a14:m with a fraction and a radical',
      /<a14:m [^>]*><m:oMathPara/.test(soloXml) && soloXml.includes('<m:f>') && soloXml.includes('<m:rad>') && !mx1.slice(0, mx1.indexOf('name="solo"')).includes('<mc:Choice'), soloXml.slice(0, 300));
    ok('export: equation runs carry size and color, no italic flag', soloXml.includes('sz="2400"') && soloXml.includes('val="C00000"') && !/<m:r>(<m:rPr>.*?<\/m:rPr>)?<a:rPr[^>]* i="/.test(soloXml));
    ok('export: no fixed line spacing on equation paragraphs', !/<a:lnSpc>/.test(soloXml.slice(0, soloXml.indexOf('<a14:m'))));
    ok('export: a mixed box is wrapped with a LaTeX fallback', mx1.includes('Requires="a14"') && /<mc:Fallback>[\s\S]*\\sum_\{n=1\}/.test(mx1));
    ok('export: sum body goes inside m:nary', /<m:nary>[\s\S]*?<m:e><m:f>/.test(mx1));
    ok('export: \\left( \\right) becomes a stretching m:d', /<m:d><m:dPr><m:begChr m:val="\("\/><m:endChr m:val="\)"\/>/.test(mx1));
    ok('export: \\hat is an accent, \\text is normal text', /<m:acc><m:accPr><m:chr m:val="\u0302"\/>/.test(mx1) && /<m:rPr><m:nor\/><\/m:rPr><a:rPr[^>]*>[\s\S]*?<m:t>in<\/m:t>/.test(mx1));
    ok('export: \\sin h is a function, so the name does not run into h', /<m:func><m:funcPr>[\s\S]*?<m:fName>[\s\S]*?<m:t>sin<\/m:t>[\s\S]*?<\/m:fName><m:e>[\s\S]*?<m:t>h<\/m:t>/.test(mx1));
    ok('export: a broken equation stays as text', mx1.includes(String.raw`\frac{a</a:t>`));
    await DJ.setDeck({markdown: {syntax: {math: false}}});
    await DJ.patch('mA', [{id: 'solo', set: {paras: [{md: '$$x^2$$'}]}}]);
    ok('math: switched off keeps $$ literal', !DJ.get('mA', 'solo').paras[0].math && DJ.get('mA', 'solo').paras[0].runs[0].text === '$$x^2$$');
    await DJ.setDeck({markdown: null});

    // ---- 安全：簡報檔與貼上的內容不會被當成程式碼執行 ----
    // 每段攻擊內容一旦執行，就在 window.__djx 留下自己的標記。觸發方式比照使用者：
    // 點選元素、在圖表上移動與點擊、貼上表格。圖表的事件直接送給 ECharts 的 canvas，不經畫布上的遮罩
    window.__djx = [];
    const X = tag => `(window.__djx=window.__djx||[]).push('${tag}')`;
    const ATK = tag => `<img src=x onerror="${X(tag)}">`;
    const tick = ms => new Promise(r => setTimeout(r, ms));
    const pick = async id => {
      const b = document.querySelector(`#stage .el[data-id="${id}"]`), rc = b.getBoundingClientRect();
      const o = {clientX: rc.left + 3, clientY: rc.top + 3, bubbles: true, button: 0, pointerId: 1, isPrimary: true};
      b.dispatchEvent(new PointerEvent('pointerdown', o)); document.dispatchEvent(new PointerEvent('pointerup', o));
      await tick(100);
    };
    const BAD_ID = 'x"><img src=x onerror="' + X('id') + '">';
    const BAD_GID = 'g"><img src=x onerror="' + X('groupId') + '">';
    await DJ.load({title: 'sec', pages: [
      {id: 'sA', elements: [TEXT(BAD_ID, 40, 40, 300, 40, 'a'), TEXT(7, 40, 120, 300, 40, 'n'),
        {id: 'img', type: 'image', x: 40, y: 200, w: 40, h: 40, dataUrl: PX, natW: ATK('natW'), natH: ATK('natH')},
        TEXT('g1', 40, 560, 100, 40, 'g1', {groupId: BAD_GID}), TEXT('g2', 160, 560, 100, 40, 'g2', {groupId: BAD_GID}),
        {id: 'ch', type: 'chart', x: 400, y: 40, w: 600, h: 400, option: {
          title: {text: 'TITLE', link: 'java\tscript:' + X('title.link'), target: 'self',
            subtext: 'SUBTEXT', sublink: 'javascript:' + X('title.sublink'), subtarget: 'self'},
          toolbox: {feature: {dataView: {lang: [ATK('dataView0'), ATK('dataView1'), ATK('dataView2')]}, saveAsImage: {name: 'smoke-download'}}},
          tooltip: {trigger: 'item', renderMode: 'html', formatter: ATK('tooltip')},
          xAxis: {type: 'category', data: ['a', 'b', 'c']}, yAxis: {},
          series: [{type: 'bar', data: [3, {value: 2, tooltip: {formatter: ATK('tooltip.item')}}, 4]}]}},
        {id: 'ch2', type: 'chart', x: 400, y: 460, w: 400, h: 240, option: {
          baseOption: {tooltip: {renderMode: 'html', formatter: ATK('tooltip.base')}, xAxis: {type: 'category', data: ['a']}, yAxis: {}},
          media: [{option: {tooltip: {renderMode: 'html'}, series: [{type: 'bar', data: [1]}]}}]}}]},
      {id: 'sB', elements: [TEXT(BAD_ID, 40, 40, 300, 40, 'b')]}]});
    const idA = DJ.get('sA').elements[0].id, idB = DJ.get('sB').elements[0].id;
    ok('security: an element id outside [A-Za-z0-9_-] is replaced', /^[A-Za-z0-9_-]+$/.test(idA), idA);
    ok('security: the same bad id on two slides gets the same new id (Morph pairing)', idA === idB, [idA, idB]);
    ok('security: a numeric id becomes a string', DJ.get('sA').elements[1].id === '7', DJ.get('sA').elements[1].id);
    ok('security: non-numeric natW/natH are dropped', !('natW' in DJ.get('sA', 'img')) && !('natH' in DJ.get('sA', 'img')), DJ.get('sA', 'img'));
    DJ.show('sA'); await tick(100);
    for (const e of DJ.get('sA').elements) await pick(e.id);
    await pick(idA);
    ok('security: the property panel shows the replaced id', document.querySelector('#propPanel h4 .unit').textContent === idA);
    await pick('g1');
    ok('security: the group panel shows the group id as text', document.querySelector('#propPanel h4 .unit').textContent === BAD_GID);
    ok('security: selecting elements runs nothing', window.__djx.length === 0, window.__djx);
    // 點圖表上緣會點到工具列。下載鈕還在的版本會真的下載（ECharts 對一個帶 download 的 <a> 送 click），先攔住
    const downloads = [];
    const realDispatch = EventTarget.prototype.dispatchEvent, realClick = HTMLAnchorElement.prototype.click;
    EventTarget.prototype.dispatchEvent = function (ev) {
      if (this instanceof HTMLAnchorElement && this.hasAttribute('download')) { downloads.push(this.download); return true; }
      return realDispatch.call(this, ev);
    };
    HTMLAnchorElement.prototype.click = function () {
      if (this.hasAttribute('download')) { downloads.push(this.download); return; }
      return realClick.call(this);
    };
    try {
      for (const id of ['ch', 'ch2']) {
        const cv = document.querySelector(`#stage .el[data-id="${id}"] canvas`), rc = cv.getBoundingClientRect();
        const fire = (t, x, y) => cv.dispatchEvent(new MouseEvent(t, {clientX: rc.left + x * rc.width, clientY: rc.top + y * rc.height, bubbles: true}));
        for (let y = 0.01; y < 1; y += 0.04) for (let x = 0.01; x < 1; x += 0.03) fire('mousemove', x, y);
        // 上緣是標題、副標題與工具列（資料檢視鈕、下載鈕）
        for (let y = 0.005; y < 0.16; y += 0.012) for (let x = 0.005; x < 1; x += 0.01) for (const t of ['mousedown', 'mouseup', 'click']) fire(t, x, y);
        // 提示框再用 ECharts 自己的公開 API 逐點叫出一次。只靠上面的滑鼠移動會漏測：
        // 2026-10-13 實測，同一段移動在分頁不在前景時常常叫不出提示框，攻擊內容沒機會執行，測試卻照樣通過
        const inst = echarts.getInstanceByDom(cv.parentNode.parentNode);
        for (let i = 0; i < 3; i++) inst.dispatchAction({type: 'showTip', seriesIndex: 0, dataIndex: i});
      }
    } finally { EventTarget.prototype.dispatchEvent = realDispatch; HTMLAnchorElement.prototype.click = realClick; }
    await tick(300);
    ok('security: chart tooltip, dataView and title links do not run', window.__djx.length === 0, window.__djx);
    const tbFeat = ((echarts.getInstanceByDom(document.querySelector('#stage .el[data-id="ch"] canvas').parentNode.parentNode)
      .getOption().toolbox || [])[0] || {}).feature || {};
    ok('security: the canvas chart has no saveAsImage button, other toolbox features stay',
      !('saveAsImage' in tbFeat) && 'dataView' in tbFeat, Object.keys(tbFeat));
    ok('security: clicking the chart toolbar downloads nothing', downloads.length === 0, downloads);
    const nBefore = DJ.get('sA').elements.length;
    const dt = new DataTransfer();
    // 用 <img onerror> 以外的寫法：載入失敗的 <img> 會被當成「沒收進來的格內圖片」跳出提示，卡住測試
    dt.setData('text/html', `<html><head><style onload="${X('paste.style')}">.hl{font-weight:700}</style></head><body><table><tr>`
      + `<td class="hl"><svg><image href="x" onerror="${X('paste.svg')}"/></svg>A</td>`
      + `<td><details open ontoggle="${X('paste.details')}">B</details></td></tr><tr>`
      + `<td><video><source src="x" onerror="${X('paste.video')}"></video>C</td>`
      + `<td><img src="${PX}" width="20" height="20"></td></tr></table></body></html>`);
    document.dispatchEvent(new ClipboardEvent('paste', {clipboardData: dt, bubbles: true, cancelable: true}));
    await tick(1500);
    const added = DJ.get('sA').elements.slice(nBefore);
    ok('security: pasted HTML does not run', window.__djx.length === 0, window.__djx);
    ok('security: the pasted table still arrives, with its embedded image and class-based bold',
      added.length === 2 && added[0].type === 'table' && added[1].type === 'image' && added[0].cells[0][0].bold === true, added.map(e => e.type));
    // 型別不認得的元素：原樣保留、畫布不畫，型別只以文字出現在提示、圖層與屬性面板。載入時的提示是 alert，先攔下來
    const alerts = [], realAlert = window.alert;
    const UNK = {id: 'u1', type: ATK('type'), x: 40, y: 40, w: 100, h: 40, extra: {deep: [1, 2]}};
    window.alert = m => alerts.push(String(m));
    try { await DJ.load({title: 'unknown', pages: [{id: 'u', elements: [structuredClone(UNK), TEXT('t1', 40, 120, 200, 40, 't')]}]}); }
    finally { window.alert = realAlert; }
    ok('security: an unknown element type is kept with every field', JSON.stringify(DJ.get('u', 'u1')) === JSON.stringify(UNK), DJ.get('u', 'u1'));
    DJ.show('u'); await tick(100);
    ok('security: an unknown element type is not drawn', !document.querySelector('#stage [data-id="u1"]'));
    ok('security: loading names the unknown element', alerts.some(m => m.includes('u1')), alerts);
    const layersBtn = document.querySelector('#btnLayers');
    layersBtn.click(); await tick(100);
    const row = document.querySelector('#layerList .layerRow[data-id="u1"]');
    row.click(); await tick(100);
    ok('security: the layer list and property panel show the type as text',
      row.querySelector('.lname').textContent === UNK.type && document.querySelector('#propPanel h4').textContent.startsWith(UNK.type));
    layersBtn.click();
    ok('security: the unknown type runs nothing', window.__djx.length === 0, window.__djx);
    // 型別名是原型鍵（constructor、toString、__proto__）：查表只認表自己的鍵，否則會被當成認得的型別
    const PROTO = ['constructor', 'toString', '__proto__'];
    window.alert = m => alerts.push(String(m));
    try {
      await DJ.load({title: 'proto', pages: [{id: 'q', transition: {type: 'constructor'}, elements: [
        ...PROTO.map((t, i) => ({id: 'q' + i, type: t, x: 40, y: 40 + 60 * i, w: 100, h: 40, paras: {}})),
        TEXT('qt', 400, 40, 200, 40, 't')]}]});
    } finally { window.alert = realAlert; }
    DJ.show('q'); await tick(100);
    layersBtn.click(); await tick(100);
    const names = PROTO.map((t, i) => document.querySelector(`#layerList .layerRow[data-id="q${i}"] .lname`).textContent);
    const icons = PROTO.map((t, i) => document.querySelector(`#layerList .layerRow[data-id="q${i}"] .licon`).innerHTML);
    document.querySelector('#layerList .layerRow[data-id="q0"]').click(); await tick(100);
    const qh4 = document.querySelector('#propPanel h4').textContent;
    layersBtn.click();
    ok('security: prototype-key types show their own name in the layer list', JSON.stringify(names) === JSON.stringify(PROTO), names);
    ok('security: prototype-key types get the default layer icon', icons.every(h => h.includes('#ic-shape')), icons);
    ok('security: the property panel shows a prototype-key type by name', qh4.startsWith('constructor '), qh4);
    ok('security: prototype-key types are not drawn', PROTO.every((t, i) => !document.querySelector(`#stage [data-id="q${i}"]`)));
    const ql = DJ.lint('q');
    ok('security: lint reports prototype-key types as unknown', PROTO.every((t, i) => ql.some(w => w.startsWith(`q${i}.type: unknown element type`))), ql);
    ok('security: a prototype-key transition type is dropped', DJ.get('q').transition === null, DJ.get('q').transition);
    // 不分型別的讀取動詞對未知元素不拋錯（paras 不是陣列）
    let qo = null, qerr = null;
    try { qo = DJ.outline('q'); DJ.bbox('q', ['q0', 'qt']); DJ.overflow(); DJ.lint(); } catch (e) { qerr = e.message; }
    ok('security: outline, bbox, overflow and lint accept unknown elements as they are', !qerr && qo[0].unknown === true && qo[0].x === 40, qerr || qo[0]);
    // info（ready 回傳的也是它）掃整份的螢光色：未知元素的 paras 不是陣列也不拋錯
    let qi = null;
    try { DJ.info(); qi = await DJ.ready(); } catch (e) { qi = e.message; }
    ok('security: info and ready accept unknown elements as they are', qi && qi.pages === 1, qi);
    // 複製這幾個再貼上：不認得的型別一個都不進來
    const qdt = new DataTransfer();
    layersBtn.click(); await tick(100);
    document.querySelector('#layerList .layerRow[data-id="q1"]').click(); await tick(100);
    layersBtn.click();
    document.dispatchEvent(new ClipboardEvent('copy', {clipboardData: qdt, bubbles: true, cancelable: true}));
    const qn = DJ.get('q').elements.length;
    document.dispatchEvent(new ClipboardEvent('paste', {clipboardData: qdt, bubbles: true, cancelable: true}));
    await tick(200);
    ok('security: copy and paste does not bring in prototype-key types', qdt.getData('text/plain').includes('toString') && DJ.get('q').elements.length === qn,
      DJ.get('q').elements.map(e => e.type));
    ok('security: prototype-key types run nothing', window.__djx.length === 0, window.__djx);
    // 其他欄位的值是原型鍵：與不認得的值走同一條路，匯出不拋錯、不寫出不合法的值
    const PK = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const pkChart = (id, op) => ({id, type: 'chart', x: 600, y: 40, w: 300, h: 200,
      option: Object.assign({xAxis: {type: 'category', data: ['a']}, yAxis: {}, series: [{type: 'bar', data: [1]}]}, op)});
    await DJ.load({title: 'proto values', pages: [
      {id: 'k1', elements: [
        TEXT('kv', 40, 40, 200, 40, 'v', {vert: 'constructor', valign: 'toString', constructor: 1}),   // 最後一個是欄位名
        {id: 'ks', type: 'shape', shape: 'constructor', x: 40, y: 120, w: 60, h: 60},
        {id: 'kl', type: 'shape', shape: '__proto__', x: 140, y: 120, w: 60, h: 60},
        {id: 'kt', type: 'table', x: 40, y: 220, colW: [100], rowH: [30], cells: [[{text: 'c', valign: 'constructor'}]]},
        {id: 'km', type: 'text', x: 300, y: 40, w: 200, h: 40, paras: [{align: 'constructor', math: 'x^2'}]},
        {id: 'ki', type: 'image', x: 300, y: 120, w: 10, h: 10, natW: 1, natH: 1, dataUrl: 'data:constructor;base64,' + PK},
        pkChart('kc1', {series: [{type: 'constructor', data: [1]}]}),
      ]},
      {id: 'k2', transition: {type: 'morph', option: 'constructor'}, elements: [
        pkChart('kc2', {series: [{type: 'toString', data: [1]}, {type: 'bar', data: [2]}]}),
        pkChart('kc3', {toolbox: {feature: {magicType: {type: ['constructor', 'line']}}}}),
      ]},
    ]});
    const kp = DJ.get('k1');
    ok('security: prototype-key shapes become rect like any unknown shape',
      ['ks', 'kl'].every(id => kp.elements.find(e => e.id === id).shape === 'rect'), kp.elements.map(e => e.shape));
    ok('security: a prototype-key vert is dropped', !('vert' in kp.elements.find(e => e.id === 'kv')));
    DJ.show('k2'); await tick(200);
    ok('security: prototype-key chart types still draw on the canvas',
      ['kc2', 'kc3'].every(id => !/option/.test(document.querySelector(`#stage [data-id="${id}"]`).textContent)));
    let kx = null, kz = null;
    try { kz = await JSZip.loadAsync(await DJ.exportPptx()); } catch (e) { kx = e.message; }
    ok('security: export survives prototype-key shape, valign, chart and toolbox types', !kx, kx);
    if (kz) {
      const kall = (await Promise.all(Object.keys(kz.files).filter(n => /\.xml$/.test(n)).map(n => kz.file(n).async('string')))).join('\n');
      const kbad = kall.match(/="[^"]*(constructor|native code)[^"]*"/g) || [];
      ok('security: export writes no prototype-key values (morph option, math alignment, image type)', !kbad.length, kbad.slice(0, 3));
      ok('security: export names no media file after a prototype key', !Object.keys(kz.files).some(n => /constructor|function/.test(n)),
        Object.keys(kz.files).filter(n => /media/.test(n)));
    }
    const kd = await JSZip.loadAsync(await DJ.toBlob());
    ok('security: the saved deck names no asset after a prototype key', !Object.keys(kd.files).some(n => /constructor|function/.test(n)),
      Object.keys(kd.files));
    const kw = DJ.lint('k1');
    ok('security: lint hints never show a function for a prototype-key field name',
      kw.some(w => w.startsWith('kv.constructor')) && !kw.some(w => /native code|function/.test(w)), kw.filter(w => /constructor/.test(w)));
    delete window.__djx;
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
    await throws('save: no open file throws instead of opening a dialog', () => DJ.save());
  } catch (e) {
    ok('unexpected exception', false, e.stack || String(e));
  } finally {
    await DJ.load(original);
  }
  const failures = results.filter(r => !r.pass);
  return {pass: results.length - failures.length, fail: failures.length, failures};
}
