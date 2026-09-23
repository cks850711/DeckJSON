'use strict';
/* ================= 快照匯出（html2canvas → PNG／JPG） ================= */
async function snapshotDataUrl(pg,fmt,scale){
  // 裁切模式的暗化與格線是編輯輔助，比照 selIds 一併關掉再拍（不關的話拍到的圖只有 35% 亮度）
  const wasPage=APP.page, wasSel=[...APP.selIds], wasCrop=APP.cropping;
  APP.page=pg.id; APP.selIds=[]; APP.cropping=null; renderStage();
  const prevT=stage.style.transform, prevM=stage.style.margin;
  stage.style.transform='none'; stage.style.margin='0'; stage.classList.add('capturing');
  // 把遮罩/輔助線暫時移出 DOM（html2canvas 1.4.1 對 display:none 半透明層仍會畫），擷取後放回原位
  const hideEls=[...stage.querySelectorAll('.outmask,.safezone,#selBox,#marquee')];
  const anchors=hideEls.map(el=>{ const a=document.createComment(''); el.parentNode.replaceChild(a,el); return a; });
  /* html2canvas 1.4.1 不認得 object-fit（border-radius 它倒是認得），用它裁切的圖會被
     整張壓扁畫出來 → 快照與畫布不一致。擷取前把該 <img> 換成一個「已依框比例裁好」的
     <canvas>，擷取後換回：與上面暫時移出輔助線同一套 try/finally 手法，不動資料模型。
     ⚠ 適用範圍自「圖片裁切改用 el.crop」後只剩**影片封面** .vcover——圖片元素已改走
       .imgc 的 overflow:hidden ＋ 絕對定位，那條路 html2canvas 本來就支援，不需要這個替身。
     ⚠ 換 <canvas> 而非改 img.src：改 src 要等新圖解碼，而 decode() 在這個時機不保證會 settle
       （實測會永遠 pending）；canvas 是現成點陣，html2canvas 直接複製，全程同步。
     用 computed style 判斷而非查 pg.elements，母版圖片（.mel）才一併涵蓋到。*/
  const covers=[];
  for(const im of stage.querySelectorAll('img')){
    if(getComputedStyle(im).objectFit!=='cover') continue;
    if(!(im.naturalWidth>0&&im.naturalHeight>0&&im.offsetWidth>0&&im.offsetHeight>0)) continue;
    const s=Math.max(im.offsetWidth/im.naturalWidth, im.offsetHeight/im.naturalHeight);
    const sw=Math.max(1,Math.round(im.offsetWidth/s)), sh=Math.max(1,Math.round(im.offsetHeight/s));
    const cv=document.createElement('canvas'); cv.width=sw; cv.height=sh;
    cv.getContext('2d').drawImage(im,(im.naturalWidth-sw)/2,(im.naturalHeight-sh)/2,sw,sh,0,0,sw,sh);
    cv.style.cssText='width:100%;height:100%;display:block';
    cv.style.borderRadius=getComputedStyle(im).borderRadius;   // 圓形裁切要跟著搬
    im.parentNode.replaceChild(cv,im);
    covers.push([im,cv]);
  }
  let url;
  try{
    const canvas=await html2canvas(stage,{width:STAGE_W,height:STAGE_H,scale,
      backgroundColor: fmt==='jpeg'? ('#'+(pg.bg||'FFFFFF')) : null});
    url=canvas.toDataURL(fmt==='jpeg'?'image/jpeg':'image/png',0.92);
  }finally{
    covers.forEach(([im,cv])=>{ if(cv.parentNode) cv.parentNode.replaceChild(im,cv); });
    anchors.forEach((a,i)=>a.parentNode.replaceChild(hideEls[i],a));
    stage.classList.remove('capturing'); stage.style.transform=prevT; stage.style.margin=prevM;
    APP.page=wasPage; APP.selIds=wasSel; APP.cropping=wasCrop; renderStage();
  }
  return url;
}
function dlUrl(url,name){ const a=document.createElement('a'); a.href=url; a.download=name; a.click(); }
$('#btnSnap').onclick=()=>{ $('#snapModal').hidden=false; };
$('#btnSnapClose').onclick=()=>$('#snapModal').hidden=true;
$('#btnSnapCur').onclick=async()=>{
  const fmt=document.querySelector('input[name=snapFmt]:checked').value, sc=+$('#snapScale').value; $('#snapModal').hidden=true;
  const url=await snapshotDataUrl(curPage(),fmt,sc);
  dlUrl(url,(APP.deck.title||'slide')+'-'+(APP.deck.pages.indexOf(curPage())+1)+'.'+(fmt==='jpeg'?'jpg':'png'));
};
$('#btnSnapAll').onclick=async()=>{
  const fmt=document.querySelector('input[name=snapFmt]:checked').value, sc=+$('#snapScale').value, ext=fmt==='jpeg'?'jpg':'png';
  const btn=$('#btnSnapAll'); btn.textContent=_t('匯出中…'); btn.disabled=true;
  try{
    const zip=new JSZip();
    for(let i=0;i<APP.deck.pages.length;i++){
      const url=await snapshotDataUrl(APP.deck.pages[i],fmt,sc);
      zip.file((APP.deck.title||'slide')+'-'+String(i+1).padStart(2,'0')+'.'+ext, url.split(',')[1], {base64:true});
    }
    const b64=await zip.generateAsync({type:'base64'});
    dlUrl('data:application/zip;base64,'+b64,(APP.deck.title||'slides')+'-snapshots.zip');
  }finally{ btn.textContent=_t('全部（zip）'); btn.disabled=false; $('#snapModal').hidden=true; }
};

