'use strict';
/* ================= 全簡報設定面板 =================
   判準：**跟著簡報 JSON 走的進這裡，存這台瀏覽器的進齒輪「偏好設定」**。
   這些設定多半開新簡報時設一次就不再動，本來各佔右欄一個分頁（「簡報」「輸出」），
   常駐擠掉真正每天在用的頁面屬性。樣式模式（deck.fontMode）原本錯放在偏好設定裡，
   它會被存進簡報檔，一併收進來。 */
function buildDeckSettings(pp){
    /* 母版（「信紙」）：一份共用元素墊在每一頁底下，改一處全部頁面跟著變。
       整份簡報層級的設定，故收在「全簡報」面板；逐頁的「本頁不套母版」留在右欄頁面樣式。 */
    pp.appendChild(secTitle(_t('母版')));
    /* 進出母版的入口一律在左側頁面欄底部（另有畫布下方的母版列可離開）。
       這裡只留「整份簡報怎麼套」的設定，不再重複放進出按鈕。 */
    if(APP.masterEdit){
      const mh=document.createElement('div'); mh.className='row';
      mh.innerHTML='<span class="unit">'+_t('正在編輯母版。這裡放的元素會出現在<b>每一頁</b>，'
        +'一般工具全部照用。改完按<b>左側頁面欄底部</b>或畫布下方的「完成，回到頁面」，'
        +'也可以直接點左邊任一頁縮圖離開。')+'</span>';
      pp.appendChild(mh);
    }else{
    pp.appendChild(checkRow([[_t('啟用母版'),()=>masterOn(),v=>{ commitUndo();
      masterEls(); APP.deck.master.on=!!v; renderAll(); syncPageJson(); },
      _t('把 Logo／頁尾等每頁都要的東西放在一份「信紙」上，改一次全部頁面跟著變')]]));
    if(masterOn()){
      const me=document.createElement('div'); me.className='row';
      me.innerHTML=_t('<span class="unit">編輯母版內容請按<b>左側頁面欄底部的「母版」</b>。</span>');
      pp.appendChild(me);
      const mr=document.createElement('div'); mr.className='row'; mr.innerHTML=_t('<label>匯出方式</label>');
      const ms=document.createElement('select');
      ms.innerHTML='<option value="master">'+_t('放在母版上（檔案小）')+'</option>'
                 +'<option value="flat">'+_t('畫進每一頁（可整張搬走）')+'</option>';
      ms.value=APP.deck.master.flatten? 'flat':'master';
      ms.onchange=()=>{ commitUndo(); APP.deck.master.flatten=(ms.value==='flat'); syncPageJson(); renderDeckSettings(); };
      mr.appendChild(ms); pp.appendChild(mr);
      const mn2=document.createElement('div'); mn2.className='row';
      mn2.innerHTML='<span class="unit">'+(APP.deck.master.flatten
        ? _t('匯出時把母版內容<b>實際畫進每一頁</b>：整份或單張投影片複製到別的簡報都帶得走，代價是圖片位元組每頁各存一份。')
        : _t('匯出時放在 PowerPoint 的<b>版面配置</b>上：檔案最小，但<b>單張投影片複製到別的簡報時不會跟著走</b>（整份寄出則正常）。'))
        +_t('　切換不會動到母版內容，可隨時來回比較。')+'</span>';
      pp.appendChild(mn2);
    }
    }
    /* 樣式模式：決定字體與頁碼／日期怎麼寫進 pptx。原本錯放在齒輪「偏好設定」裡，
       但它是 deck.fontMode，會被存進簡報檔，屬於這份簡報而不是這台瀏覽器。 */
    pp.appendChild(secTitle(_t('樣式模式')));
    const fmr=document.createElement('div'); fmr.className='row'; fmr.innerHTML=_t('<label>匯出樣式</label>');
    const fms=document.createElement('select'); fms.id='selFontMode';
    fms.innerHTML=_t('<option value="locked">鎖定樣式</option><option value="inherit">母版繼承</option>');
    fms.value=APP.deck.fontMode;
    fms.onchange=()=>{ commitUndo(); APP.deck.fontMode=fms.value; renderDeckSettings(); };
    fmr.appendChild(fms); pp.appendChild(fmr);
    const fmn=document.createElement('div'); fmn.className='row';
    fmn.innerHTML='<span class="unit">'+(APP.deck.fontMode==='inherit'
      ? _t('<b>母版繼承</b>：字體改成引用主題槽，頁碼與日期寫成不帶座標的空殼。貼到別的母版時，這些都由<b>那個母版</b>接手。')
      : _t('<b>鎖定樣式</b>：匯出時字體名與頁碼、日期的座標都寫死，貼到哪裡都長一樣。'))
      +_t('　字體名在下面的「字體（整份簡報）」設定。')+'</span>';
    pp.appendChild(fmn);
    /* 頁碼與日期是 PowerPoint 底部同一排的兩個佔位符，設定項目也一模一樣，故共用同一段建構程式。
       只有「自動更新／固定文字」是日期獨有的。 */
    for(const [key,def,label,onLabel,onHint] of [
      ['pageNum',PAGENUM_DEF,_t('頁碼'),_t('顯示頁碼'),_t('匯出為 PPT 原生頁碼欄位（放映／列印會自動更新）')],
      ['date',   DATE_DEF,   _t('日期'),_t('顯示日期'),_t('匯出為 PPT 原生日期佔位符（與頁碼同一排）')],
    ]){
      pp.appendChild(secTitle(label+''));
      const cfg=APP.deck[key];
      pp.appendChild(checkRow([[onLabel,()=>!!cfg,v=>{ commitUndo();
        if(v) APP.deck[key]={...def}; else delete APP.deck[key];
        renderAll(); },onHint]]));
      if(!cfg) continue;
      pp.appendChild(btnRow([
        [_t('左下'),()=>{ commitUndo(); cfg.pos='bl'; renderAll(); },'',cfg.pos==='bl'],
        [_t('中下'),()=>{ commitUndo(); cfg.pos='bc'; renderAll(); },'',cfg.pos==='bc'],
        [_t('右下'),()=>{ commitUndo(); cfg.pos='br'; renderAll(); },'',cfg.pos==='br'],
      ]));
      if(key==='date'){
        pp.appendChild(btnRow([
          [_t('自動更新'),()=>{ commitUndo(); cfg.fmt='auto'; renderAll(); },
            _t('開檔／放映時由 PowerPoint 重算（字樣跟著開檔那台電腦的地區設定）'),cfg.fmt!=='fixed'],
          [_t('固定文字'),()=>{ commitUndo(); cfg.fmt='fixed'; if(!cfg.text) cfg.text=dateText(); renderAll(); },
            _t('寫死一段文字，例如「2026 年度報告」'),cfg.fmt==='fixed'],
        ]));
        if(cfg.fmt==='fixed'){
          const r=document.createElement('div'); r.className='row';
          r.appendChild(Object.assign(document.createElement('label'),{textContent:_t('內容')}));
          const i=document.createElement('input'); i.type='text'; i.style.flex='1'; i.style.minWidth='70px';
          i.value=cfg.text||''; i.placeholder=_t('固定顯示的文字');
          i.onchange=()=>{ commitUndo(); cfg.text=i.value.trim().slice(0,60); renderAll(); };
          r.appendChild(i); pp.appendChild(r);
        }
      }
      pp.appendChild(numRow(_t('字級'),cfg.sizePt||def.sizePt,v=>{ cfg.sizePt=Math.max(6,Math.min(36,v)); },{min:6,max:36,step:1,unit:'pt'}));
      pp.appendChild(colorRow(_t('文字'),cfg.color||def.color,v=>{ cfg.color=v; renderAll(); },false));
      pp.appendChild(checkRow([[_t('首頁不顯示'),()=>!!cfg.skipFirst,v=>{ commitUndo();
        if(v) cfg.skipFirst=true; else delete cfg.skipFirst; renderAll(); },_t('封面通常不放{0}',label)]]));
      const nn=document.createElement('div'); nn.className='row';
      nn.innerHTML='<span class="unit">'+_t('畫布上的{0}只是<b>預覽</b>，點不到也選不起來，匯出時是 PowerPoint 原生的佔位符。',label)
        +_t('切到「母版繼承」之後，位置與字級會改由<b>目的端母版</b>的頁尾決定；畫布上顯示的，是這個檔自己打開時的樣子。')+'</span>';
      pp.appendChild(nn);
    }
    pp.appendChild(secTitle(_t('檔案資訊')));
    for(const [key,label,ph] of [['author',_t('作者'),_t('填入 pptx 檔案屬性')],['company',_t('公司'),''],['subject',_t('主旨'),'']]){
      const r=document.createElement('div'); r.className='row';
      r.appendChild(Object.assign(document.createElement('label'),{textContent:label}));
      const i=document.createElement('input'); i.type='text'; i.style.flex='1'; i.style.minWidth='70px';
      if(ph) i.placeholder=ph;
      i.value=APP.deck[key]||''; i.title=_t('寫入 docProps（Finder／PowerPoint「資訊」看得到）');
      i.onchange=()=>{ const v=i.value.trim(); if(v) APP.deck[key]=v; else delete APP.deck[key]; };
      r.appendChild(i); pp.appendChild(r);
    }
    const mn2=document.createElement('div'); mn2.className='row';
    mn2.innerHTML=_t('<span class="unit">標題取自頂端的「簡報標題」欄。下面三欄留空的話，那一欄就不寫進檔案屬性。</span>');
    pp.appendChild(mn2);
    // ── 投影片尺寸（整份簡報）：預設值或自訂 px；改尺寸不會搬動既有元素，需自行重排 ──
    pp.appendChild(secTitle(_t('投影片尺寸')));
    const st=APP.deck.stage, pre=stagePresetOf(st.w,st.h);
    pp.appendChild(btnRow(STAGE_PRESETS.map(p=>[p.key.replace('x',':'),
      ()=>{ commitUndo(); APP.deck.stage={w:p.w,h:p.h}; renderAll(); },p.label,pre&&pre.key===p.key])));
    pp.appendChild(numRow(_t('寬'),st.w,v=>{ APP.deck.stage={...APP.deck.stage,w:Math.round(v)}; renderAll(); },{min:160,max:4000,step:16,unit:'px'}));
    pp.appendChild(numRow(_t('高'),st.h,v=>{ APP.deck.stage={...APP.deck.stage,h:Math.round(v)}; renderAll(); },{min:120,max:4000,step:16,unit:'px'}));
    const stn=document.createElement('div'); stn.className='row';
    stn.innerHTML=`<span class="unit">${(st.w/96*2.54).toFixed(2)} × ${(st.h/96*2.54).toFixed(2)} cm`
      +(pre?_t('（標準 {0}）',pre.key.replace('x',':')):_t('（自訂比例，匯出的 sldSz 不標準型別名）'))
      +_t('。改尺寸<b>不會自動搬動既有元素</b>，需自行重排。')+'</span>';
    pp.appendChild(stn);
    // ── 字體（整份簡報）：三槽任意字體名；預覽用 CSS 變數即時反映，匯出寫同一個字體名 ──
    pp.appendChild(secTitle(_t('字體')));
    for(const [key,label,tip] of [['ea',_t('中文'),_t('中日韓文字（匯出寫 <a:ea>）')],
        ['latin',_t('英數'),_t('拉丁字母與數字（匯出寫 <a:latin>／<a:cs>）')],
        ['tableLatin',_t('表格英數'),_t('表格內的英數字體，可與正文不同')]]){
      const r=document.createElement('div'); r.className='row';
      r.appendChild(Object.assign(document.createElement('label'),{textContent:label}));
      const i=document.createElement('input'); i.type='text'; i.style.flex='1'; i.style.minWidth='70px';
      i.value=APP.deck.fonts[key]||''; i.title=_t('{0}。填本機已安裝的字體名，預覽才會一致；未安裝仍可匯出。',tip);
      i.onchange=()=>{ const v=i.value.trim(); if(!v){ i.value=APP.deck.fonts[key]; return; }
        commitUndo(); APP.deck.fonts={...APP.deck.fonts,[key]:v}; renderAll(); checkFonts(); };
      r.appendChild(i); pp.appendChild(r);
    }
    const lgr=document.createElement('div'); lgr.className='row';
    lgr.appendChild(Object.assign(document.createElement('label'),{textContent:_t('語言')}));
    const lgi=document.createElement('input'); lgi.type='text'; lgi.style.flex='1'; lgi.style.minWidth='70px';
    lgi.value=APP.deck.lang||''; lgi.placeholder='zh-TW';
    lgi.title=_t('寫入每個文字 run 的 lang 屬性，決定 PowerPoint 用哪國拼字檢查／斷字規則');
    lgi.onchange=()=>{ const v=lgi.value.trim();
      if(!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(v)){ lgi.value=APP.deck.lang; alert(_t('語言標記格式應如 zh-TW、en-US、ja-JP')); return; }
      commitUndo(); APP.deck.lang=v; };
    lgr.appendChild(lgi); pp.appendChild(lgr);
    // ── 預留區（整份簡報）：母版上不該被壓到的區域（Logo／頁尾…），純畫布輔助，不寫入 pptx ──
    pp.appendChild(secTitle(_t('預留區')));
    const zs=APP.deck.zones||[];
    zs.forEach((z,zi)=>{
      const hr=document.createElement('div'); hr.className='row';
      const zn=document.createElement('input'); zn.type='text'; zn.value=z.name; zn.style.flex='1'; zn.style.minWidth='60px';
      zn.title=_t('預留區名稱（侵入時的警告文字用）');
      zn.onchange=()=>{ commitUndo(); z.name=zn.value.trim()||_t('預留區'); renderAll(); };
      const zd=document.createElement('button'); zd.textContent='✕'; zd.title=_t('刪除此預留區');
      zd.onclick=()=>{ commitUndo(); APP.deck.zones.splice(zi,1); renderAll(); };
      hr.appendChild(zn); hr.appendChild(zd); pp.appendChild(hr);
      // 四個座標擠成兩列（面板只有 220px 寬）；改完走 renderAll，虛線框才會跟著移動
      const zRow=(a,b)=>{
        const r=document.createElement('div'); r.className='row'; r.style.gap='3px';
        for(const [k,lab] of [a,b]){
          const lb=document.createElement('label'); lb.textContent=lab; lb.style.minWidth='auto'; r.appendChild(lb);
          const i=document.createElement('input'); i.type='number'; i.style.width='44px'; i.value=z[k];
          i.min=(k==='w'||k==='h')?1:-2000; i.max=4000;
          i.onchange=()=>{ let v=Math.round(parseFloat(i.value)||0);
            if((k==='w'||k==='h')&&v<1) v=1;
            commitUndo(); z[k]=Math.min(4000,v); renderAll(); };
          r.appendChild(i);
        }
        return r;
      };
      pp.appendChild(zRow(['x','X'],['y','Y']));
      pp.appendChild(zRow(['w',_t('寬')],['h',_t('高')]));
    });
    pp.appendChild(btnRow([[_t('＋ 預留區'),()=>{ commitUndo();
      APP.deck.zones=[...(APP.deck.zones||[]),{name:_t('預留區{0}',(APP.deck.zones||[]).length+1),
        x:Math.round(STAGE_W*0.75),y:0,w:Math.round(STAGE_W*0.24),h:Math.round(STAGE_H*0.16)}];
      renderAll(); },_t('新增一塊不該被內容壓到的區域（如 Logo 位、頁尾）')]]));
    const zn2=document.createElement('div'); zn2.className='row';
    zn2.innerHTML='<span class="unit">'+_t('預留區只是<b>畫布輔助線與吸附</b>（元素壓到會變紅警告，不阻擋），<b>不寫入 pptx</b>。')
      +(zs.length?'':_t('目前沒有預留區——若你的母版右上有 Logo、底部有頁尾，在這裡加上對應方框即可。'))+'</span>';
    pp.appendChild(zn2);
    // ── 環境設定檔（profile）：把上面這些客製化整包存下／載入，並可設為新簡報的預設 ──
    pp.appendChild(secTitle(_t('環境設定檔（profile）')));
    pp.appendChild(btnRow([
      [{ic:'ic-download',txt:_t('匯出')},()=>saveProfileFile(),_t('把尺寸／預留區／字體／語言／頁碼／日期／檔案屬性存成 .profile.json')],
      [{ic:'ic-upload',txt:_t('載入')},()=>$('#profileInput').click(),_t('載入 .profile.json 套用到本簡報')],
    ]));
    pp.appendChild(btnRow([
      [{ic:'ic-star',txt:_t('設為新簡報預設')},()=>{ const p=profileFromDeck(APP.deck);
        if(lsSet(PROFILE_KEY,JSON.stringify(p))) alert(_t('已記住：之後「新簡報」會沿用目前的尺寸／預留區／字體／語言設定。'));
        else alert(_t('這個瀏覽器環境不允許寫入 localStorage（例如以 file:// 開啟時），設定無法記住。請改用「匯出 profile」保存。')); },
        _t('存進這台瀏覽器，之後新建簡報自動帶入')],
    ]));
    if(lsGet(PROFILE_KEY)) pp.appendChild(btnRow([[_t('清除已記住的預設'),()=>{
      try{ localStorage.removeItem(PROFILE_KEY); }catch(e){}
      renderProps(); },_t('恢復中性出廠值')]]));
    const pfn=document.createElement('div'); pfn.className='row';
    pfn.innerHTML='<span class="unit">'+_t('目前設定檔：<b>{0}</b>。',(APP.deck.profileName||_t('預設')).replace(/</g,'&lt;'))
      +_t('設定跟著這份簡報的 JSON 走，所以貼給 AI 再貼回來不會掉。')+'</span>';
    pp.appendChild(pfn);
}

/* 面板每次開啟都重建：裡頭多數區塊會依當前 deck 狀態長不一樣（有沒有背景圖、
   母版開了沒），沿用 renderProps 的「全量重建」作法最不容易對不上。 */
function renderDeckSettings(){
  const b=$('#deckBody'); if(!b||$('#deckModal').hidden) return;
  b.innerHTML=''; buildDeckSettings(b);
  /* 兩欄排版的前置：把 secTitle 到下一個 secTitle 之間的節點包成一格。
     沒有這一步，CSS column 會從區塊中間切開，標題留在左欄、控件跑到右欄。 */
  const kids=[...b.childNodes]; const secs=[]; let cur=null;
  for(const n of kids){
    if(n.nodeType===1&&n.classList.contains('secTitle')){ cur=document.createElement('div'); cur.className='dsec'; secs.push(cur); }
    if(!cur){ cur=document.createElement('div'); cur.className='dsec'; secs.push(cur); }
    cur.appendChild(n);
  }
  b.innerHTML=''; for(const d of secs) b.appendChild(d);
}
function openDeckSettings(){ $('#deckModal').hidden=false; renderDeckSettings(); }
function closeDeckSettings(){ $('#deckModal').hidden=true; renderAll(); }

