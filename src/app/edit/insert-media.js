'use strict';
/* ================= 插入影片、拖放與貼上圖片 =================
   從 media/video.js 分出來的介面接線：影片對話框的按鈕、換封面，以及整頁的拖放與圖片貼上。
   它們會新增元素、重畫畫面，屬互動層；media/video.js 只留影片本身的資料與封面產生。
   ⚠ 載入順序必須緊接在 media/video.js 之後、edit/clipboard.js 之前：document 的 paste
   監聽器依註冊順序執行，圖片貼上要先看到剪貼簿有沒有表格再讓位（見下方說明）。 */
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

