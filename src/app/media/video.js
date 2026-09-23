'use strict';
/* ================= 影片元素 =================
   兩種模式，位元組都不進 JSON：
   - mode:'online'：YouTube。匯出走 addMedia({type:'online',link})，pptx 只寫一條 TargetMode="External"
     的關聯＋一張封面圖，不含任何影片位元組。播放時需要網路。
   - mode:'local' ：本機影片。完全不呼叫 addMedia，只放封面圖（addImage）＋替代文字／備忘稿／匯出清單
     三路提示，請使用者在 PowerPoint 換成真影片。原因：20MB 的 mp4 base64 後約 27MB，
     會直接破壞「整份 JSON 可以貼給 AI」這個核心用法。 */
let COVER_TARGET=null, VID_RECOVER=null;
function drawFallbackCover(w,h,label){
  const cv=document.createElement('canvas'); cv.width=Math.max(160,Math.round(w)); cv.height=Math.max(90,Math.round(h));
  const c=cv.getContext('2d');
  c.fillStyle='#20242c'; c.fillRect(0,0,cv.width,cv.height);
  const r=Math.min(cv.width,cv.height)*0.16, cx=cv.width/2, cy=cv.height/2-(label?8:0);
  c.fillStyle='rgba(255,255,255,.82)'; c.beginPath();
  c.moveTo(cx-r*0.5,cy-r); c.lineTo(cx+r*0.75,cy); c.lineTo(cx-r*0.5,cy+r); c.closePath(); c.fill();
  if(label){ c.fillStyle='rgba(255,255,255,.7)'; c.font=`${Math.max(11,Math.round(cv.height*0.06))}px sans-serif`;
    c.textAlign='center'; c.fillText(String(label).slice(0,40),cx,cy+r+Math.round(cv.height*0.12)); }
  return cv.toDataURL('image/png');
}
/* 從影片檔抓一格當封面：URL.createObjectURL → <video> seek → canvas.drawImage。
   只有這一格進 JSON，原始檔連讀進記憶體都不需要（<video> 走串流解碼）。
   瀏覽器解不了的編碼（部分 .mov／HEVC）會 seek 失敗或畫出全黑 → 明確回傳 null，由呼叫端走 fallback。*/
function grabVideoFrame(file){
  return new Promise(res=>{
    const url=URL.createObjectURL(file);
    const v=document.createElement('video');
    v.preload='metadata'; v.muted=true; v.playsInline=true; v.src=url;
    let done=false;
    const finish=out=>{ if(done) return; done=true; URL.revokeObjectURL(url); v.removeAttribute('src'); res(out); };
    const timer=setTimeout(()=>finish(null),8000);   // 解不開就別讓使用者一直等
    v.onerror=()=>{ clearTimeout(timer); finish(null); };
    v.onloadedmetadata=()=>{
      const meta={name:file.name,durationSec:isFinite(v.duration)?Math.round(v.duration):0,
        natW:v.videoWidth||0,natH:v.videoHeight||0};
      if(!meta.natW||!meta.natH){ clearTimeout(timer); finish({meta,cover:null}); return; }
      v.onseeked=()=>{
        clearTimeout(timer);
        try{
          const cv=document.createElement('canvas');
          cv.width=Math.min(1280,meta.natW); cv.height=Math.round(cv.width*meta.natH/meta.natW);
          const c=cv.getContext('2d'); c.drawImage(v,0,0,cv.width,cv.height);
          // 全黑判定：取樣 200 點，全部近黑就當抓失敗（部分編碼會 seek 成功卻畫出空白）
          const d=c.getImageData(0,0,cv.width,cv.height).data;
          let lit=0; const step=Math.max(4,Math.floor(d.length/4/200)*4);
          for(let i=0;i<d.length;i+=step) if(d[i]+d[i+1]+d[i+2]>36) lit++;
          finish({meta,cover: lit>2? cv.toDataURL('image/jpeg',0.82) : null});
        }catch(err){ finish({meta,cover:null}); }
      };
      v.currentTime=Math.min(Math.max(0.1,(meta.durationSec||1)*0.1),Math.max(0.1,(v.duration||1)-0.1));
    };
  });
}
function videoFrame(natW,natH){   // 插入時的預設框：置中、寬約半個畫布、依原始比例
    const w=Math.round(STAGE_W*0.5);
    const h=Math.round(w*((natW&&natH)? natH/natW : 9/16));
    return {x:Math.round((STAGE_W-w)/2),y:Math.round((STAGE_H-h)/2),w,h};
}
$('#btnAddVideo').onclick=()=>{ $('#vidUrl').value=''; $('#videoModal').hidden=false; };
$('#btnVideoClose').onclick=()=>{ $('#videoModal').hidden=true; };
$('#btnVideoOnline').onclick=()=>{
  const em=ytEmbed($('#vidUrl').value);
  if(!em){ alert(_t('無法解析成 YouTube 影片網址。\n可貼 https://www.youtube.com/watch?v=…、https://youtu.be/… 或 embed 形式。')); return; }
  $('#videoModal').hidden=true;
  const f=videoFrame(16,9);
  addEl({id:uid('e'),type:'video',mode:'online',embed:em,cover:drawFallbackCover(f.w,f.h,_t('YouTube 影片')),...f});
};
$('#btnVideoLocal').onclick=()=>{ VID_RECOVER=null; $('#vidInput').click(); };
$('#vidInput').addEventListener('change',async e=>{
  const f=e.target.files[0]; e.target.value='';
  const recover=VID_RECOVER; VID_RECOVER=null;
  if(!f) return;
  $('#videoModal').hidden=true;
  const got=await grabVideoFrame(f);
  if(!got){ alert(_t('這個影片檔瀏覽器解不開（常見於部分 .mov／HEVC 編碼），無法自動抓封面。\n'
    +'仍會插入影片佔位框，請用「換封面圖」自行指定一張圖。')); }
  const meta=(got&&got.meta)||{name:f.name,durationSec:0,natW:0,natH:0};
  if(recover){
    const el=curEls().find(x=>x.id===recover);
    if(!el) return;
    commitUndo(); el.src=meta;
    el.cover=(got&&got.cover)||drawFallbackCover(el.w,el.h,meta.name);
    renderAll(); renderProps(); return;
  }
  const fr=videoFrame(meta.natW,meta.natH);
  addEl({id:uid('e'),type:'video',mode:'local',src:meta,
    cover:(got&&got.cover)||drawFallbackCover(fr.w,fr.h,meta.name),...fr});
});
$('#coverInput').addEventListener('change',async e=>{
  const f=e.target.files[0]; e.target.value='';
  const id=COVER_TARGET; COVER_TARGET=null;
  if(!f||!id) return;
  const el=curEls().find(x=>x.id===id); if(!el) return;
  const dataUrl=await new Promise(res=>{ const rd=new FileReader(); rd.onload=()=>res(rd.result); rd.readAsDataURL(f); });
  commitUndo(); el.cover=dataUrl; renderAll(); renderProps();
});

/* 拖放與貼上圖片 */
document.body.addEventListener('dragover',e=>e.preventDefault());
document.body.addEventListener('drop',async e=>{
  e.preventDefault();
  const fs=[...(e.dataTransfer.files||[])];
  /* 簡報檔比圖片優先。.deck 不是註冊過的 MIME 型別，File.type 會是空字串，只能認副檔名；
     舊的 .deck.json 與純 .json 一併收下，是不是簡報檔交給 openDeckFile 判斷並回報。 */
  const di=fs.findIndex(f=>/\.(deck|json)$/i.test(f.name));
  if(di>=0){
    /* getAsFileSystemHandle() 必須在讓出執行權之前呼叫——第一個 await 之後 dataTransfer.items
       就作廢了。先拿到 promise，await 留到後面。 */
    const it=(e.dataTransfer.items||[])[di];
    const hp=(FS_OK&&it&&it.getAsFileSystemHandle)? it.getAsFileSystemHandle():null;
    await openDeckFile(fs[di],true, hp? await hp.catch(()=>null):null);
    return;
  }
  const f=fs.find(f=>/^image\/(png|jpeg)$/.test(f.type));
  if(f){
    const r=stage.getBoundingClientRect();
    await insertImageFile(f,(e.clientX-r.left)/APP.zoom,(e.clientY-r.top)/APP.zoom);
  }
});
document.addEventListener('paste',async e=>{
  if(APP.editing||/INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
  /* 圖片是**最後的退路**，不是第一順位。Excel／PowerPoint／Word 複製任何東西（表格、文字框、形狀）
     都會順便附一份 image/png 的圖像版本；先到先贏的話，從 Office 貼過來永遠只會得到一張不能編輯的圖。
     剪貼簿裡有 <table> 就讓給下面的表格分支，真正複製圖片時沒有 table，行為不變。*/
  if(clipHasTable(e)) return;
  const it=[...(e.clipboardData.items||[])].find(i=>/^image\/(png|jpeg)$/.test(i.type));
  if(it){ e.preventDefault(); await insertImageFile(it.getAsFile()); }
});

