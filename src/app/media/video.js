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
