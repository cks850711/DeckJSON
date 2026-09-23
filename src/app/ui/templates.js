'use strict';
/* ================= 範本庫（插入版型頁；文字帶 role） ================= */
function tplText(x,y,w,h,text,sizePt,role,opts){ opts=opts||{};
  return {id:uid('e'),type:'text',x,y,w,h,valign:opts.valign||'top',fill:null,lineColor:null,role,
    paras:mkParas(text,{sizePt,bold:!!opts.bold,color:opts.color||'1A1A1A',align:opts.align||'left'})}; }
const TEMPLATES=[
  {name:_t('標題頁'),build:()=>({elements:[
    tplText(140,250,1000,90,_t('簡報標題'),44,'title',{bold:true,align:'center'}),
    tplText(140,360,1000,50,_t('副標題 ／ 講者 ／ 日期'),22,'caption',{align:'center',color:'666666'})]})},
  {name:_t('標題＋內文'),build:()=>({elements:[
    tplText(80,60,1120,70,_t('章節標題'),32,'title',{bold:true}),
    tplText(80,160,1120,480,_t('• 內文重點一\n• 內文重點二\n• 內文重點三'),22,'body')]})},
  {name:_t('兩欄'),build:()=>({elements:[
    tplText(80,60,1120,70,_t('章節標題'),32,'title',{bold:true}),
    tplText(80,160,540,480,_t('左欄內容'),20,'body'),
    tplText(660,160,540,480,_t('右欄內容'),20,'body')]})},
  {name:_t('圖表頁'),build:()=>({elements:[
    tplText(80,60,1120,70,_t('數據標題'),32,'title',{bold:true}),
    {id:uid('e'),type:'chart',x:120,y:160,w:1040,h:480,option:structuredClone(SAMPLE_CHART)}]})},
  {name:_t('章節分隔'),build:()=>({bg:'2A3A4A',elements:[
    tplText(140,300,1000,60,'01',40,'caption',{color:'8AB4D8',bold:true}),
    tplText(140,360,1000,90,_t('章節名稱'),40,'title',{color:'FFFFFF',bold:true})]})},
];
function openTemplateModal(){
  const g=$('#tplGrid'); g.innerHTML='';
  for(const t of TEMPLATES){
    const b=document.createElement('button'); b.textContent=t.name; b.style.cssText='padding:14px 18px';
    b.onclick=()=>{ commitUndo(); const spec=t.build(); const pg=newPage(); if(spec.bg)pg.bg=spec.bg; pg.elements=spec.elements; pg.name=t.name;
      const at=APP.deck.pages.indexOf(curPage())+1; APP.deck.pages.splice(at,0,pg); $('#tplModal').hidden=true; setPage(pg.id); };
    g.appendChild(b);
  }
  $('#tplModal').hidden=false;
}
$('#btnTplClose').onclick=()=>$('#tplModal').hidden=true;

