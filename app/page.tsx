"use client";
import React, { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "./lib/supabase";

interface ImageFile { id: string; file: File; url: string; name: string; cropData?: { x: number; y: number; w: number; h: number }; }
type CropMode = "fill" | "fit" | "stretch" | "none";

// ── Crop preview modal ──────────────────────────────────────────────────────
function CropPreview({ img, width, height, onClose, onConfirm }: {
  img: ImageFile; width: number; height: number;
  onClose: () => void; onConfirm: (c: { x: number; y: number; w: number; h: number }) => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgSz, setImgSz] = useState({ w: 0, h: 0 });
  const [crop,  setCrop]  = useState({ x: 0, y: 0, w: 0, h: 0 });
  const act  = useRef<null | "move" | "nw" | "ne" | "sw" | "se">(null);
  const drag = useRef({ mx: 0, my: 0, crop: { x: 0, y: 0, w: 0, h: 0 } });
  const cl   = (v: number, mn: number, mx: number) => Math.max(mn, Math.min(mx, v));

  const onLoad = () => {
    const el = imgRef.current!;
    const iw = el.clientWidth, ih = el.clientHeight;
    setImgSz({ w: iw, h: ih });
    const sc = Math.min(iw / (el.naturalWidth || width), ih / (el.naturalHeight || height));
    const cw = Math.min(width * sc, iw), ch = Math.min(height * sc, ih);
    setCrop({ x: (iw - cw) / 2, y: (ih - ch) / 2, w: cw, h: ch });
  };

  const startA = (e: React.MouseEvent, type: "move"|"nw"|"ne"|"sw"|"se") => {
    e.preventDefault(); e.stopPropagation();
    act.current = type; drag.current = { mx: e.clientX, my: e.clientY, crop: { ...crop } };
  };
  const onMove = (e: React.MouseEvent) => {
    if (!act.current) return;
    const dx = e.clientX - drag.current.mx, dy = e.clientY - drag.current.my;
    const c = { ...drag.current.crop }, mn = 30;
    if (act.current === "move") setCrop({ ...c, x: cl(c.x+dx,0,imgSz.w-c.w), y: cl(c.y+dy,0,imgSz.h-c.h) });
    else if (act.current === "se") setCrop({ ...c, w: cl(c.w+dx,mn,imgSz.w-c.x), h: cl(c.h+dy,mn,imgSz.h-c.y) });
    else if (act.current === "sw") { const nw=cl(c.w-dx,mn,c.x+c.w); setCrop({...c,x:c.x+c.w-nw,w:nw,h:cl(c.h+dy,mn,imgSz.h-c.y)}); }
    else if (act.current === "ne") { const nh=cl(c.h-dy,mn,c.y+c.h); setCrop({...c,y:c.y+c.h-nh,w:cl(c.w+dx,mn,imgSz.w-c.x),h:nh}); }
    else if (act.current === "nw") { const nw=cl(c.w-dx,mn,c.x+c.w),nh=cl(c.h-dy,mn,c.y+c.h); setCrop({x:c.x+c.w-nw,y:c.y+c.h-nh,w:nw,h:nh}); }
  };
  const onUp = () => { act.current = null; };
  const confirm = () => {
    const el = imgRef.current!;
    onConfirm({ x: crop.x*(el.naturalWidth/imgSz.w), y: crop.y*(el.naturalHeight/imgSz.h), w: crop.w*(el.naturalWidth/imgSz.w), h: crop.h*(el.naturalHeight/imgSz.h) });
  };

  return (
    <div style={{position:"fixed",inset:0,zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.92)",padding:24}} onClick={onClose}>
      <div style={{maxWidth:560,width:"90%",background:"#1C1917",border:"1px solid rgba(250,247,242,0.15)",borderRadius:8,padding:28}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
          <h3 style={{fontSize:16,fontWeight:600,color:"#FAF7F2",margin:0}}>Bijsnijden</h3>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"rgba(250,247,242,0.5)"}}>✕</button>
        </div>
        <div style={{position:"relative",display:"inline-block",width:"100%",userSelect:"none"}} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}>
          <img ref={imgRef} src={img.url} alt={img.name} onLoad={onLoad} draggable={false} style={{width:"100%",maxHeight:420,objectFit:"contain",display:"block"}}/>
          {crop.w > 0 && (
            <>
              {[{top:0,left:0,right:0,height:crop.y},{top:crop.y+crop.h,left:0,right:0,bottom:0},{top:crop.y,left:0,width:crop.x,height:crop.h},{top:crop.y,left:crop.x+crop.w,right:0,height:crop.h}].map((s,i)=>(
                <div key={i} style={{position:"absolute",background:"rgba(28,25,23,0.75)",pointerEvents:"none",...s}}/>
              ))}
              <div onMouseDown={e=>startA(e,"move")} style={{position:"absolute",top:crop.y,left:crop.x,width:crop.w,height:crop.h,border:"2px solid #C9A84C",cursor:"move"}}>
                <div style={{position:"absolute",inset:0,backgroundImage:"linear-gradient(rgba(201,168,76,0.1) 1px,transparent 1px),linear-gradient(90deg,rgba(201,168,76,0.1) 1px,transparent 1px)",backgroundSize:`${crop.w/3}px ${crop.h/3}px`,pointerEvents:"none"}}/>
                {([["nw",{top:-5,left:-5,cursor:"nw-resize"}],["ne",{top:-5,right:-5,cursor:"ne-resize"}],["sw",{bottom:-5,left:-5,cursor:"sw-resize"}],["se",{bottom:-5,right:-5,cursor:"se-resize"}]] as ["nw"|"ne"|"sw"|"se",React.CSSProperties][]).map(([pos,s])=>(
                  <div key={pos} onMouseDown={e=>startA(e,pos)} style={{position:"absolute",width:12,height:12,background:"#C9A84C",borderRadius:2,...s}}/>
                ))}
              </div>
            </>
          )}
        </div>
        <div style={{marginTop:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:11,color:"rgba(250,247,242,0.4)",letterSpacing:1}}>{Math.round(crop.w)} × {Math.round(crop.h)} → {width} × {height}px</span>
          <button onClick={confirm} style={{padding:"8px 24px",background:"#C9A84C",color:"#111",border:"none",borderRadius:4,fontSize:11,fontWeight:700,letterSpacing:2,textTransform:"uppercase",cursor:"pointer"}}>Bevestigen</button>
        </div>
      </div>
    </div>
  );
}

// ── Live Canvas Preview ─────────────────────────────────────────────────────
function LivePreview({ imageUrl, targetW, targetH, cropMode, cropData, watermark, wmOpacity, wmSize, wmColor, wmPos }: {
  imageUrl: string; targetW: number; targetH: number; cropMode: CropMode;
  cropData?: { x: number; y: number; w: number; h: number };
  watermark: string; wmOpacity: number; wmSize: number; wmColor: string; wmPos: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || targetW <= 0 || targetH <= 0) return;
    const ctx = canvas.getContext("2d")!;

    // Max preview size
    const MAX = 340;
    const ratio = Math.min(MAX / targetW, MAX / targetH, 1);
    const pw = Math.round(targetW * ratio);
    const ph = Math.round(targetH * ratio);
    canvas.width  = pw;
    canvas.height = ph;

    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => {
      const sw = el.naturalWidth, sh = el.naturalHeight;

      // Draw image with crop mode
      if (cropData) {
        ctx.drawImage(el, cropData.x, cropData.y, cropData.w, cropData.h, 0, 0, pw, ph);
      } else if (cropMode === "stretch") {
        ctx.drawImage(el, 0, 0, pw, ph);
      } else if (cropMode === "fit") {
        const sc = Math.min(pw / sw, ph / sh);
        const nw = sw * sc, nh = sh * sc;
        ctx.fillStyle = "#1C1917";
        ctx.fillRect(0, 0, pw, ph);
        ctx.drawImage(el, (pw - nw) / 2, (ph - nh) / 2, nw, nh);
      } else { // fill
        const sc = Math.max(pw / sw, ph / sh);
        const nw = sw * sc, nh = sh * sc;
        ctx.drawImage(el, (pw - nw) / 2, (ph - nh) / 2, nw, nh);
      }

      // Draw watermark
      if (watermark.trim()) {
        const fs = Math.max(10, wmSize * ratio);
        ctx.font = `bold ${fs}px sans-serif`;
        const tm   = ctx.measureText(watermark);
        const tw   = tm.width;
        const pad  = fs * 0.7;

        const positions: Record<string, [number, number]> = {
          tl: [pad, pad + fs],
          tc: [pw / 2 - tw / 2, pad + fs],
          tr: [pw - tw - pad, pad + fs],
          cl: [pad, ph / 2],
          cc: [pw / 2 - tw / 2, ph / 2],
          cr: [pw - tw - pad, ph / 2],
          bl: [pad, ph - pad],
          bc: [pw / 2 - tw / 2, ph - pad],
          br: [pw - tw - pad, ph - pad],
        };

        const [wx, wy] = positions[wmPos] ?? [pw - tw - pad, ph - pad];

        ctx.globalAlpha = wmOpacity / 100;
        ctx.shadowColor = "rgba(0,0,0,0.8)";
        ctx.shadowBlur  = 4;
        ctx.fillStyle   = wmColor;
        ctx.fillText(watermark, wx, wy);
        ctx.globalAlpha = 1;
        ctx.shadowBlur  = 0;
      }
    };
    el.src = imageUrl;
  }, [imageUrl, targetW, targetH, cropMode, cropData, watermark, wmOpacity, wmSize, wmColor, wmPos]);

  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
      <canvas ref={canvasRef} style={{maxWidth:"100%",borderRadius:4,border:"1px solid rgba(250,247,242,0.1)",display:"block"}}/>
      <span style={{fontSize:10,color:"rgba(250,247,242,0.35)",letterSpacing:2,textTransform:"uppercase"}}>{targetW} × {targetH}px</span>
    </div>
  );
}

// ── Constants & Data ────────────────────────────────────────────────────────
const FREE_LIMIT = 3;
const WARN_AT    = 2;
const BG    = "#1C1917";
const BG2   = "#231F1C";
const BG3   = "#2a2520";
const BORDER = "rgba(250,247,242,0.08)";
const ACCENT = "#C9A84C";

const PRESETS = [
  { cat: "Instagram", items: [
    { name: "Post vierkant",  w: 1080, h: 1080, tag: "1:1"    },
    { name: "Post portret",   w: 1080, h: 1350, tag: "4:5"    },
    { name: "Story / Reel",   w: 1080, h: 1920, tag: "9:16"   },
    { name: "Landscape",      w: 1080, h: 566,  tag: "1.91:1" },
  ]},
  { cat: "Twitter / X", items: [
    { name: "Post",    w: 1600, h: 900,  tag: "16:9" },
    { name: "Header",  w: 1500, h: 500,  tag: "3:1"  },
    { name: "Profiel", w: 400,  h: 400,  tag: "1:1"  },
  ]},
  { cat: "Facebook", items: [
    { name: "Post",        w: 1200, h: 630,  tag: "~1.9:1" },
    { name: "Cover",       w: 820,  h: 312,  tag: "~2.6:1" },
    { name: "Profiel",     w: 170,  h: 170,  tag: "1:1"    },
    { name: "Event cover", w: 1920, h: 1005, tag: "~1.9:1" },
  ]},
  { cat: "YouTube", items: [
    { name: "Thumbnail",    w: 1280, h: 720,  tag: "16:9" },
    { name: "Kanaal banner",w: 2560, h: 1440, tag: "16:9" },
    { name: "Profiel",      w: 800,  h: 800,  tag: "1:1"  },
  ]},
  { cat: "LinkedIn", items: [
    { name: "Post",    w: 1200, h: 628, tag: "~1.9:1" },
    { name: "Cover",   w: 1584, h: 396, tag: "4:1"    },
    { name: "Profiel", w: 400,  h: 400, tag: "1:1"    },
  ]},
  { cat: "TikTok", items: [
    { name: "Video cover", w: 1080, h: 1920, tag: "9:16" },
    { name: "Profiel",     w: 200,  h: 200,  tag: "1:1"  },
  ]},
  { cat: "Pinterest", items: [
    { name: "Pin",    w: 1000, h: 1500, tag: "2:3" },
    { name: "Vierkant",w:1000, h: 1000, tag: "1:1" },
  ]},
  { cat: "Standaard", items: [
    { name: "HD 720p",      w: 1280, h: 720,  tag: "16:9" },
    { name: "Full HD 1080p",w: 1920, h: 1080, tag: "16:9" },
    { name: "4K UHD",       w: 3840, h: 2160, tag: "16:9" },
    { name: "A4 web",       w: 794,  h: 1123, tag: "A4"   },
    { name: "Vierkant 1K",  w: 1000, h: 1000, tag: "1:1"  },
  ]},
];

const WM_POS_LABELS: Record<string, string> = {
  tl:"↖", tc:"↑", tr:"↗",
  cl:"←", cc:"·", cr:"→",
  bl:"↙", bc:"↓", br:"↘",
};

const CROP_OPTIONS: { value: CropMode; label: string; desc: string }[] = [
  { value: "fill",    label: "Fill",      desc: "Vult volledig, snijdt randen bij" },
  { value: "fit",     label: "Fit",       desc: "Hele foto zichtbaar, letterboxed" },
  { value: "stretch", label: "Stretch",   desc: "Uitrekken, kan vervormen" },
  { value: "none",    label: "Origineel", desc: "Behoudt originele afmetingen" },
];

// ── Main component ──────────────────────────────────────────────────────────
export default function Home() {
  const [view,       setView]       = useState<"home"|"resizer">("home");
  const [images,     setImages]     = useState<ImageFile[]>([]);
  const [dragging,   setDragging]   = useState(false);
  const [width,      setWidth]      = useState("1080");
  const [height,     setHeight]     = useState("1080");
  const [lockAR,     setLockAR]     = useState(false);
  const [cropMode,   setCropMode]   = useState<CropMode>("fill");
  const [format,     setFormat]     = useState("jpeg");
  const [quality,    setQuality]    = useState("85");
  const [processing, setProcessing] = useState(false);
  const [previewImg, setPreviewImg] = useState<ImageFile | null>(null);
  const [user,       setUser]       = useState<any>(null);
  const [hovered,    setHovered]    = useState<string | null>(null);
  const [dlCount,    setDlCount]    = useState(0);
  const [showLimit,  setShowLimit]  = useState(false);
  const [showBlock,  setShowBlock]  = useState(false);
  const [showCoffee, setShowCoffee] = useState(false);
  // Presets
  const [activeCat,  setActiveCat]  = useState("Instagram");
  const [showPresets,setShowPresets]= useState(false);
  // Watermark
  const [wm,        setWm]        = useState("");
  const [wmOpac,    setWmOpac]    = useState(60);
  const [wmSize,    setWmSize]    = useState(28);
  const [wmColor,   setWmColor]   = useState("#ffffff");
  const [wmPos,     setWmPos]     = useState("br");
  // Rename
  const [renamePattern, setRenamePattern] = useState("{name}_{w}x{h}");
  // AR ref
  const arRef    = useRef(1);
  const inputRef = useRef<HTMLInputElement>(null);

  const remaining = Math.max(0, FREE_LIMIT - dlCount);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
    setDlCount(parseInt(localStorage.getItem("brons_downloads") || "0"));
  }, []);

  // Update AR whenever dimensions change
  useEffect(() => {
    const w = parseFloat(width) || 1, h = parseFloat(height) || 1;
    arRef.current = w / h;
  }, [width, height]);

  const handleWidth = (v: string) => {
    setWidth(v);
    if (lockAR && v) setHeight(String(Math.round(parseFloat(v) / arRef.current) || ""));
  };
  const handleHeight = (v: string) => {
    setHeight(v);
    if (lockAR && v) setWidth(String(Math.round(parseFloat(v) * arRef.current) || ""));
  };

  const applyPreset = (w: number, h: number) => {
    setWidth(String(w)); setHeight(String(h));
    arRef.current = w / h; setShowPresets(false);
  };

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    setImages(prev => [...prev, ...Array.from(files)
      .filter(f => f.type.startsWith("image/"))
      .map(f => ({ id: Math.random().toString(36).slice(2), file: f, url: URL.createObjectURL(f), name: f.name }))]);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files);
  }, []);

  const removeImage  = (id: string) => setImages(p => p.filter(i => i.id !== id));
  const saveCrop = (id: string, c: { x: number; y: number; w: number; h: number }) => {
    setImages(p => p.map(i => i.id === id ? { ...i, cropData: c } : i)); setPreviewImg(null);
  };

  const getOutputName = (origName: string, tw: number, th: number, fmt: string) =>
    renamePattern
      .replace("{name}", origName.replace(/\.[^.]+$/, ""))
      .replace("{w}", String(tw)).replace("{h}", String(th))
      .replace("{format}", fmt) + "." + (fmt === "jpeg" ? "jpg" : fmt);

  // Draw watermark on a canvas context
  const drawWatermark = (ctx: CanvasRenderingContext2D, cw: number, ch: number) => {
    if (!wm.trim()) return;
    ctx.font = `bold ${wmSize}px sans-serif`;
    const tm  = ctx.measureText(wm);
    const tw2 = tm.width;
    const pad = wmSize * 0.8;

    const positions: Record<string, [number, number]> = {
      tl: [pad, pad + wmSize],
      tc: [cw / 2 - tw2 / 2, pad + wmSize],
      tr: [cw - tw2 - pad, pad + wmSize],
      cl: [pad, ch / 2],
      cc: [cw / 2 - tw2 / 2, ch / 2],
      cr: [cw - tw2 - pad, ch / 2],
      bl: [pad, ch - pad],
      bc: [cw / 2 - tw2 / 2, ch - pad],
      br: [cw - tw2 - pad, ch - pad],
    };

    const [wx, wy] = positions[wmPos] ?? [cw - tw2 - pad, ch - pad];
    ctx.globalAlpha = wmOpac / 100;
    ctx.shadowColor = "rgba(0,0,0,0.85)";
    ctx.shadowBlur  = 6;
    ctx.fillStyle   = wmColor;
    ctx.fillText(wm, wx, wy);
    ctx.globalAlpha = 1;
    ctx.shadowBlur  = 0;
  };

  const processImage = (img: HTMLImageElement, targetW: number, targetH: number, cropData?: { x: number; y: number; w: number; h: number }): HTMLCanvasElement => {
    const canvas = document.createElement("canvas");
    canvas.width = targetW; canvas.height = targetH;
    const ctx = canvas.getContext("2d")!;
    const srcW = img.naturalWidth, srcH = img.naturalHeight;

    if (cropData) {
      ctx.drawImage(img, cropData.x, cropData.y, cropData.w, cropData.h, 0, 0, targetW, targetH);
    } else if (cropMode === "stretch") {
      ctx.drawImage(img, 0, 0, targetW, targetH);
    } else if (cropMode === "fit") {
      const sc = Math.min(targetW / srcW, targetH / srcH);
      const nw = srcW * sc, nh = srcH * sc;
      ctx.fillStyle = BG; ctx.fillRect(0, 0, targetW, targetH);
      ctx.drawImage(img, (targetW - nw) / 2, (targetH - nh) / 2, nw, nh);
    } else if (cropMode === "fill") {
      const sc = Math.max(targetW / srcW, targetH / srcH);
      const nw = srcW * sc, nh = srcH * sc;
      ctx.drawImage(img, (targetW - nw) / 2, (targetH - nh) / 2, nw, nh);
    } else {
      ctx.drawImage(img, 0, 0);
    }

    // Draw watermark last
    drawWatermark(ctx, targetW, targetH);
    return canvas;
  };

  const saveToHistory = async (filename: string, file: File) => {
    if (!user) return;
    const path = `${user.id}/${Date.now()}_${filename}`;
    const { data: up } = await supabase.storage.from("images").upload(path, file, { upsert: true });
    let imageUrl = null;
    if (up?.path) {
      const { data: ud } = supabase.storage.from("images").getPublicUrl(path);
      imageUrl = ud?.publicUrl || null;
    }
    await supabase.from("history").insert({ user_id: user.id, filename, width: parseInt(width), height: parseInt(height), format, crop_mode: cropMode, image_url: imageUrl });
  };

  const processAndDownload = async () => {
    if (images.length === 0) return;
    if (!user && dlCount >= FREE_LIMIT) { setShowBlock(true); return; }
    setProcessing(true);
    let nc = dlCount;
    const tw = parseInt(width) || 800, th = parseInt(height) || 600;
    const mime = format === "png" ? "image/png" : format === "webp" ? "image/webp" : "image/jpeg";

    for (const imgFile of images) {
      const el = new Image(); el.src = imgFile.url;
      await new Promise(res => { el.onload = res; el.onerror = res; });
      const canvas = processImage(el, tw, th, imgFile.cropData);
      const outName = getOutputName(imgFile.name, tw, th, format);
      const dataUrl = canvas.toDataURL(mime, parseInt(quality) / 100);
      const a = document.createElement("a"); a.href = dataUrl; a.download = outName; a.click();
      if (user) {
        const blob = await (await fetch(dataUrl)).blob();
        await saveToHistory(outName, new File([blob], outName, { type: mime }));
      }
      await new Promise(res => setTimeout(res, 150));
      if (!user) nc++;
    }

    if (!user) {
      localStorage.setItem("brons_downloads", nc.toString());
      setDlCount(nc);
      if (nc >= WARN_AT) setShowLimit(true);
    }
    setProcessing(false);
  };

  // ── Shared styles ─────────────────────────────────────────────────────────
  const lbl: React.CSSProperties = { fontSize: 10, letterSpacing: 2.5, textTransform: "uppercase", color: "rgba(250,247,242,0.35)", display: "block", marginBottom: 6 };
  const inp: React.CSSProperties = { width: "100%", background: BG2, border: "1px solid rgba(250,247,242,0.1)", color: "#FAF7F2", padding: "9px 12px", fontSize: 13, outline: "none", borderRadius: 4, boxSizing: "border-box" };
  const sep = <div style={{ height: 1, background: BORDER, margin: "18px 0" }}/>;

  // ── HOME ─────────────────────────────────────────────────────────────────
  if (view === "home") {
    const tools = [
      { id:"resizer", num:"01", title:"Image\nResizer", desc:"Resize met social media presets, aspect ratio lock, watermark en meer.",       accent:ACCENT,    action:()=>setView("resizer") },
      { id:"editor",  num:"02", title:"Image\nEditor",  desc:"Professionele editor met lagen, curven, filters, vormen en tekst.",              accent:"#4a9eff", action:()=>window.location.href="/editor" },
      { id:"coffee",  num:"03", title:"Buy Me\na Coffee",desc:"Vind je IMAGE-TOOLZ nuttig? Overweeg een kleine donatie om het te steunen.",    accent:"#e07040", action:()=>setShowCoffee(true) },
    ];
    return (
      <div style={{minHeight:"100vh",background:BG,color:"#FAF7F2",fontFamily:"system-ui,-apple-system,sans-serif",position:"relative",overflow:"hidden"}}>
        <div style={{position:"fixed",inset:0,pointerEvents:"none",backgroundImage:"linear-gradient(rgba(250,247,242,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(250,247,242,0.025) 1px,transparent 1px)",backgroundSize:"80px 80px"}}/>
        <div style={{position:"fixed",inset:0,pointerEvents:"none",opacity:0.4,backgroundImage:`url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E")`}}/>

        {showCoffee && (
          <div style={{position:"fixed",inset:0,zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.88)"}} onClick={()=>setShowCoffee(false)}>
            <div style={{background:BG,border:"1px solid rgba(250,247,242,0.15)",padding:44,maxWidth:400,width:"90%",textAlign:"center",borderRadius:8}} onClick={e=>e.stopPropagation()}>
              <p style={{fontSize:10,letterSpacing:4,textTransform:"uppercase",color:"rgba(250,247,242,0.3)",marginBottom:14}}>Binnenkort</p>
              <h2 style={{fontSize:28,fontWeight:400,letterSpacing:"-1px",color:"#FAF7F2",margin:"0 0 14px",fontFamily:"Georgia,serif"}}>We're working<br/><em style={{color:"rgba(250,247,242,0.35)"}}>on it</em></h2>
              <p style={{fontSize:13,color:"rgba(250,247,242,0.45)",lineHeight:1.7,margin:"0 0 28px"}}>Donaties zijn binnenkort beschikbaar. Bedankt!</p>
              <button onClick={()=>setShowCoffee(false)} style={{padding:"11px 32px",background:"#FAF7F2",color:BG,border:"none",fontSize:11,fontWeight:700,letterSpacing:2,textTransform:"uppercase",cursor:"pointer",borderRadius:4}}>Sluiten</button>
            </div>
          </div>
        )}

        <header style={{position:"relative",zIndex:2,padding:"22px 48px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:`1px solid ${BORDER}`}}>
          <div style={{display:"flex",alignItems:"baseline",gap:14}}>
            <span style={{fontSize:11,letterSpacing:5,textTransform:"uppercase",color:"rgba(250,247,242,0.3)"}}>Vol. 01</span>
            <span style={{fontSize:11,letterSpacing:5,textTransform:"uppercase",color:"rgba(250,247,242,0.3)"}}>2026</span>
          </div>
          <div style={{position:"absolute",left:"50%",transform:"translateX(-50%)",fontSize:24,fontWeight:700,letterSpacing:"-0.8px",color:"#FAF7F2"}}>IMAGE-TOOLZ</div>
          <div style={{display:"flex",gap:20,alignItems:"center"}}>
            {user && <a href="/history" style={{fontSize:11,letterSpacing:2.5,textTransform:"uppercase",color:"rgba(250,247,242,0.4)",textDecoration:"none"}}>Geschiedenis</a>}
            <button onClick={()=>user?supabase.auth.signOut().then(()=>setUser(null)):window.location.href="/login"} style={{fontSize:11,letterSpacing:2.5,textTransform:"uppercase",color:"rgba(250,247,242,0.5)",background:"none",border:"1px solid rgba(250,247,242,0.15)",padding:"7px 18px",cursor:"pointer",borderRadius:3}}>
              {user?"Uitloggen":"Inloggen"}
            </button>
          </div>
        </header>

        <div style={{position:"relative",zIndex:2,padding:"64px 48px 0"}}>
          <p style={{fontSize:10,letterSpacing:5,textTransform:"uppercase",color:"rgba(250,247,242,0.28)",margin:"0 0 22px"}}>Image Tools · Browser Based</p>
          <h1 style={{fontSize:"clamp(52px,9vw,116px)",fontWeight:400,letterSpacing:"-3px",lineHeight:0.88,margin:0,color:"#FAF7F2",fontFamily:"Georgia,serif"}}>
            Bewerk.<br/><em style={{fontStyle:"italic",color:"rgba(250,247,242,0.3)"}}>Resize.</em><br/>Creëer.
          </h1>
        </div>

        <div style={{position:"relative",zIndex:2,margin:"52px 48px 0",borderTop:"1px solid rgba(250,247,242,0.09)",paddingTop:14,display:"flex",justifyContent:"space-between"}}>
          <span style={{fontSize:10,letterSpacing:3,textTransform:"uppercase",color:"rgba(250,247,242,0.22)"}}>Tools</span>
          <span style={{fontSize:10,letterSpacing:3,textTransform:"uppercase",color:"rgba(250,247,242,0.22)"}}>Gratis · No signup</span>
        </div>

        <div style={{position:"relative",zIndex:2,display:"grid",gridTemplateColumns:"repeat(3,1fr)",margin:"0 48px",borderLeft:`1px solid ${BORDER}`}}>
          {tools.map(t=>(
            <div key={t.id} onClick={t.action} onMouseEnter={()=>setHovered(t.id)} onMouseLeave={()=>setHovered(null)}
              style={{padding:"44px 38px",borderRight:`1px solid ${BORDER}`,borderBottom:`1px solid ${BORDER}`,cursor:"pointer",transition:"background 0.25s",background:hovered===t.id?"rgba(250,247,242,0.025)":"transparent",position:"relative",overflow:"hidden"}}>
              <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:t.accent,transform:hovered===t.id?"scaleX(1)":"scaleX(0)",transformOrigin:"left",transition:"transform 0.28s ease"}}/>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:36}}>
                <span style={{fontSize:10,letterSpacing:3,textTransform:"uppercase",color:"rgba(250,247,242,0.22)"}}>{t.num}</span>
                <span style={{fontSize:44,fontWeight:300,color:"rgba(250,247,242,0.06)",lineHeight:1}}>{t.num}</span>
              </div>
              <h2 style={{fontSize:"clamp(28px,2.8vw,44px)",fontWeight:400,letterSpacing:"-1.2px",lineHeight:1,margin:"0 0 18px",color:hovered===t.id?t.accent:"#FAF7F2",transition:"color 0.25s",whiteSpace:"pre-line",fontFamily:"Georgia,serif"}}>{t.title}</h2>
              <p style={{fontSize:13,lineHeight:1.7,color:"rgba(250,247,242,0.42)",margin:"0 0 36px",fontWeight:300}}>{t.desc}</p>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:28,height:1,background:hovered===t.id?t.accent:"rgba(250,247,242,0.18)",transition:"all 0.25s"}}/>
                <span style={{fontSize:10,letterSpacing:3,textTransform:"uppercase",color:hovered===t.id?t.accent:"rgba(250,247,242,0.28)",transition:"color 0.25s"}}>Open</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{position:"relative",zIndex:2,padding:"28px 48px",display:"flex",justifyContent:"space-between",borderTop:"1px solid rgba(250,247,242,0.05)",marginTop:48}}>
          <span style={{fontSize:10,letterSpacing:3,textTransform:"uppercase",color:"rgba(250,247,242,0.18)"}}>© 2026 IMAGE-TOOLZ</span>
          <span style={{fontSize:10,letterSpacing:3,textTransform:"uppercase",color:"rgba(250,247,242,0.18)"}}>Browser Based · Privacy First</span>
        </div>
      </div>
    );
  }

  // ── RESIZER ───────────────────────────────────────────────────────────────
  const tw = parseInt(width)  || 1080;
  const th = parseInt(height) || 1080;
  const firstImage = images[0];

  return (
    <div style={{minHeight:"100vh",background:BG,color:"#FAF7F2",fontFamily:"system-ui,-apple-system,sans-serif",position:"relative"}}>
      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,opacity:0.4,backgroundImage:`url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E")`}}/>

      {previewImg && <CropPreview img={previewImg} width={tw} height={th} onClose={()=>setPreviewImg(null)} onConfirm={c=>saveCrop(previewImg.id,c)}/>}

      {showBlock && (
        <div style={{position:"fixed",inset:0,zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.9)"}} onClick={()=>setShowBlock(false)}>
          <div style={{background:BG,border:"1px solid rgba(250,247,242,0.15)",padding:44,maxWidth:420,width:"90%",textAlign:"center",borderRadius:8}} onClick={e=>e.stopPropagation()}>
            <h2 style={{fontSize:24,fontWeight:400,letterSpacing:"-0.8px",color:"#FAF7F2",margin:"0 0 12px",fontFamily:"Georgia,serif"}}>Download limiet bereikt</h2>
            <p style={{fontSize:13,color:"rgba(250,247,242,0.5)",lineHeight:1.7,margin:"0 0 28px"}}>Log in voor onbeperkt downloaden — gratis.</p>
            <button onClick={()=>window.location.href="/login"} style={{width:"100%",padding:"13px",background:"#FAF7F2",color:BG,border:"none",fontSize:11,fontWeight:700,letterSpacing:3,textTransform:"uppercase",cursor:"pointer",borderRadius:4,marginBottom:10}}>Inloggen</button>
            <button onClick={()=>setShowBlock(false)} style={{background:"none",border:"none",fontSize:11,color:"rgba(250,247,242,0.3)",cursor:"pointer"}}>Sluiten</button>
          </div>
        </div>
      )}

      {showLimit && !user && remaining > 0 && (
        <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:50,background:BG2,borderTop:"1px solid rgba(250,247,242,0.1)",padding:"14px 40px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:ACCENT}}/>
            <p style={{fontSize:12,color:"rgba(250,247,242,0.65)",margin:0}}>Nog <strong style={{color:"#FAF7F2"}}>{remaining} gratis download{remaining!==1?"s":""}</strong> over.</p>
          </div>
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>window.location.href="/login"} style={{padding:"7px 20px",background:ACCENT,color:"#111",border:"none",fontSize:11,fontWeight:700,letterSpacing:2,textTransform:"uppercase",cursor:"pointer",borderRadius:3}}>Inloggen</button>
            <button onClick={()=>setShowLimit(false)} style={{background:"none",border:"none",color:"rgba(250,247,242,0.3)",cursor:"pointer",fontSize:16}}>✕</button>
          </div>
        </div>
      )}

      {/* Header */}
      <header style={{position:"relative",zIndex:2,padding:"18px 40px",borderBottom:`1px solid ${BORDER}`,display:"flex",alignItems:"center",justifyContent:"space-between",background:BG}}>
        <button onClick={()=>setView("home")} style={{fontSize:18,fontWeight:700,letterSpacing:"-0.6px",color:"#FAF7F2",background:"none",border:"none",cursor:"pointer",padding:0}}>IMAGE-TOOLZ</button>
        <span style={{position:"absolute",left:"50%",transform:"translateX(-50%)",fontSize:11,color:"rgba(250,247,242,0.35)",letterSpacing:3,textTransform:"uppercase"}}>Image Resizer</span>
        <div style={{display:"flex",gap:16,alignItems:"center"}}>
          <a href="/editor" style={{fontSize:11,letterSpacing:2.5,textTransform:"uppercase",color:"rgba(250,247,242,0.4)",textDecoration:"none"}}>Editor</a>
          {user && <a href="/history" style={{fontSize:11,letterSpacing:2.5,textTransform:"uppercase",color:"rgba(250,247,242,0.4)",textDecoration:"none"}}>Geschiedenis</a>}
          {!user && <span style={{fontSize:11,letterSpacing:1.5,color:"rgba(250,247,242,0.35)"}}>{remaining} downloads over</span>}
          <button onClick={()=>user?supabase.auth.signOut().then(()=>setUser(null)):window.location.href="/login"} style={{fontSize:11,letterSpacing:2,textTransform:"uppercase",color:"rgba(250,247,242,0.5)",background:"none",border:"1px solid rgba(250,247,242,0.15)",padding:"6px 16px",cursor:"pointer",borderRadius:3}}>
            {user?"Uitloggen":"Inloggen"}
          </button>
        </div>
      </header>

      {/* Main grid */}
      <div style={{position:"relative",zIndex:1,display:"grid",gridTemplateColumns:"1fr 380px",gap:0,minHeight:"calc(100vh - 61px)"}}>

        {/* LEFT — upload + preview */}
        <div style={{overflowY:"auto",padding:"32px 36px",display:"flex",flexDirection:"column",gap:24,borderRight:`1px solid ${BORDER}`}}>
          <div>
            <p style={{fontSize:10,letterSpacing:5,textTransform:"uppercase",color:"rgba(250,247,242,0.28)",margin:"0 0 10px"}}>Tool — 01</p>
            <h1 style={{fontSize:38,fontWeight:400,letterSpacing:"-1.5px",margin:0,color:"#FAF7F2",fontFamily:"Georgia,serif"}}>Image Resizer</h1>
          </div>

          {/* Drop zone */}
          <div onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={onDrop} onClick={()=>inputRef.current?.click()}
            style={{padding:"48px 40px",textAlign:"center",cursor:"pointer",transition:"all 0.2s",border:dragging?`1.5px dashed ${ACCENT}`:`1.5px dashed rgba(250,247,242,0.12)`,background:dragging?"rgba(201,168,76,0.04)":"transparent",borderRadius:6}}>
            <div style={{width:48,height:48,borderRadius:10,background:dragging?"rgba(201,168,76,0.14)":BG2,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px",transition:"all 0.2s"}}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={dragging?ACCENT:"rgba(250,247,242,0.3)"} strokeWidth="1.8" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
            </div>
            <p style={{fontSize:14,color:dragging?ACCENT:"#FAF7F2",margin:"0 0 6px",fontWeight:500}}>Sleep afbeeldingen hierheen</p>
            <p style={{fontSize:11,color:"rgba(250,247,242,0.35)",margin:0,letterSpacing:2}}>PNG · JPG · WebP · GIF</p>
            <input ref={inputRef} type="file" multiple accept="image/*" style={{display:"none"}} onChange={e=>addFiles(e.target.files)}/>
          </div>

          {/* Live preview — shown when image + dimensions exist */}
          {firstImage && tw > 0 && th > 0 && (
            <div style={{background:BG2,border:`1px solid ${BORDER}`,borderRadius:6,padding:"20px",display:"flex",flexDirection:"column",gap:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:10,letterSpacing:2.5,textTransform:"uppercase",color:"rgba(250,247,242,0.35)"}}>Live preview</span>
                <span style={{fontSize:10,color:"rgba(250,247,242,0.25)",letterSpacing:1}}>{wm?"met watermerk":""}</span>
              </div>
              <LivePreview
                imageUrl={firstImage.url}
                targetW={tw}
                targetH={th}
                cropMode={cropMode}
                cropData={firstImage.cropData}
                watermark={wm}
                wmOpacity={wmOpac}
                wmSize={wmSize}
                wmColor={wmColor}
                wmPos={wmPos}
              />
              {wm && (
                <div style={{display:"flex",alignItems:"center",gap:6,padding:"8px 12px",borderRadius:4,background:"rgba(201,168,76,0.08)",border:"1px solid rgba(201,168,76,0.2)"}}>
                  <span style={{fontSize:11,color:ACCENT}}>✓ Watermerk actief: "{wm}"</span>
                </div>
              )}
            </div>
          )}

          {/* Images grid */}
          {images.length > 0 && (
            <>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:11,color:"rgba(250,247,242,0.4)",letterSpacing:2}}>{images.length} afbeelding{images.length!==1?"en":""}</span>
                <button onClick={()=>setImages([])} style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:"rgba(250,247,242,0.25)",background:"none",border:"none",cursor:"pointer"}}>Alles verwijderen</button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(110px,1fr))",gap:8}}>
                {images.map(img=>(
                  <div key={img.id} style={{position:"relative",aspectRatio:"1",overflow:"hidden",borderRadius:5,background:BG2,border:`1px solid ${BORDER}`,cursor:"pointer"}}
                    onMouseEnter={e=>(e.currentTarget.querySelector(".ov")as HTMLElement).style.opacity="1"}
                    onMouseLeave={e=>(e.currentTarget.querySelector(".ov")as HTMLElement).style.opacity="0"}>
                    <img src={img.url} alt={img.name} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                    {img.cropData && <div style={{position:"absolute",top:6,left:6,background:ACCENT,color:"#111",fontSize:8,padding:"2px 7px",letterSpacing:1.5,textTransform:"uppercase",borderRadius:2,fontWeight:700}}>Crop</div>}
                    <div className="ov" style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.72)",display:"flex",alignItems:"center",justifyContent:"center",gap:6,transition:"opacity 0.18s",opacity:0}}>
                      <button onClick={()=>setPreviewImg(img)} style={{fontSize:10,padding:"5px 10px",background:ACCENT,color:"#111",border:"none",cursor:"pointer",letterSpacing:1,textTransform:"uppercase",borderRadius:3,fontWeight:700}}>Crop</button>
                      <button onClick={()=>removeImage(img.id)} style={{fontSize:10,padding:"5px 8px",background:"rgba(250,247,242,0.12)",color:"#FAF7F2",border:"none",cursor:"pointer",borderRadius:3}}>✕</button>
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

        {/* RIGHT — settings */}
        <div style={{overflowY:"auto",background:BG,borderLeft:`1px solid ${BORDER}`}}>

          {/* Preset button */}
          <div style={{padding:"16px 20px",borderBottom:`1px solid ${BORDER}`,position:"relative"}}>
            <button onClick={()=>setShowPresets(!showPresets)} style={{width:"100%",padding:"10px 16px",background:showPresets?"rgba(201,168,76,0.14)":BG2,border:`1px solid ${showPresets?"rgba(201,168,76,0.35)":BORDER}`,color:showPresets?ACCENT:"#FAF7F2",fontSize:12,cursor:"pointer",borderRadius:5,display:"flex",alignItems:"center",justifyContent:"space-between",transition:"all 0.15s"}}>
              <span style={{fontWeight:500}}>📐 Social media presets</span>
              <span style={{fontSize:10,transform:showPresets?"rotate(180deg)":"none",transition:"transform 0.2s"}}>▼</span>
            </button>
            {showPresets && (
              <div style={{position:"absolute",top:"100%",left:20,right:20,background:BG2,border:`1px solid rgba(250,247,242,0.15)`,borderRadius:6,zIndex:50,boxShadow:"0 12px 40px rgba(0,0,0,0.6)",maxHeight:360,overflowY:"auto"}}>
                {/* Category tabs */}
                <div style={{display:"flex",overflowX:"auto",borderBottom:`1px solid ${BORDER}`,padding:"0 4px"}}>
                  {PRESETS.map(p=>(
                    <button key={p.cat} onClick={()=>setActiveCat(p.cat)} style={{padding:"8px 10px",background:"transparent",border:"none",color:activeCat===p.cat?ACCENT:"rgba(250,247,242,0.4)",fontSize:10,letterSpacing:1,cursor:"pointer",whiteSpace:"nowrap",borderBottom:activeCat===p.cat?`2px solid ${ACCENT}`:"2px solid transparent",transition:"all 0.1s"}}>
                      {p.cat}
                    </button>
                  ))}
                </div>
                {PRESETS.find(p=>p.cat===activeCat)?.items.map(item=>(
                  <button key={item.name} onClick={()=>applyPreset(item.w,item.h)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",width:"100%",padding:"10px 16px",background:"transparent",border:"none",color:"#FAF7F2",fontSize:12,cursor:"pointer",textAlign:"left",transition:"background 0.1s",borderBottom:`1px solid ${BORDER}`}}
                    onMouseEnter={e=>(e.currentTarget.style.background="rgba(250,247,242,0.04)")}
                    onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                    <span>{item.name}</span>
                    <span style={{fontSize:10,color:"rgba(250,247,242,0.4)",letterSpacing:0.5}}>{item.w} × {item.h} · {item.tag}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{padding:"20px",display:"flex",flexDirection:"column",gap:18}}>

            {/* Dimensions */}
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <span style={lbl}>Afmetingen</span>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 36px 1fr",gap:8,alignItems:"center"}}>
                <div>
                  <label style={{...lbl,marginBottom:4,fontSize:9}}>BREEDTE</label>
                  <input type="text" inputMode="numeric" value={width} onChange={e=>handleWidth(e.target.value.replace(/[^0-9]/g,""))} style={inp}
                    onFocus={e=>e.currentTarget.style.borderColor="rgba(201,168,76,0.4)"} onBlur={e=>e.currentTarget.style.borderColor="rgba(250,247,242,0.1)"}/>
                </div>
                <button onClick={()=>setLockAR(!lockAR)} title="Vergrendel verhouding" style={{width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center",background:lockAR?"rgba(201,168,76,0.14)":BG2,border:`1px solid ${lockAR?"rgba(201,168,76,0.35)":BORDER}`,borderRadius:4,cursor:"pointer",fontSize:15,color:lockAR?ACCENT:"rgba(250,247,242,0.4)",transition:"all 0.15s",marginTop:18}}>
                  {lockAR?"🔒":"🔓"}
                </button>
                <div>
                  <label style={{...lbl,marginBottom:4,fontSize:9}}>HOOGTE</label>
                  <input type="text" inputMode="numeric" value={height} onChange={e=>handleHeight(e.target.value.replace(/[^0-9]/g,""))} style={inp}
                    onFocus={e=>e.currentTarget.style.borderColor="rgba(201,168,76,0.4)"} onBlur={e=>e.currentTarget.style.borderColor="rgba(250,247,242,0.1)"}/>
                </div>
              </div>
              {lockAR && <p style={{fontSize:10,color:ACCENT,marginTop:6,letterSpacing:1}}>🔒 Beeldverhouding vergrendeld</p>}
            </div>

            {sep}

            {/* Crop mode */}
            <div>
              <span style={lbl}>Modus</span>
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                {CROP_OPTIONS.map(opt=>(
                  <button key={opt.value} onClick={()=>setCropMode(opt.value)} style={{textAlign:"left",padding:"9px 12px",cursor:"pointer",transition:"all 0.15s",background:cropMode===opt.value?"rgba(201,168,76,0.1)":"transparent",border:cropMode===opt.value?`1px solid rgba(201,168,76,0.3)`:`1px solid rgba(250,247,242,0.06)`,color:cropMode===opt.value?ACCENT:"rgba(250,247,242,0.5)",borderRadius:5}}>
                    <div style={{fontSize:12,fontWeight:500,color:cropMode===opt.value?ACCENT:"#FAF7F2"}}>{opt.label}</div>
                    <div style={{fontSize:10,color:"rgba(250,247,242,0.35)",marginTop:2}}>{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {sep}

            {/* Format */}
            <div>
              <span style={lbl}>Formaat</span>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:format!=="png"?12:0}}>
                {["jpeg","png","webp"].map(f=>(
                  <button key={f} onClick={()=>setFormat(f)} style={{padding:"8px",background:format===f?"rgba(201,168,76,0.14)":"transparent",border:format===f?`1px solid rgba(201,168,76,0.35)`:`1px solid ${BORDER}`,color:format===f?ACCENT:"rgba(250,247,242,0.45)",fontSize:11,cursor:"pointer",borderRadius:4,fontWeight:format===f?700:400,letterSpacing:1,textTransform:"uppercase",transition:"all 0.1s"}}>
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>
              {format !== "png" && (
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                    <label style={{...lbl,marginBottom:0}}>Kwaliteit</label>
                    <span style={{fontSize:11,color:"rgba(250,247,242,0.4)"}}>{quality}%</span>
                  </div>
                  <input type="range" min="10" max="100" value={quality} onChange={e=>setQuality(e.target.value)} style={{accentColor:ACCENT,width:"100%"}}/>
                </div>
              )}
            </div>

            {sep}

            {/* Watermark */}
            <div>
              <span style={lbl}>Watermerk</span>
              <input type="text" value={wm} onChange={e=>setWm(e.target.value)} placeholder="© Jouw naam of tekst" style={{...inp,marginBottom:wm?12:0}}
                onFocus={e=>e.currentTarget.style.borderColor="rgba(201,168,76,0.4)"} onBlur={e=>e.currentTarget.style.borderColor="rgba(250,247,242,0.1)"}/>
              {wm && (
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {/* Positie grid */}
                  <div>
                    <label style={{...lbl,marginBottom:6,fontSize:9}}>POSITIE</label>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:3}}>
                      {Object.entries(WM_POS_LABELS).map(([v,icon])=>(
                        <button key={v} onClick={()=>setWmPos(v)} style={{padding:"7px",background:wmPos===v?"rgba(201,168,76,0.14)":"transparent",border:wmPos===v?`1px solid rgba(201,168,76,0.35)`:`1px solid ${BORDER}`,color:wmPos===v?ACCENT:"rgba(250,247,242,0.4)",fontSize:16,cursor:"pointer",borderRadius:3,transition:"all 0.1s"}}>{icon}</button>
                      ))}
                    </div>
                  </div>
                  {/* Dekking */}
                  <div>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <label style={{...lbl,marginBottom:0,fontSize:9}}>DEKKING</label>
                      <span style={{fontSize:10,color:"rgba(250,247,242,0.4)"}}>{wmOpac}%</span>
                    </div>
                    <input type="range" min="5" max="100" value={wmOpac} onChange={e=>setWmOpac(parseInt(e.target.value))} style={{accentColor:ACCENT,width:"100%"}}/>
                  </div>
                  {/* Grootte */}
                  <div>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <label style={{...lbl,marginBottom:0,fontSize:9}}>GROOTTE</label>
                      <span style={{fontSize:10,color:"rgba(250,247,242,0.4)"}}>{wmSize}px</span>
                    </div>
                    <input type="range" min="10" max="100" value={wmSize} onChange={e=>setWmSize(parseInt(e.target.value))} style={{accentColor:ACCENT,width:"100%"}}/>
                  </div>
                  {/* Kleur */}
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <label style={{...lbl,marginBottom:0,fontSize:9}}>KLEUR</label>
                    <input type="color" value={wmColor} onChange={e=>setWmColor(e.target.value)} style={{width:30,height:24,borderRadius:3,border:`1px solid ${BORDER}`,cursor:"pointer"}}/>
                    <span style={{fontSize:10,color:"rgba(250,247,242,0.35)",fontFamily:"monospace"}}>{wmColor.toUpperCase()}</span>
                  </div>
                </div>
              )}
            </div>

            {sep}

            {/* Rename pattern */}
            <div>
              <span style={lbl}>Bestandsnaam patroon</span>
              <input type="text" value={renamePattern} onChange={e=>setRenamePattern(e.target.value)} style={{...inp,fontFamily:"monospace"}}
                onFocus={e=>e.currentTarget.style.borderColor="rgba(201,168,76,0.4)"} onBlur={e=>e.currentTarget.style.borderColor="rgba(250,247,242,0.1)"}/>
              <p style={{fontSize:9,color:"rgba(250,247,242,0.22)",marginTop:5,lineHeight:1.6}}>
                Variabelen: <code style={{color:"rgba(250,247,242,0.4)"}}>{"{name}"}</code> <code style={{color:"rgba(250,247,242,0.4)"}}>{"{w}"}</code> <code style={{color:"rgba(250,247,242,0.4)"}}>{"{h}"}</code> <code style={{color:"rgba(250,247,242,0.4)"}}>{"{format}"}</code>
              </p>
              {firstImage && <p style={{fontSize:10,color:"rgba(250,247,242,0.4)",marginTop:4}}>Preview: <strong style={{color:"#FAF7F2"}}>{getOutputName(firstImage.name,tw,th,format)}</strong></p>}
            </div>

            {sep}

            {/* Download counter */}
            {!user && (
              <div>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                  <span style={lbl}>Gratis downloads</span>
                  <span style={{fontSize:11,color:"rgba(250,247,242,0.4)"}}>{dlCount}/{FREE_LIMIT}</span>
                </div>
                <div style={{display:"flex",gap:4}}>
                  {Array.from({length:FREE_LIMIT}).map((_,i)=>(
                    <div key={i} style={{flex:1,height:3,background:i<dlCount?"rgba(250,247,242,0.12)":ACCENT,borderRadius:2,transition:"all 0.3s"}}/>
                  ))}
                </div>
              </div>
            )}

            {/* Download button */}
            <button onClick={processAndDownload} disabled={images.length===0||processing}
              style={{width:"100%",padding:"14px",background:images.length===0||(!user&&dlCount>=FREE_LIMIT)?"rgba(250,247,242,0.06)":processing?"rgba(201,168,76,0.3)":ACCENT,color:images.length===0||(!user&&dlCount>=FREE_LIMIT)?"rgba(250,247,242,0.2)":processing?"rgba(250,247,242,0.5)":"#111",border:"none",fontSize:12,letterSpacing:2.5,textTransform:"uppercase",cursor:images.length===0?"not-allowed":"pointer",transition:"all 0.2s",borderRadius:5,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
              {processing?"Verwerken...":!user&&dlCount>=FREE_LIMIT?"Inloggen vereist":images.length===0?"Voeg afbeeldingen toe":`Download ${images.length} foto${images.length>1?"'s":""}`}
            </button>

          </div>
        </div>
      </div>
    </div>
  );
}