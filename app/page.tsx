"use client";
import React, { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "./lib/supabase";

// ── Types ──────────────────────────────────────────────────────────────────────
interface ImgFile { id:string; file:File; url:string; name:string; cropData?:{x:number;y:number;w:number;h:number}; }
type CropMode   = "fill"|"fit"|"stretch"|"none";
type SizeUnit   = "px"|"%";
type OutputFmt  = "jpeg"|"png"|"webp";
type View       = "home"|"resizer";

const FREE_LIMIT = 3;
const WARN_AT    = 2;

// ── Design tokens ──────────────────────────────────────────────────────────────
const T = {
  bg:"#1C1917", bg2:"#231F1C", bg3:"#2a2520",
  border:"rgba(250,247,242,0.08)", borderHi:"rgba(250,247,242,0.16)",
  text:"#FAF7F2", muted:"rgba(250,247,242,0.38)",
  accent:"#C9A84C", accentDim:"rgba(201,168,76,0.14)", accentBorder:"rgba(201,168,76,0.32)",
  red:"#e05252", green:"#52c472",
};

// ── Social media presets ───────────────────────────────────────────────────────
const PRESETS = [
  { cat:"Instagram",   items:[
    {name:"Post Square",   w:1080,h:1080,tag:"1:1"},
    {name:"Post Portrait", w:1080,h:1350,tag:"4:5"},
    {name:"Story / Reel",  w:1080,h:1920,tag:"9:16"},
    {name:"Landscape",     w:1080,h:566, tag:"1.91:1"},
  ]},
  { cat:"Twitter / X",  items:[
    {name:"Post",          w:1600,h:900, tag:"16:9"},
    {name:"Header",        w:1500,h:500, tag:"3:1"},
    {name:"Profile",       w:400, h:400, tag:"1:1"},
  ]},
  { cat:"Facebook",     items:[
    {name:"Post",          w:1200,h:630, tag:"~1.9:1"},
    {name:"Cover",         w:820, h:312, tag:"~2.6:1"},
    {name:"Profile",       w:170, h:170, tag:"1:1"},
    {name:"Event cover",   w:1920,h:1005,tag:"~1.9:1"},
  ]},
  { cat:"YouTube",      items:[
    {name:"Thumbnail",     w:1280,h:720, tag:"16:9"},
    {name:"Channel banner",w:2560,h:1440,tag:"16:9"},
    {name:"Profile",       w:800, h:800, tag:"1:1"},
  ]},
  { cat:"LinkedIn",     items:[
    {name:"Post",          w:1200,h:628, tag:"~1.9:1"},
    {name:"Cover",         w:1584,h:396, tag:"4:1"},
    {name:"Profile",       w:400, h:400, tag:"1:1"},
  ]},
  { cat:"TikTok",       items:[
    {name:"Video cover",   w:1080,h:1920,tag:"9:16"},
    {name:"Profile",       w:200, h:200, tag:"1:1"},
  ]},
  { cat:"Pinterest",    items:[
    {name:"Pin",           w:1000,h:1500,tag:"2:3"},
    {name:"Square",        w:1000,h:1000,tag:"1:1"},
  ]},
  { cat:"Standaard",    items:[
    {name:"HD 720p",       w:1280,h:720, tag:"16:9"},
    {name:"Full HD 1080p", w:1920,h:1080,tag:"16:9"},
    {name:"4K UHD",        w:3840,h:2160,tag:"16:9"},
    {name:"A4 web",        w:794, h:1123,tag:"A4"},
    {name:"Vierkant 1K",   w:1000,h:1000,tag:"1:1"},
    {name:"Vierkant 2K",   w:2000,h:2000,tag:"1:1"},
  ]},
];

const CROP_OPTIONS = [
  {value:"fill" as CropMode,   label:"Bijsnijden (Fill)",  desc:"Vult het canvas volledig, snijdt bij indien nodig"},
  {value:"fit" as CropMode,    label:"Inpassen (Fit)",     desc:"Hele afbeelding zichtbaar, letterboxed"},
  {value:"stretch" as CropMode,label:"Uitrekken (Stretch)",desc:"Past aan zonder bijsnijden, vervormt mogelijk"},
  {value:"none" as CropMode,   label:"Origineel",          desc:"Behoudt originele afmetingen"},
];

// ── Crop Preview Component ─────────────────────────────────────────────────────
function CropPreview({img, width, height, onClose, onConfirm}: {img:ImgFile;width:number;height:number;onClose:()=>void;onConfirm:(c:{x:number;y:number;w:number;h:number})=>void}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgSz, setImgSz] = useState({w:0,h:0});
  const [crop, setCrop] = useState({x:0,y:0,w:0,h:0});
  const action = useRef<null|"move"|"nw"|"ne"|"sw"|"se">(null);
  const drag   = useRef({mx:0,my:0,crop:{x:0,y:0,w:0,h:0}});
  const cl = (v:number,mn:number,mx:number)=>Math.max(mn,Math.min(mx,v));

  const onLoad = () => {
    const el = imgRef.current!;
    const iw=el.clientWidth, ih=el.clientHeight;
    setImgSz({w:iw,h:ih});
    const sc=Math.min(iw/(el.naturalWidth||width),ih/(el.naturalHeight||height));
    const cw=Math.min(width*sc,iw),ch=Math.min(height*sc,ih);
    setCrop({x:(iw-cw)/2,y:(ih-ch)/2,w:cw,h:ch});
  };

  const startA = (e:React.MouseEvent,type:"move"|"nw"|"ne"|"sw"|"se")=>{e.preventDefault();e.stopPropagation();action.current=type;drag.current={mx:e.clientX,my:e.clientY,crop:{...crop}};};
  const onMove = (e:React.MouseEvent)=>{
    if(!action.current) return;
    const dx=e.clientX-drag.current.mx,dy=e.clientY-drag.current.my,c={...drag.current.crop},mn=30;
    if(action.current==="move") setCrop({...c,x:cl(c.x+dx,0,imgSz.w-c.w),y:cl(c.y+dy,0,imgSz.h-c.h)});
    else if(action.current==="se") setCrop({...c,w:cl(c.w+dx,mn,imgSz.w-c.x),h:cl(c.h+dy,mn,imgSz.h-c.y)});
    else if(action.current==="sw"){const nw=cl(c.w-dx,mn,c.x+c.w);setCrop({...c,x:c.x+c.w-nw,w:nw,h:cl(c.h+dy,mn,imgSz.h-c.y)});}
    else if(action.current==="ne"){const nh=cl(c.h-dy,mn,c.y+c.h);setCrop({...c,y:c.y+c.h-nh,w:cl(c.w+dx,mn,imgSz.w-c.x),h:nh});}
    else if(action.current==="nw"){const nw=cl(c.w-dx,mn,c.x+c.w),nh=cl(c.h-dy,mn,c.y+c.h);setCrop({x:c.x+c.w-nw,y:c.y+c.h-nh,w:nw,h:nh});}
  };
  const onUp = ()=>{action.current=null;};
  const confirm = ()=>{const el=imgRef.current!;onConfirm({x:crop.x*(el.naturalWidth/imgSz.w),y:crop.y*(el.naturalHeight/imgSz.h),w:crop.w*(el.naturalWidth/imgSz.w),h:crop.h*(el.naturalHeight/imgSz.h)});};

  return (
    <div style={{position:"fixed",inset:0,zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.92)"}} onClick={onClose}>
      <div style={{maxWidth:560,width:"90%",background:T.bg,border:`1px solid ${T.borderHi}`,borderRadius:8,padding:28,animation:"fadeInUp 0.2s ease"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
          <h3 style={{fontSize:16,fontWeight:600,color:T.text,margin:0,letterSpacing:"-0.3px"}}>Bijsnijden</h3>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:18,cursor:"pointer",color:T.muted}}>✕</button>
        </div>
        <div style={{position:"relative",display:"inline-block",width:"100%",userSelect:"none"}} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}>
          <img ref={imgRef} src={img.url} alt={img.name} onLoad={onLoad} draggable={false} style={{width:"100%",maxHeight:420,objectFit:"contain",display:"block"}}/>
          {crop.w>0&&(
            <>
              {[{top:0,left:0,right:0,height:crop.y},{top:crop.y+crop.h,left:0,right:0,bottom:0},{top:crop.y,left:0,width:crop.x,height:crop.h},{top:crop.y,left:crop.x+crop.w,right:0,height:crop.h}].map((s,i)=>(
                <div key={i} style={{position:"absolute",background:"rgba(28,25,23,0.75)",pointerEvents:"none",...s}}/>
              ))}
              <div onMouseDown={e=>startA(e,"move")} style={{position:"absolute",top:crop.y,left:crop.x,width:crop.w,height:crop.h,border:`2px solid ${T.accent}`,cursor:"move"}}>
                <div style={{position:"absolute",inset:0,pointerEvents:"none",backgroundImage:"linear-gradient(rgba(201,168,76,0.12) 1px,transparent 1px),linear-gradient(90deg,rgba(201,168,76,0.12) 1px,transparent 1px)",backgroundSize:`${crop.w/3}px ${crop.h/3}px`}}/>
                {([["nw",{top:-5,left:-5,cursor:"nw-resize"}],["ne",{top:-5,right:-5,cursor:"ne-resize"}],["sw",{bottom:-5,left:-5,cursor:"sw-resize"}],["se",{bottom:-5,right:-5,cursor:"se-resize"}]] as ["nw"|"ne"|"sw"|"se",React.CSSProperties][]).map(([pos,s])=>(
                  <div key={pos} onMouseDown={e=>startA(e,pos)} style={{position:"absolute",width:12,height:12,background:T.accent,borderRadius:2,...s}}/>
                ))}
              </div>
            </>
          )}
        </div>
        <div style={{marginTop:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:11,color:T.muted,letterSpacing:1}}>{Math.round(crop.w)} × {Math.round(crop.h)} px → output {width} × {height} px</span>
          <button onClick={confirm} style={{padding:"8px 24px",background:T.accent,color:"#111",border:"none",borderRadius:5,fontSize:11,fontWeight:700,letterSpacing:2,textTransform:"uppercase",cursor:"pointer"}}>Bevestigen</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function Home() {
  const [view, setView] = useState<View>("home");

  // Resizer state
  const [images,     setImages]     = useState<ImgFile[]>([]);
  const [dragging,   setDragging]   = useState(false);
  const [width,      setWidth]      = useState("1080");
  const [height,     setHeight]     = useState("1080");
  const [unit,       setUnit]       = useState<SizeUnit>("px");
  const [lockAR,     setLockAR]     = useState(false);
  const [cropMode,   setCropMode]   = useState<CropMode>("fill");
  const [format,     setFormat]     = useState<OutputFmt>("jpeg");
  const [quality,    setQuality]    = useState("85");
  const [processing, setProcessing] = useState(false);
  const [previewImg, setPreviewImg] = useState<ImgFile|null>(null);
  const [hovered,    setHovered]    = useState<string|null>(null);
  const [user,       setUser]       = useState<any>(null);
  const [dlCount,    setDlCount]    = useState(0);
  const [showLimit,  setShowLimit]  = useState(false);
  const [showBlock,  setShowBlock]  = useState(false);
  const [showCoffee, setShowCoffee] = useState(false);
  const [activePresetCat, setActivePresetCat] = useState("Instagram");
  const [showPresets, setShowPresets] = useState(false);
  // Watermark
  const [watermark,  setWatermark]  = useState("");
  const [wmOpacity,  setWmOpacity]  = useState(50);
  const [wmPosition, setWmPosition] = useState("br");
  const [wmSize,     setWmSize]     = useState(24);
  const [wmColor,    setWmColor]    = useState("#ffffff");
  // Rename
  const [renamePattern, setRenamePattern] = useState("{name}_{w}x{h}");
  // Multiple formats
  const [exportFormats, setExportFormats] = useState<OutputFmt[]>(["jpeg"]);
  // Progress
  const [progress, setProgress] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const remaining = Math.max(0, FREE_LIMIT - dlCount);

  useEffect(() => {
    supabase.auth.getUser().then(({data:{user}})=>setUser(user));
    setDlCount(parseInt(localStorage.getItem("brons_downloads")||"0"));
  },[]);

  // Aspect ratio calculation
  const arRef = useRef(1);
  useEffect(()=>{ const w=parseFloat(width)||1, h=parseFloat(height)||1; arRef.current=w/h; },[width,height]);

  const handleWidth = (v:string) => {
    setWidth(v);
    if (lockAR && v) setHeight(String(Math.round(parseFloat(v)/arRef.current)));
  };
  const handleHeight = (v:string) => {
    setHeight(v);
    if (lockAR && v) setWidth(String(Math.round(parseFloat(v)*arRef.current)));
  };

  const applyPreset = (w:number, h:number) => {
    setWidth(String(w)); setHeight(String(h)); setUnit("px");
    arRef.current = w/h; setShowPresets(false);
  };

  const addFiles = (files:FileList|null) => {
    if (!files) return;
    const newImgs: ImgFile[] = Array.from(files).filter(f=>f.type.startsWith("image/")).map(f=>({
      id: Math.random().toString(36).slice(2), file:f, url:URL.createObjectURL(f), name:f.name,
    }));
    setImages(p=>[...p,...newImgs]);
  };

  const onDrop = useCallback((e:React.DragEvent)=>{e.preventDefault();setDragging(false);addFiles(e.dataTransfer.files);},[]);
  const removeImage = (id:string)=>setImages(p=>p.filter(img=>img.id!==id));
  const saveCrop=(id:string,c:{x:number;y:number;w:number;h:number})=>{setImages(p=>p.map(img=>img.id===id?{...img,cropData:c}:img));setPreviewImg(null);};

  const getOutputName = (orig:string, w:number, h:number, fmt:string) => {
    return renamePattern
      .replace("{name}", orig.replace(/\.[^.]+$/,""))
      .replace("{w}", String(w))
      .replace("{h}", String(h))
      .replace("{format}", fmt)
      + "." + (fmt==="jpeg"?"jpg":fmt);
  };

  const processImage = (img:HTMLImageElement, tw:number, th:number, cropData?:{x:number;y:number;w:number;h:number}): HTMLCanvasElement => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    canvas.width=tw; canvas.height=th;
    const sw=img.naturalWidth, sh=img.naturalHeight;
    if (cropData) { ctx.drawImage(img,cropData.x,cropData.y,cropData.w,cropData.h,0,0,tw,th); }
    else if (cropMode==="stretch") { ctx.drawImage(img,0,0,tw,th); }
    else if (cropMode==="fit") {
      const sc=Math.min(tw/sw,th/sh); const nw=sw*sc,nh=sh*sc;
      ctx.fillStyle=T.bg; ctx.fillRect(0,0,tw,th);
      ctx.drawImage(img,(tw-nw)/2,(th-nh)/2,nw,nh);
    } else if (cropMode==="fill") {
      const sc=Math.max(tw/sw,th/sh); const nw=sw*sc,nh=sh*sc;
      ctx.drawImage(img,(tw-nw)/2,(th-nh)/2,nw,nh);
    } else { ctx.drawImage(img,0,0); }
    // Watermark
    if (watermark.trim()) {
      const sz = wmSize; ctx.font=`${sz}px sans-serif`;
      const mt=ctx.measureText(watermark); const tw2=mt.width, th2=sz;
      const pad=sz*0.7;
      const positions:Record<string,[number,number]> = {
        tl:[pad,pad+th2], tc:[canvas.width/2-tw2/2,pad+th2],
        tr:[canvas.width-tw2-pad,pad+th2],
        cl:[pad,canvas.height/2], cc:[canvas.width/2-tw2/2,canvas.height/2],
        cr:[canvas.width-tw2-pad,canvas.height/2],
        bl:[pad,canvas.height-pad], bc:[canvas.width/2-tw2/2,canvas.height-pad],
        br:[canvas.width-tw2-pad,canvas.height-pad],
      };
      const [wx,wy]=positions[wmPosition]||[pad,pad+th2];
      ctx.globalAlpha=wmOpacity/100;
      ctx.shadowColor="rgba(0,0,0,0.8)"; ctx.shadowBlur=4;
      ctx.fillStyle=wmColor;
      ctx.fillText(watermark,wx,wy);
      ctx.globalAlpha=1; ctx.shadowBlur=0;
    }
    return canvas;
  };

  const saveToHistory = async (filename:string, file:File) => {
    if (!user) return;
    const path=`${user.id}/${Date.now()}_${filename}`;
    const {data:up}=await supabase.storage.from("images").upload(path,file,{upsert:true});
    let url=null;
    if(up?.path){const {data:ud}=supabase.storage.from("images").getPublicUrl(path);url=ud?.publicUrl||null;}
    await supabase.from("history").insert({user_id:user.id,filename,width:parseInt(width),height:parseInt(height),format,crop_mode:cropMode,image_url:url});
  };

  const processAndDownload = async () => {
    if (images.length===0) return;
    if (!user&&dlCount>=FREE_LIMIT){setShowBlock(true);return;}
    setProcessing(true); setProgress(0);
    const tw=parseInt(width)||800, th=parseInt(height)||600;
    const fmt = exportFormats.length>0?exportFormats[0]:format;
    let nc=dlCount;

    for (let i=0;i<images.length;i++) {
      const imgFile=images[i];
      setProgress(Math.round(((i)/images.length)*100));
      const image=new Image();
      image.src=imgFile.url;
      await new Promise<void>(res=>{image.onload=()=>res();image.onerror=()=>res();});

      // Multiple formats
      for (const ef of (exportFormats.length>0?exportFormats:[format as OutputFmt])) {
        const canvas=processImage(image,tw,th,imgFile.cropData);
        const mimeType=ef==="png"?"image/png":ef==="webp"?"image/webp":"image/jpeg";
        const q=ef==="png"?1:parseInt(quality)/100;
        const blob=await new Promise<Blob>(res=>canvas.toBlob(b=>res(b!),mimeType,q));
        const name=getOutputName(imgFile.name,tw,th,ef);
        const url=URL.createObjectURL(blob);
        const a=document.createElement("a"); a.href=url; a.download=name; a.click();
        URL.revokeObjectURL(url);
        if(user) await saveToHistory(name,new File([blob],name,{type:mimeType}));
      }

      if(!user){nc++;localStorage.setItem("brons_downloads",nc.toString());setDlCount(nc);if(nc>=WARN_AT)setShowLimit(true);}
    }
    setProgress(100);
    setTimeout(()=>{setProcessing(false);setProgress(0);},600);
  };

  // ── CSS ──────────────────────────────────────────────────────────────────────
  const css = `
    @keyframes fadeInUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
    @keyframes fadeIn{from{opacity:0}to{opacity:1}}
    @keyframes shimmer{0%{opacity:0.6}50%{opacity:1}100%{opacity:0.6}}
    ::-webkit-scrollbar{width:4px;height:4px}
    ::-webkit-scrollbar-track{background:transparent}
    ::-webkit-scrollbar-thumb{background:rgba(250,247,242,0.12);border-radius:2px}
    ::-webkit-scrollbar-thumb:hover{background:rgba(250,247,242,0.22)}
    input[type=range]{accent-color:#C9A84C}
    select option{background:#231F1C}
  `;

  const Lbl = ({t}:{t:string}) => <label style={{fontSize:10,letterSpacing:2.5,textTransform:"uppercase" as const,color:T.muted,display:"block",marginBottom:6}}>{t}</label>;
  const Div = () => <div style={{height:1,background:T.border,margin:"18px 0"}}/>;
  const SBtn = ({active,onClick,children}:{active:boolean;onClick:()=>void;children:React.ReactNode}) => (
    <button onClick={onClick} style={{padding:"8px 12px",borderRadius:4,background:active?T.accentDim:"transparent",border:active?`1px solid ${T.accentBorder}`:`1px solid transparent`,color:active?T.accent:T.muted,fontSize:12,cursor:"pointer",transition:"all 0.1s",textAlign:"left" as const,width:"100%"}}
      onMouseEnter={e=>{if(!active){e.currentTarget.style.background=T.bg3;e.currentTarget.style.color=T.text;}}}
      onMouseLeave={e=>{if(!active){e.currentTarget.style.background="transparent";e.currentTarget.style.color=T.muted;}}}>
      {children}
    </button>
  );

  // ── Home screen ──────────────────────────────────────────────────────────────
  if (view==="home") return (
    <>
      <style>{css}</style>
      <div style={{minHeight:"100vh",background:T.bg,color:T.text,fontFamily:"system-ui,-apple-system,sans-serif",position:"relative",overflow:"hidden"}}>
        {/* Grid bg */}
        <div style={{position:"fixed",inset:0,pointerEvents:"none",backgroundImage:"linear-gradient(rgba(250,247,242,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(250,247,242,0.025) 1px,transparent 1px)",backgroundSize:"80px 80px"}}/>
        {/* Grain */}
        <div style={{position:"fixed",inset:0,pointerEvents:"none",opacity:0.4,backgroundImage:`url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E")`}}/>

        {/* Coffee modal */}
        {showCoffee&&(
          <div style={{position:"fixed",inset:0,zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.88)"}} onClick={()=>setShowCoffee(false)}>
            <div style={{background:T.bg,border:`1px solid ${T.borderHi}`,padding:44,maxWidth:400,width:"90%",textAlign:"center",borderRadius:8}} onClick={e=>e.stopPropagation()}>
              <p style={{fontSize:10,letterSpacing:4,textTransform:"uppercase",color:T.muted,marginBottom:14}}>Binnenkort</p>
              <h2 style={{fontSize:28,fontWeight:400,letterSpacing:"-1px",color:T.text,margin:"0 0 14px",fontFamily:"Georgia,serif"}}>
                We're working<br/><em style={{color:"rgba(250,247,242,0.35)"}}>on it</em>
              </h2>
              <p style={{fontSize:13,color:T.muted,lineHeight:1.7,margin:"0 0 28px"}}>Donaties zijn binnenkort beschikbaar. Bedankt!</p>
              <button onClick={()=>setShowCoffee(false)} style={{padding:"11px 32px",background:T.text,color:T.bg,border:"none",fontSize:11,fontWeight:700,letterSpacing:2,textTransform:"uppercase",cursor:"pointer",borderRadius:4}}>Sluiten</button>
            </div>
          </div>
        )}

        {/* Header */}
        <header style={{position:"relative",zIndex:2,padding:"22px 48px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:`1px solid ${T.border}`}}>
          <div style={{display:"flex",alignItems:"baseline",gap:14}}>
            <span style={{fontSize:11,letterSpacing:5,textTransform:"uppercase",color:T.muted}}>Vol. 01</span>
            <span style={{fontSize:11,letterSpacing:5,textTransform:"uppercase",color:T.muted}}>2026</span>
          </div>
          <div style={{position:"absolute",left:"50%",transform:"translateX(-50%)",fontSize:24,fontWeight:700,letterSpacing:"-0.8px",color:T.text}}>IMAGE-TOOLZ</div>
          <div style={{display:"flex",gap:20,alignItems:"center"}}>
            {user&&<a href="/history" style={{fontSize:11,letterSpacing:2.5,textTransform:"uppercase",color:T.muted,textDecoration:"none"}}>Geschiedenis</a>}
            <button onClick={()=>user?supabase.auth.signOut().then(()=>setUser(null)):window.location.href="/login"} style={{fontSize:11,letterSpacing:2.5,textTransform:"uppercase",color:T.muted,background:"none",border:`1px solid ${T.border}`,padding:"7px 18px",cursor:"pointer",borderRadius:3}}>
              {user?"Uitloggen":"Inloggen"}
            </button>
          </div>
        </header>

        {/* Hero */}
        <div style={{position:"relative",zIndex:2,padding:"64px 48px 0"}}>
          <p style={{fontSize:10,letterSpacing:5,textTransform:"uppercase",color:"rgba(250,247,242,0.3)",margin:"0 0 22px"}}>Image Tools · Browser Based · Geen upload</p>
          <h1 style={{fontSize:"clamp(52px,9vw,116px)",fontWeight:400,letterSpacing:"-3px",lineHeight:0.88,margin:0,color:T.text,fontFamily:"Georgia,'Times New Roman',serif"}}>
            Bewerk.<br/><em style={{fontStyle:"italic",color:"rgba(250,247,242,0.3)"}}>Resize.</em><br/>Creëer.
          </h1>
        </div>

        {/* Tools grid */}
        <div style={{position:"relative",zIndex:2,margin:"52px 48px 0",borderTop:`1px solid rgba(250,247,242,0.09)`,paddingTop:14,display:"flex",justifyContent:"space-between"}}>
          <span style={{fontSize:10,letterSpacing:3,textTransform:"uppercase",color:"rgba(250,247,242,0.22)"}}>Tools</span>
          <span style={{fontSize:10,letterSpacing:3,textTransform:"uppercase",color:"rgba(250,247,242,0.22)"}}>Gratis · No signup</span>
        </div>
        <div style={{position:"relative",zIndex:2,display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:0,margin:"0 48px",borderLeft:`1px solid ${T.border}`}}>
          {[
            {id:"resizer",title:"Image\nResizer",tag:"Tool — 01",desc:"Batch resize met social media presets, aspect ratio lock, watermark en meer formaten.",accent:T.accent,action:()=>setView("resizer")},
            {id:"editor",title:"Image\nEditor",tag:"Tool — 02",desc:"Professionele editor met lagen, curven, filters, vormen en tekst.",accent:"#4a9eff",action:()=>window.location.href="/editor"},
            {id:"coffee",title:"Buy Me\na Coffee",tag:"Support — 03",desc:"Vind je IMAGE-TOOLZ nuttig? Overweeg een kleine donatie om het project te steunen.",accent:"#e07040",action:()=>setShowCoffee(true)},
          ].map(tool=>(
            <div key={tool.id} onClick={tool.action} onMouseEnter={()=>setHovered(tool.id)} onMouseLeave={()=>setHovered(null)}
              style={{padding:"44px 38px",borderRight:`1px solid ${T.border}`,borderBottom:`1px solid ${T.border}`,cursor:"pointer",transition:"background 0.25s",background:hovered===tool.id?"rgba(250,247,242,0.025)":"transparent",position:"relative",overflow:"hidden"}}>
              <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:tool.accent,transform:hovered===tool.id?"scaleX(1)":"scaleX(0)",transformOrigin:"left",transition:"transform 0.28s ease"}}/>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:36}}>
                <span style={{fontSize:10,letterSpacing:3,textTransform:"uppercase",color:"rgba(250,247,242,0.22)"}}>{tool.tag}</span>
                <span style={{fontSize:44,fontWeight:300,color:"rgba(250,247,242,0.06)",lineHeight:1}}>{String(parseInt(tool.tag.split("—")[1]||"0")).padStart(2,"0")}</span>
              </div>
              <h2 style={{fontSize:"clamp(28px,2.8vw,44px)",fontWeight:400,letterSpacing:"-1.2px",lineHeight:1,margin:"0 0 18px",color:hovered===tool.id?tool.accent:T.text,transition:"color 0.25s",whiteSpace:"pre-line",fontFamily:"Georgia,serif"}}>{tool.title}</h2>
              <p style={{fontSize:13,lineHeight:1.7,color:"rgba(250,247,242,0.42)",margin:"0 0 36px",fontWeight:300}}>{tool.desc}</p>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:28,height:1,background:hovered===tool.id?tool.accent:"rgba(250,247,242,0.18)",transition:"all 0.25s"}}/>
                <span style={{fontSize:10,letterSpacing:3,textTransform:"uppercase",color:hovered===tool.id?tool.accent:"rgba(250,247,242,0.28)",transition:"color 0.25s"}}>Open</span>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{position:"relative",zIndex:2,padding:"28px 48px",display:"flex",justifyContent:"space-between",borderTop:`1px solid rgba(250,247,242,0.05)`,marginTop:48}}>
          <span style={{fontSize:10,letterSpacing:3,textTransform:"uppercase",color:"rgba(250,247,242,0.18)"}}>© 2026 IMAGE-TOOLZ</span>
          <span style={{fontSize:10,letterSpacing:3,textTransform:"uppercase",color:"rgba(250,247,242,0.18)"}}>Browser Based · Privacy First</span>
        </div>
      </div>
    </>
  );

  // ── Resizer screen ───────────────────────────────────────────────────────────
  return (
    <>
      <style>{css}</style>

      {previewImg&&<CropPreview img={previewImg} width={parseInt(width)||800} height={parseInt(height)||600} onClose={()=>setPreviewImg(null)} onConfirm={(c)=>saveCrop(previewImg.id,c)}/>}

      {showBlock&&(
        <div style={{position:"fixed",inset:0,zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.88)"}} onClick={()=>setShowBlock(false)}>
          <div style={{background:T.bg,border:`1px solid ${T.borderHi}`,padding:44,maxWidth:420,width:"90%",textAlign:"center",borderRadius:8}} onClick={e=>e.stopPropagation()}>
            <h2 style={{fontSize:24,fontWeight:400,letterSpacing:"-0.8px",color:T.text,margin:"0 0 12px",fontFamily:"Georgia,serif"}}>Download limiet bereikt</h2>
            <p style={{fontSize:13,color:T.muted,lineHeight:1.7,margin:"0 0 28px"}}>Je hebt je {FREE_LIMIT} gratis downloads gebruikt. Log in voor onbeperkt downloaden.</p>
            <button onClick={()=>window.location.href="/login"} style={{width:"100%",padding:"13px",background:T.text,color:T.bg,border:"none",fontSize:11,fontWeight:700,letterSpacing:3,textTransform:"uppercase",cursor:"pointer",borderRadius:4,marginBottom:10}}>Inloggen</button>
            <button onClick={()=>setShowBlock(false)} style={{background:"none",border:"none",fontSize:11,color:T.muted,cursor:"pointer",letterSpacing:1,textTransform:"uppercase"}}>Sluiten</button>
          </div>
        </div>
      )}

      {showLimit&&!user&&remaining>0&&(
        <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:50,background:T.bg2,borderTop:`1px solid rgba(250,247,242,0.1)`,padding:"14px 40px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:T.accent}}/>
            <p style={{fontSize:12,color:"rgba(250,247,242,0.65)",margin:0}}>
              Nog <strong style={{color:T.text}}>{remaining} gratis download{remaining!==1?"s":""}</strong> over. <span style={{color:T.muted}}>Log in voor onbeperkt.</span>
            </p>
          </div>
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>window.location.href="/login"} style={{padding:"7px 20px",background:T.accent,color:"#111",border:"none",fontSize:11,fontWeight:700,letterSpacing:2,textTransform:"uppercase",cursor:"pointer",borderRadius:3}}>Inloggen</button>
            <button onClick={()=>setShowLimit(false)} style={{background:"none",border:"none",color:T.muted,cursor:"pointer",fontSize:16}}>✕</button>
          </div>
        </div>
      )}

      <div style={{minHeight:"100vh",background:T.bg,color:T.text,fontFamily:"system-ui,-apple-system,sans-serif",position:"relative"}}>
        {/* Grain */}
        <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,opacity:0.4,backgroundImage:`url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E")`}}/>

        {/* Header */}
        <header style={{position:"relative",zIndex:2,padding:"18px 40px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",background:T.bg}}>
          <button onClick={()=>setView("home")} style={{fontSize:18,fontWeight:700,letterSpacing:"-0.6px",color:T.text,background:"none",border:"none",cursor:"pointer",padding:0}}>IMAGE-TOOLZ</button>
          <div style={{position:"absolute",left:"50%",transform:"translateX(-50%)",display:"flex",alignItems:"center",gap:8}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
            <span style={{fontSize:12,color:T.muted,letterSpacing:3,textTransform:"uppercase"}}>Image Resizer</span>
          </div>
          <div style={{display:"flex",gap:16,alignItems:"center"}}>
            <a href="/editor" style={{fontSize:11,letterSpacing:2.5,textTransform:"uppercase",color:T.muted,textDecoration:"none"}}>Editor</a>
            {user&&<a href="/history" style={{fontSize:11,letterSpacing:2.5,textTransform:"uppercase",color:T.muted,textDecoration:"none"}}>Geschiedenis</a>}
            {!user&&<span style={{fontSize:11,letterSpacing:1.5,color:T.muted}}>{remaining} downloads over</span>}
            <button onClick={()=>user?supabase.auth.signOut().then(()=>setUser(null)):window.location.href="/login"} style={{fontSize:11,letterSpacing:2,textTransform:"uppercase",color:T.muted,background:"none",border:`1px solid ${T.border}`,padding:"6px 16px",cursor:"pointer",borderRadius:3}}>
              {user?"Uitloggen":"Inloggen"}
            </button>
          </div>
        </header>

        <div style={{position:"relative",zIndex:1,display:"grid",gridTemplateColumns:"1fr 360px",gap:0,height:"calc(100vh - 61px)"}}>

          {/* ── LEFT: Upload + Images ── */}
          <div style={{overflowY:"auto",padding:"32px 36px",display:"flex",flexDirection:"column",gap:24}}>
            <div>
              <p style={{fontSize:10,letterSpacing:5,textTransform:"uppercase",color:"rgba(250,247,242,0.28)",margin:"0 0 10px"}}>Tool — 01</p>
              <h1 style={{fontSize:38,fontWeight:400,letterSpacing:"-1.5px",margin:0,color:T.text,fontFamily:"Georgia,serif"}}>Image Resizer</h1>
            </div>

            {/* Drop zone */}
            <div onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={onDrop} onClick={()=>inputRef.current?.click()}
              style={{padding:"52px 40px",textAlign:"center",cursor:"pointer",transition:"all 0.2s",border:dragging?`1.5px dashed ${T.accent}`:`1.5px dashed rgba(250,247,242,0.12)`,background:dragging?T.accentDim:"transparent",borderRadius:6}}>
              <div style={{width:48,height:48,borderRadius:10,background:dragging?T.accentDim:T.bg2,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px",transition:"all 0.2s"}}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={dragging?T.accent:"rgba(250,247,242,0.3)"} strokeWidth="1.8" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
              </div>
              <p style={{fontSize:14,color:dragging?T.accent:T.text,margin:"0 0 6px",fontWeight:500}}>Sleep afbeeldingen hierheen</p>
              <p style={{fontSize:11,color:T.muted,margin:0,letterSpacing:2}}>of klik om te bladeren · PNG · JPG · WebP · GIF</p>
              <input ref={inputRef} type="file" multiple accept="image/*" style={{display:"none"}} onChange={e=>addFiles(e.target.files)}/>
            </div>

            {/* Progress bar */}
            {processing&&progress>0&&progress<100&&(
              <div style={{borderRadius:3,background:T.bg2,overflow:"hidden",height:4}}>
                <div style={{height:"100%",background:T.accent,width:`${progress}%`,transition:"width 0.3s",borderRadius:3}}/>
              </div>
            )}

            {/* Images grid */}
            {images.length>0&&(
              <>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:11,color:T.muted,letterSpacing:2}}>{images.length} afbeelding{images.length!==1?"en":""}</span>
                  <button onClick={()=>setImages([])} style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:T.muted,background:"none",border:"none",cursor:"pointer"}}>Alles verwijderen</button>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))",gap:8}}>
                  {images.map(img=>(
                    <div key={img.id} style={{position:"relative",aspectRatio:"1",overflow:"hidden",borderRadius:5,background:T.bg2,border:`1px solid ${T.border}`,cursor:"pointer"}}
                      onMouseEnter={e=>(e.currentTarget.querySelector(".img-overlay")as HTMLElement).style.opacity="1"}
                      onMouseLeave={e=>(e.currentTarget.querySelector(".img-overlay")as HTMLElement).style.opacity="0"}>
                      <img src={img.url} alt={img.name} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                      {img.cropData&&<div style={{position:"absolute",top:6,left:6,background:T.accent,color:"#111",fontSize:8,padding:"2px 7px",letterSpacing:1.5,textTransform:"uppercase",borderRadius:2,fontWeight:700}}>Crop</div>}
                      <div className="img-overlay" style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.72)",display:"flex",alignItems:"center",justifyContent:"center",gap:6,transition:"opacity 0.18s",opacity:0}}>
                        <button onClick={()=>setPreviewImg(img)} style={{fontSize:10,padding:"5px 10px",background:T.accent,color:"#111",border:"none",cursor:"pointer",letterSpacing:1,textTransform:"uppercase",borderRadius:3,fontWeight:700}}>Crop</button>
                        <button onClick={()=>removeImage(img.id)} style={{fontSize:10,padding:"5px 8px",background:"rgba(250,247,242,0.12)",color:T.text,border:"none",cursor:"pointer",borderRadius:3}}>✕</button>
                      </div>
                      <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"3px 7px",background:"linear-gradient(transparent,rgba(0,0,0,0.7))"}}>
                        <p style={{fontSize:9,color:"rgba(250,247,242,0.6)",margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{img.name}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* ── RIGHT: Settings panel ── */}
          <div style={{borderLeft:`1px solid ${T.border}`,overflowY:"auto",background:T.bg}}>

            {/* Preset button */}
            <div style={{padding:"16px 20px",borderBottom:`1px solid ${T.border}`,position:"relative"}}>
              <button onClick={()=>setShowPresets(!showPresets)} style={{width:"100%",padding:"10px 16px",background:showPresets?T.accentDim:T.bg2,border:`1px solid ${showPresets?T.accentBorder:T.border}`,color:showPresets?T.accent:T.text,fontSize:12,cursor:"pointer",borderRadius:5,display:"flex",alignItems:"center",justifyContent:"space-between",transition:"all 0.15s"}}>
                <span style={{fontWeight:500}}>📐 Social media presets</span>
                <span style={{fontSize:10,transform:showPresets?"rotate(180deg)":"none",transition:"transform 0.2s"}}>▼</span>
              </button>
              {showPresets&&(
                <div style={{position:"absolute",top:"100%",left:20,right:20,background:T.bg2,border:`1px solid ${T.borderHi}`,borderRadius:6,zIndex:50,boxShadow:"0 12px 40px rgba(0,0,0,0.6)",animation:"fadeIn 0.1s",maxHeight:360,overflowY:"auto"}}>
                  {/* Category tabs */}
                  <div style={{display:"flex",overflowX:"auto",borderBottom:`1px solid ${T.border}`,padding:"0 4px"}}>
                    {PRESETS.map(p=>(
                      <button key={p.cat} onClick={()=>setActivePresetCat(p.cat)} style={{padding:"8px 10px",background:"transparent",border:"none",color:activePresetCat===p.cat?T.accent:T.muted,fontSize:10,letterSpacing:1,cursor:"pointer",whiteSpace:"nowrap",borderBottom:activePresetCat===p.cat?`2px solid ${T.accent}`:"2px solid transparent",transition:"all 0.1s"}}>
                        {p.cat}
                      </button>
                    ))}
                  </div>
                  {PRESETS.find(p=>p.cat===activePresetCat)?.items.map(item=>(
                    <button key={item.name} onClick={()=>applyPreset(item.w,item.h)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",width:"100%",padding:"10px 16px",background:"transparent",border:"none",color:T.text,fontSize:12,cursor:"pointer",textAlign:"left",transition:"background 0.1s",borderBottom:`1px solid ${T.border}`}}
                      onMouseEnter={e=>(e.currentTarget.style.background="rgba(250,247,242,0.04)")}
                      onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                      <span>{item.name}</span>
                      <span style={{fontSize:10,color:T.muted,letterSpacing:0.5}}>{item.w} × {item.h} · {item.tag}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={{padding:"20px",display:"flex",flexDirection:"column",gap:20}}>

              {/* Dimensions */}
              <div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <Lbl t="Afmetingen"/>
                  <div style={{display:"flex",gap:4}}>
                    {(["px","%"] as SizeUnit[]).map(u=>(
                      <button key={u} onClick={()=>setUnit(u)} style={{padding:"2px 8px",borderRadius:3,background:unit===u?T.accentDim:"transparent",border:unit===u?`1px solid ${T.accentBorder}`:`1px solid ${T.border}`,color:unit===u?T.accent:T.muted,fontSize:10,cursor:"pointer"}}>{u}</button>
                    ))}
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 32px 1fr",gap:8,alignItems:"center"}}>
                  <div>
                    <label style={{fontSize:9,color:T.muted,letterSpacing:2,display:"block",marginBottom:4}}>BREEDTE</label>
                    <input type="text" inputMode="numeric" value={width} onChange={e=>handleWidth(e.target.value.replace(/[^0-9]/g,""))} style={{width:"100%",background:T.bg2,border:`1px solid rgba(250,247,242,0.1)`,color:T.text,padding:"9px 10px",fontSize:15,outline:"none",borderRadius:4,boxSizing:"border-box"}}
                      onFocus={e=>e.currentTarget.style.borderColor=T.accentBorder} onBlur={e=>e.currentTarget.style.borderColor="rgba(250,247,242,0.1)"}/>
                  </div>
                  <button onClick={()=>setLockAR(!lockAR)} title="Beeldverhouding vergrendelen" style={{width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",background:lockAR?T.accentDim:T.bg2,border:lockAR?`1px solid ${T.accentBorder}`:`1px solid ${T.border}`,borderRadius:4,cursor:"pointer",fontSize:14,color:lockAR?T.accent:T.muted,transition:"all 0.15s",marginTop:18}}>
                    {lockAR?"🔒":"🔓"}
                  </button>
                  <div>
                    <label style={{fontSize:9,color:T.muted,letterSpacing:2,display:"block",marginBottom:4}}>HOOGTE</label>
                    <input type="text" inputMode="numeric" value={height} onChange={e=>handleHeight(e.target.value.replace(/[^0-9]/g,""))} style={{width:"100%",background:T.bg2,border:`1px solid rgba(250,247,242,0.1)`,color:T.text,padding:"9px 10px",fontSize:15,outline:"none",borderRadius:4,boxSizing:"border-box"}}
                      onFocus={e=>e.currentTarget.style.borderColor=T.accentBorder} onBlur={e=>e.currentTarget.style.borderColor="rgba(250,247,242,0.1)"}/>
                  </div>
                </div>
                {lockAR&&<p style={{fontSize:10,color:T.accent,marginTop:6,letterSpacing:1}}>🔒 Beeldverhouding vergrendeld</p>}
              </div>

              <Div/>

              {/* Crop mode */}
              <div>
                <Lbl t="Aanpassingsmodus"/>
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  {CROP_OPTIONS.map(opt=>(
                    <button key={opt.value} onClick={()=>setCropMode(opt.value)} style={{textAlign:"left",padding:"9px 12px",cursor:"pointer",transition:"all 0.15s",background:cropMode===opt.value?T.accentDim:"transparent",border:cropMode===opt.value?`1px solid ${T.accentBorder}`:`1px solid rgba(250,247,242,0.05)`,color:cropMode===opt.value?T.accent:T.muted,borderRadius:5}}>
                      <div style={{fontSize:12,fontWeight:500,color:cropMode===opt.value?T.accent:T.text}}>{opt.label}</div>
                      <div style={{fontSize:10,color:T.muted,marginTop:2}}>{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <Div/>

              {/* Output formats */}
              <div>
                <Lbl t="Uitvoerformaat"/>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
                  {(["jpeg","png","webp"] as OutputFmt[]).map(f=>(
                    <button key={f} onClick={()=>setFormat(f)} style={{padding:"8px",background:format===f?T.accentDim:"transparent",border:format===f?`1px solid ${T.accentBorder}`:`1px solid ${T.border}`,color:format===f?T.accent:T.muted,fontSize:11,cursor:"pointer",borderRadius:4,fontWeight:format===f?700:400,letterSpacing:1,textTransform:"uppercase",transition:"all 0.1s"}}>
                      {f.toUpperCase()}
                    </button>
                  ))}
                </div>
                {format!=="png"&&(
                  <div style={{marginTop:12}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                      <label style={{fontSize:10,color:T.muted,letterSpacing:2}}>KWALITEIT</label>
                      <span style={{fontSize:11,color:T.muted}}>{quality}%</span>
                    </div>
                    <input type="range" min="10" max="100" value={quality} onChange={e=>setQuality(e.target.value)} style={{width:"100%"}}/>
                    <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
                      <span style={{fontSize:9,color:"rgba(250,247,242,0.2)"}}>Klein</span>
                      <span style={{fontSize:9,color:"rgba(250,247,242,0.2)"}}>Groot</span>
                    </div>
                  </div>
                )}
              </div>

              <Div/>

              {/* Watermark */}
              <div>
                <Lbl t="Watermerk (optioneel)"/>
                <input type="text" value={watermark} onChange={e=>setWatermark(e.target.value)} placeholder="© Jouw naam" style={{width:"100%",background:T.bg2,border:`1px solid rgba(250,247,242,0.1)`,color:T.text,padding:"9px 12px",fontSize:13,outline:"none",borderRadius:4,boxSizing:"border-box",marginBottom:watermark?10:0}}
                  onFocus={e=>e.currentTarget.style.borderColor=T.accentBorder} onBlur={e=>e.currentTarget.style.borderColor="rgba(250,247,242,0.1)"}/>
                {watermark&&(
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    <div>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                        <label style={{fontSize:9,color:T.muted,letterSpacing:2}}>DEKKING</label>
                        <span style={{fontSize:10,color:T.muted}}>{wmOpacity}%</span>
                      </div>
                      <input type="range" min="5" max="100" value={wmOpacity} onChange={e=>setWmOpacity(parseInt(e.target.value))} style={{width:"100%"}}/>
                    </div>
                    <div>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                        <label style={{fontSize:9,color:T.muted,letterSpacing:2}}>GROOTTE</label>
                        <span style={{fontSize:10,color:T.muted}}>{wmSize}px</span>
                      </div>
                      <input type="range" min="10" max="80" value={wmSize} onChange={e=>setWmSize(parseInt(e.target.value))} style={{width:"100%"}}/>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <label style={{fontSize:9,color:T.muted,letterSpacing:2}}>KLEUR</label>
                      <input type="color" value={wmColor} onChange={e=>setWmColor(e.target.value)} style={{width:28,height:22,borderRadius:3,border:`1px solid ${T.border}`,cursor:"pointer"}}/>
                    </div>
                    <div>
                      <label style={{fontSize:9,color:T.muted,letterSpacing:2,display:"block",marginBottom:6}}>POSITIE</label>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:3}}>
                        {[["tl","↖"],["tc","↑"],["tr","↗"],["cl","←"],["cc","·"],["cr","→"],["bl","↙"],["bc","↓"],["br","↘"]].map(([v,icon])=>(
                          <button key={v} onClick={()=>setWmPosition(v)} style={{padding:"6px",background:wmPosition===v?T.accentDim:"transparent",border:wmPosition===v?`1px solid ${T.accentBorder}`:`1px solid ${T.border}`,color:wmPosition===v?T.accent:T.muted,fontSize:14,cursor:"pointer",borderRadius:3,transition:"all 0.1s"}}>{icon}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <Div/>

              {/* Rename pattern */}
              <div>
                <Lbl t="Bestandsnaam patroon"/>
                <input type="text" value={renamePattern} onChange={e=>setRenamePattern(e.target.value)} style={{width:"100%",background:T.bg2,border:`1px solid rgba(250,247,242,0.1)`,color:T.text,padding:"9px 12px",fontSize:12,outline:"none",borderRadius:4,boxSizing:"border-box",fontFamily:"monospace"}}
                  onFocus={e=>e.currentTarget.style.borderColor=T.accentBorder} onBlur={e=>e.currentTarget.style.borderColor="rgba(250,247,242,0.1)"}/>
                <p style={{fontSize:9,color:"rgba(250,247,242,0.22)",marginTop:5,lineHeight:1.6}}>Variabelen: <code style={{color:T.muted}}>{"{name}"}</code> <code style={{color:T.muted}}>{"{w}"}</code> <code style={{color:T.muted}}>{"{h}"}</code> <code style={{color:T.muted}}>{"{format}"}</code></p>
                <p style={{fontSize:10,color:T.muted,marginTop:4}}>Preview: <strong style={{color:T.text}}>{getOutputName("foto.jpg",parseInt(width)||1080,parseInt(height)||1080,format)}</strong></p>
              </div>

              <Div/>

              {/* Download counter */}
              {!user&&(
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                    <span style={{fontSize:10,color:T.muted,letterSpacing:2}}>GRATIS DOWNLOADS</span>
                    <span style={{fontSize:11,color:T.muted}}>{dlCount}/{FREE_LIMIT}</span>
                  </div>
                  <div style={{display:"flex",gap:4}}>
                    {Array.from({length:FREE_LIMIT}).map((_,i)=>(
                      <div key={i} style={{flex:1,height:3,background:i<dlCount?"rgba(250,247,242,0.12)":T.accent,borderRadius:2,transition:"all 0.3s"}}/>
                    ))}
                  </div>
                </div>
              )}

              {/* Download button */}
              <button onClick={processAndDownload} disabled={images.length===0||processing}
                style={{width:"100%",padding:"14px",background:images.length===0||(!user&&dlCount>=FREE_LIMIT)?"rgba(250,247,242,0.06)":processing?T.accentDim:T.accent,color:images.length===0||(!user&&dlCount>=FREE_LIMIT)?"rgba(250,247,242,0.2)":processing?"rgba(250,247,242,0.5)":"#111",border:"none",fontSize:12,letterSpacing:2.5,textTransform:"uppercase",cursor:images.length===0?"not-allowed":"pointer",transition:"all 0.2s",borderRadius:5,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                {processing?(
                  <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{animation:"shimmer 1s infinite"}}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg> Verwerken {progress>0?`(${progress}%)`:""}...</>
                ):!user&&dlCount>=FREE_LIMIT?(
                  "Inloggen vereist"
                ):images.length===0?(
                  "Voeg afbeeldingen toe"
                ):(
                  <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>Download {images.length} foto{images.length>1?"'s":""}</>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}