'use strict';
/* ================= 字體可用性提示 ================= */
function fontAvailable(name){
  const c=document.createElement('canvas').getContext('2d'), t=/*zh*/'0mW中永19';
  const w=f=>{ c.font=`400 100px ${f}`; return c.measureText(t).width; };
  return w(`"${name}", monospace`)!==w('monospace')||w(`"${name}", serif`)!==w('serif');
}
async function checkFonts(){
  const F=APP.deck.fonts||FONTS;
  const names=[...new Set([F.ea,F.latin,F.tableLatin])];
  try{ await document.fonts.ready; }catch(e){}
  const missing=names.filter(n=>!fontAvailable(n));
  // 明講後果：未安裝只影響「畫布預覽用替代字體」，匯出仍寫原字體名（在裝有該字體的電腦上就正確）
  $('#fontWarn').textContent= missing.length
    ? _t('⚠ 本機未安裝 {0}：畫布以替代字體預覽（折行位置可能不同），匯出仍寫原字體名',missing.join(_t('、')))
    : '';
  $('#fontWarn').title= missing.length? _t('安裝該字體、或在「全簡報設定 → 字體」改成本機已有的字體，預覽就會與輸出一致'):'';
}

/* ================= 總渲染 ================= */
function renderAll(){
  $('#deckTitle').value=APP.deck.title;
  applyStage(); applyFontVars(); renderZones(); renderGrid();   // 尺寸／字體／預留區／格線都可能被 JSON 或面板改動
  renderPanel(); renderStage(); renderProps(); updateUndoBtns();
  syncMelBtn();   // 母版可能剛被啟用／關閉，標示鈕的去留跟著變
  renderDeckSettings();   // 全簡報面板開著時跟著更新（關著會自己 return）
  setZoom(Math.round(APP.zoom*100));              // 投影片尺寸變了要重算置中邊距與工作區
  scheduleAutosave();   // 所有改動最後都會走到 renderAll，掛在這裡＝一個掛鉤覆蓋全部編輯路徑
}

/* ================= 測試掛鉤 ================= */
window.__state=()=>({title:APP.deck.title,fontMode:APP.deck.fontMode,pages:APP.deck.pages.length,
  page:APP.page,sel:APP.sel,selIds:APP.selIds,els:curEls().map(e=>({id:e.id,type:e.type,x:e.x,y:e.y,w:elSize(e).w,h:elSize(e).h}))});
window.__deckJson=()=>deckJson();
window.__loadDeck=j=>{ loadDeck(typeof j==='string'?JSON.parse(j):j); return 'loaded'; };
window.__export=()=>exportPptx(false);
window.__b64chunk=(i,n)=>window.__lastPptxB64.slice(i,i+n);

renderAll();
asRestore();   // 非同步：讀不到就維持空白簡報，讀得到就整份換掉（完成後才開啟自動存檔閘門）
// 開啟預設適寬（白色投影片填滿檢視區）；等佈局算好 clientWidth 再套（量不到就維持 65%）
setZoom(65);
requestAnimationFrame(()=>requestAnimationFrame(fitWidth));
window.addEventListener('load',()=>setTimeout(fitWidth,60));
checkFonts();
