"use client";
import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────
type Tool = "move"|"select"|"crop"|"eyedropper"|"brush"|"eraser"|"fill"|"gradient"|"dodge"|"burn"|"text"|"shape"|"sticker"|"zoom"|"hand";
type ShapeKind = "rect"|"ellipse"|"line"|"arrow"|"triangle"|"star"|"polygon";
type Blend = "normal"|"multiply"|"screen"|"overlay"|"darken"|"lighten"|"color-dodge"|"color-burn"|"hard-light"|"soft-light"|"difference"|"exclusion"|"hue"|"saturation"|"color"|"luminosity";
type PanelTab = "adjust"|"filters"|"layers"|"history";
type GradDir = "to right"|"to bottom"|"to bottom right"|"to bottom left"|"radial";

interface Layer {
  id: string;
  type: "image"|"text"|"shape"|"sticker"|"gradient";
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blend: Blend;
  // text
  text?: string; x?: number; y?: number; fontSize?: number; fontFamily?: string;
  color?: string; bold?: boolean; italic?: boolean; underline?: boolean; shadow?: boolean;
  // shape
  shapeKind?: ShapeKind; x2?: number; y2?: number;
  fill?: string; stroke?: string; strokeW?: number; radius?: number;
  // sticker
  emoji?: string; imgUrl?: string; w?: number; h?: number; rot?: number; isImg?: boolean;
  // gradient
  gradColor1?: string; gradColor2?: string; gradDir?: GradDir;
}

interface HistEntry { label: string; ts: number; }

const FREE = 3;

// ─── Colors ───────────────────────────────────────────────────────────────────
const C = {
  bg:     "#1c1c1c",
  bg2:    "#232323",
  panel:  "#272727",
  panel2: "#2f2f2f",
  panel3: "#383838",
  panel4: "#424242",
  border: "rgba(255,255,255,0.07)",
  borderHi:"rgba(255,255,255,0.13)",
  text:   "#e2e2e2",
  muted:  "rgba(226,226,226,0.38)",
  accent: "#4a9eff",
  aDim:   "rgba(74,158,255,0.14)",
  aBorder:"rgba(74,158,255,0.35)",
  gold:   "#C9A84C",
  gDim:   "rgba(201,168,76,0.14)",
  gBorder:"rgba(201,168,76,0.32)",
  red:    "#e05252",
  green:  "#52c472",
  menuBg: "#2e2e2e",
};

// ─── Data ─────────────────────────────────────────────────────────────────────
const FILTERS = [
  {n:"Origineel",  f:"none"},
  {n:"Warm",       f:"sepia(0.28) saturate(1.4) brightness(1.05)"},
  {n:"Koel",       f:"hue-rotate(28deg) saturate(0.9) brightness(1.05)"},
  {n:"Vintage",    f:"sepia(0.5) contrast(0.85) brightness(0.95) saturate(0.8)"},
  {n:"Zwart-wit",  f:"grayscale(1)"},
  {n:"Helder",     f:"brightness(1.3) contrast(1.1)"},
  {n:"Dramatisch", f:"contrast(1.45) saturate(1.3) brightness(0.9)"},
  {n:"Fade",       f:"opacity(0.85) brightness(1.1) saturate(0.7)"},
  {n:"Boost",      f:"saturate(1.8) contrast(1.1)"},
  {n:"Neon",       f:"saturate(2.5) brightness(1.1) contrast(1.3)"},
  {n:"Ijzig",      f:"hue-rotate(180deg) saturate(0.7) brightness(1.1)"},
  {n:"Goud",       f:"sepia(0.8) saturate(2) hue-rotate(-10deg)"},
  {n:"Cyaan",      f:"hue-rotate(160deg) saturate(1.3) brightness(1.05)"},
  {n:"Roze",       f:"hue-rotate(300deg) saturate(1.5) brightness(1.1)"},
  {n:"Droom",      f:"brightness(1.15) contrast(0.9) saturate(0.8) blur(0.4px)"},
  {n:"Scherp",     f:"contrast(1.3) saturate(1.2) brightness(0.98)"},
];

const FONTS = [
  "Arial","Georgia","Impact","Courier New","Verdana","Times New Roman",
  "Trebuchet MS","Arial Black","Comic Sans MS","Palatino","Tahoma",
];

const EXTRA_FONTS = [
  {n:"Montserrat",f:"Montserrat"},{n:"Playfair Display",f:"Playfair Display"},
  {n:"Oswald",f:"Oswald"},{n:"Poppins",f:"Poppins"},
  {n:"Dancing Script",f:"Dancing Script"},{n:"Pacifico",f:"Pacifico"},
  {n:"Bebas Neue",f:"Bebas Neue"},{n:"Great Vibes",f:"Great Vibes"},
  {n:"Lobster",f:"Lobster"},{n:"Permanent Marker",f:"Permanent Marker"},
];

const ALL_FONTS = [...FONTS, ...EXTRA_FONTS.map(f=>f.n)];

const STICKERS = [
  "😀","😂","😍","🥰","😎","🤩","😢","😡","🥳","🤔","👍","👎","❤️","🔥","⭐",
  "🎉","🎨","🌈","🌟","💫","🦋","🌸","🍀","🌙","☀️","⚡","🎵","🎶","🏆","💎",
  "🐶","🐱","🦊","🐼","🦁","🦄","🐙","🌺","🎭","🍕","🎮","🚀","💻","📸","🎬",
  "🌊","🏔","🌅","🎪","🎠","🛸","🔮","🪄","🌴","🦅","🌻","🍁","🎯","💡","🔑",
];

const BLENDS: Blend[] = [
  "normal","multiply","screen","overlay","darken","lighten",
  "color-dodge","color-burn","hard-light","soft-light","difference",
  "exclusion","hue","saturation","color","luminosity",
];

const BORDERS = [
  {n:"Geen",v:"none",c:"transparent"},
  {n:"Dun wit",v:"4px solid #e2e2e2",c:"#e2e2e2"},
  {n:"Dik wit",v:"18px solid #e2e2e2",c:"#e2e2e2"},
  {n:"Zwart",v:"18px solid #111",c:"#111"},
  {n:"Goud",v:"10px solid #C9A84C",c:"#C9A84C"},
  {n:"Gestippeld",v:"4px dashed #e2e2e2",c:"#e2e2e2"},
  {n:"Dubbel",v:"8px double #e2e2e2",c:"#e2e2e2"},
  {n:"Grijs",v:"10px solid #555",c:"#555"},
  {n:"Blauw",v:"10px solid #4a9eff",c:"#4a9eff"},
  {n:"Rood",v:"10px solid #e05252",c:"#e05252"},
  {n:"Groen",v:"10px solid #52c472",c:"#52c472"},
  {n:"Roze",v:"8px solid #e87cbe",c:"#e87cbe"},
];

const SWATCHES = [
  "#ffffff","#000000","#4a9eff","#C9A84C","#e05252",
  "#52c472","#e0854a","#cc88ff","#ff88cc","#ffcc44",
  "#00cccc","#ff6600","#9944ff","#44ffaa","#ff4488",
];

const GRAD_DIRS: {v:GradDir;l:string}[] = [
  {v:"to right",l:"→ Horizontaal"},
  {v:"to bottom",l:"↓ Verticaal"},
  {v:"to bottom right",l:"↘ Diagonaal"},
  {v:"to bottom left",l:"↙ Diagonaal"},
  {v:"radial",l:"○ Radiaal"},
];

const gFonts = "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700&family=Playfair+Display:ital,wght@0,400;1,400&family=Oswald&family=Poppins:wght@400;700&family=Dancing+Script&family=Pacifico&family=Bebas+Neue&family=Great+Vibes&family=Lobster&family=Permanent+Marker&display=swap";

const uid = () => Math.random().toString(36).slice(2);

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
  @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
  @keyframes fadeIn{from{opacity:0}to{opacity:1}}
  @keyframes slideIn{from{opacity:0;transform:translateX(5px)}to{opacity:1;transform:translateX(0)}}
  @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
  ::-webkit-scrollbar{width:5px;height:5px}
  ::-webkit-scrollbar-track{background:transparent}
  ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:3px}
  ::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,0.2)}
  input[type=range]{accent-color:#4a9eff;cursor:pointer}
  select option{background:#272727}
  .mi{display:flex;align-items:center;padding:0 11px;height:100%;font-size:12px;cursor:pointer;color:rgba(226,226,226,0.65);user-select:none;white-space:nowrap;transition:background 0.1s}
  .mi:hover,.mi.open{background:rgba(255,255,255,0.1);color:#e2e2e2}
  .dd{position:fixed;background:#1e1e1e;border:1px solid rgba(255,255,255,0.14);border-radius:6px;min-width:190px;z-index:9000;box-shadow:0 14px 48px rgba(0,0,0,0.75);padding:4px 0;animation:fadeIn 0.1s ease}
  .ddr{padding:7px 16px;font-size:12px;color:rgba(226,226,226,0.75);cursor:pointer;display:flex;justify-content:space-between;gap:24px;white-space:nowrap;align-items:center}
  .ddr:hover{background:rgba(255,255,255,0.08);color:#e2e2e2}
  .ddr.dim{opacity:0.28;cursor:default;pointer-events:none}
  .dds{height:1px;background:rgba(255,255,255,0.08);margin:3px 0}
  .ddsub{font-size:9px;letter-spacing:2px;text-transform:uppercase;color:rgba(226,226,226,0.3);padding:6px 16px 3px;cursor:default}
  .tb{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;width:100%;height:42px;border:none;cursor:pointer;background:transparent;color:rgba(226,226,226,0.35);transition:all 0.1s;border-left:2.5px solid transparent;position:relative}
  .tb:hover{background:rgba(255,255,255,0.06);color:#e2e2e2}
  .tb.on{background:rgba(74,158,255,0.13);color:#4a9eff;border-left:2.5px solid #4a9eff}
  .ah{display:flex;align-items:center;justify-content:space-between;padding:8px 14px;cursor:pointer;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:rgba(226,226,226,0.45);border-bottom:1px solid rgba(255,255,255,0.05);user-select:none;transition:all 0.1s}
  .ah:hover{background:rgba(255,255,255,0.04);color:#e2e2e2}
  .lr{display:flex;align-items:center;gap:7px;padding:5px 10px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.04);transition:background 0.1s;user-select:none}
  .lr:hover{background:rgba(255,255,255,0.04)}
  .lr.sel{background:rgba(74,158,255,0.11)}
  .rt{flex:1;padding:8px 3px;border:none;cursor:pointer;font-size:10px;letter-spacing:1.5px;font-weight:700;text-transform:uppercase;transition:all 0.1s;border-bottom:2px solid transparent;background:transparent}
  .rt:hover{color:#e2e2e2}
  .rt.on{border-bottom:2px solid #4a9eff;color:#4a9eff}
  .sb{padding:7px 10px;font-size:12px;cursor:pointer;border-radius:4px;background:transparent;color:rgba(226,226,226,0.38);border:1px solid transparent;text-align:left;width:100%;transition:all 0.1s}
  .sb:hover{background:rgba(255,255,255,0.06);color:#e2e2e2}
  .sb.on{background:rgba(74,158,255,0.14);color:#4a9eff;border:1px solid rgba(74,158,255,0.35)}
  .cbtn{padding:5px 10px;font-size:11px;cursor:pointer;border-radius:4px;background:transparent;color:rgba(226,226,226,0.45);border:1px solid rgba(255,255,255,0.08);transition:all 0.1s}
  .cbtn:hover{background:rgba(255,255,255,0.07);color:#e2e2e2;border-color:rgba(255,255,255,0.15)}
`;

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Editor() {
  // Image state
  const [img,       setImg]       = useState<string|null>(null);
  const [imgName,   setImgName]   = useState("afbeelding");
  const [imgNat,    setImgNat]    = useState({w:0,h:0});
  const [loaded,    setLoaded]    = useState(false);
  const [dragOver,  setDragOver]  = useState(false);

  // Tool & UI state
  const [tool,      setTool]      = useState<Tool>("move");
  const [ptab,      setPtab]      = useState<PanelTab>("adjust");
  const [openMenu,  setOpenMenu]  = useState<string|null>(null);
  const [tooltip,   setTooltip]   = useState<string|null>(null);
  const [exporting, setExporting] = useState(false);
  const [user,      setUser]      = useState<any>(null);
  const [dlCount,   setDlCount]   = useState(0);
  const [showBlock, setShowBlock] = useState(false);
  const [showLimit, setShowLimit] = useState(false);
  const remaining = Math.max(0, FREE - dlCount);

  // Zoom & pan
  const [zoom,      setZoom]      = useState(100);
  const [panX,      setPanX]      = useState(0);
  const [panY,      setPanY]      = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const panStart    = useRef({mx:0,my:0,px:0,py:0});

  // Canvas state
  const [showGrid,  setShowGrid]  = useState(false);
  const [showRules, setShowRules] = useState(true);
  const [cursorPos, setCursorPos] = useState({x:0,y:0});

  // Layers
  const [layers,  setLayers]  = useState<Layer[]>([]);
  const [selId,   setSelId]   = useState<string|null>(null);
  const [selSt,   setSelSt]   = useState<string|null>(null);
  const [hist,    setHist]    = useState<HistEntry[]>([]);
  const [histIdx, setHistIdx] = useState(-1);

  // Accordion open state
  const [acc, setAcc] = useState<Record<string,boolean>>({
    basic:true,tone:false,detail:false,color:false,levels:false,
    curves:false,cb:false,pf:false,fx:true,border:false
  });

  // ── Adjustments ────────────────────────────────────────────────────────────
  const [bright,   setBright]  = useState(100);
  const [contr,    setContr]   = useState(100);
  const [sat,      setSat]     = useState(100);
  const [opac,     setOpac]    = useState(100);
  const [hue,      setHue]     = useState(0);
  const [warmth,   setWarmth]  = useState(0);
  const [vib,      setVib]     = useState(0);
  const [expo,     setExpo]    = useState(0);
  const [highs,    setHighs]   = useState(0);
  const [shads,    setShads]   = useState(0);
  const [sharp,    setSharp]   = useState(0);
  const [clarity,  setClarity] = useState(0);
  const [texture,  setTexture] = useState(0);
  const [dehaze,   setDehaze]  = useState(0);
  // Levels
  const [lI0,setLI0]=useState(0);const [lI1,setLI1]=useState(128);const [lI2,setLI2]=useState(255);
  const [lO0,setLO0]=useState(0);const [lO1,setLO1]=useState(255);
  // Curves
  const [cS,setCS]=useState(0);const [cM,setCM]=useState(0);const [cH,setCH]=useState(0);
  // Color balance
  const [cbSR,setCbSR]=useState(0);const [cbSG,setCbSG]=useState(0);const [cbSB,setCbSB]=useState(0);
  const [cbMR,setCbMR]=useState(0);const [cbMG,setCbMG]=useState(0);const [cbMB,setCbMB]=useState(0);
  // Photo filter
  const [pfColor,setPfColor]=useState("#e08020");const [pfDen,setPfDen]=useState(0);
  // Effects
  const [blur,    setBlur]    = useState(0);
  const [vig,     setVig]     = useState(0);
  const [noise,   setNoise]   = useState(0);
  const [glowStr, setGlowStr] = useState(0);
  const [glowR,   setGlowR]   = useState(255);
  const [glowG,   setGlowG]   = useState(200);
  const [glowB,   setGlowB]   = useState(100);
  // Border
  const [border,  setBorder]  = useState("none");
  // Filter preset
  const [preset,  setPreset]  = useState(0);

  // ── Tool options ───────────────────────────────────────────────────────────
  const [bSize,   setBSize]   = useState(16);
  const [bColor,  setBColor]  = useState("#4a9eff");
  const [bOpac,   setBOpac]   = useState(100);
  const [bHard,   setBHard]   = useState(80);
  const [fillC,   setFillC]   = useState("#4a9eff");
  const [gradC1,  setGradC1]  = useState("#4a9eff");
  const [gradC2,  setGradC2]  = useState("#C9A84C");
  const [gradDir, setGradDir] = useState<GradDir>("to right");
  // Text
  const [tText,   setTText]   = useState("");
  const [tFont,   setTFont]   = useState("Arial");
  const [tSize,   setTSize]   = useState(36);
  const [tColor,  setTColor]  = useState("#ffffff");
  const [tBold,   setTBold]   = useState(true);
  const [tItal,   setTItal]   = useState(false);
  const [tUnder,  setTUnder]  = useState(false);
  const [tShadow, setTShadow] = useState(false);
  // Shape
  const [sKind,   setSKind]   = useState<ShapeKind>("rect");
  const [sFill,   setSFill]   = useState("#4a9eff");
  const [sStroke, setSStroke] = useState("none");
  const [sStW,    setSSW]     = useState(2);
  const [sRadius, setSRadius] = useState(0);
  // Sticker
  const [stSize,  setStSize]  = useState(60);
  // FG/BG
  const [fgC, setFgC] = useState("#4a9eff");
  const [bgC, setBgC] = useState("#1a1a1a");

  // ── Refs ───────────────────────────────────────────────────────────────────
  const imgRef    = useRef<HTMLImageElement|null>(null);
  const imgElRef  = useRef<HTMLImageElement|null>(null);
  const cvRef     = useRef<HTMLDivElement>(null);
  const fileRef   = useRef<HTMLInputElement>(null);
  const stkRef    = useRef<HTMLInputElement>(null);
  const wrapRef   = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({data:{user}}) => setUser(user));
    setDlCount(parseInt(localStorage.getItem("brons_downloads")||"0"));
  }, []);

  // ── History ────────────────────────────────────────────────────────────────
  const pushHist = useCallback((label: string) => {
    setHist(p=>[...p.slice(0,histIdx+1),{label,ts:Date.now()}].slice(-50));
    setHistIdx(p=>Math.min(p+1,49));
  }, [histIdx]);

  // ── Filter string ──────────────────────────────────────────────────────────
  // Stable histogram values - no Math.random in render
  const histBars = useMemo(() => Array.from({length:24}, ()=>20+Math.random()*80), []);

  // Zoom via wheel - requires passive:false
  useEffect(() => {
    const el = cvRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom(p => Math.max(10, Math.min(500, p + (e.deltaY > 0 ? -8 : 8))));
    };
    el.addEventListener('wheel', handler, {passive: false});
    return () => el.removeEventListener('wheel', handler);
  }, []);

  const getFilter = () => {
    const base = FILTERS[preset].f;
    const parts = [
      base !== "none" ? base : "",
      `brightness(${bright}%)`,
      `contrast(${contr}%)`,
      `saturate(${sat}%)`,
      `opacity(${opac}%)`,
      `hue-rotate(${hue+warmth}deg)`,
      blur > 0 ? `blur(${blur*0.08}px)` : "",
      sharp > 0 ? `contrast(${100+sharp*0.5}%)` : "",
      clarity > 0 ? `contrast(${100+clarity*0.15}%)` : "",
      vib !== 0 ? `saturate(${100+vib}%)` : "",
      expo !== 0 ? `brightness(${100+expo*1.2}%)` : "",
    ].filter(Boolean).join(" ");
    return parts;
  };

  const getShadow = () => {
    const parts = ["0 20px 80px rgba(0,0,0,0.85)"];
    if (glowStr>0) parts.push(`0 0 ${glowStr*3}px rgba(${glowR},${glowG},${glowB},${glowStr*0.015})`);
    return parts.join(",");
  };

  // ── File open ──────────────────────────────────────────────────────────────
  const openFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setImgName(file.name.replace(/\.[^.]+$/,""));
    setLoaded(false);
    const reader = new FileReader();
    reader.onload = e => {
      const b = e.target?.result as string;
      setImg(b);
      const el = new Image(); el.src = b;
      el.onload = () => {
        imgRef.current = el;
        setImgNat({w:el.naturalWidth,h:el.naturalHeight});
        setLayers([{id:"bg",type:"image",name:"Achtergrond",visible:true,locked:false,opacity:100,blend:"normal"}]);
        setSelId("bg");
        setHist([{label:"Afbeelding geopend",ts:Date.now()}]);
        setHistIdx(0);
        // Reset zoom/pan
        setZoom(100); setPanX(0); setPanY(0);
        setTimeout(()=>setLoaded(true),60);
      };
    };
    reader.readAsDataURL(file);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0]; if (f) openFile(f);
  }, []);

  // ── Zoom ───────────────────────────────────────────────────────────────────
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -10 : 10;
      setZoom(p=>Math.min(Math.max(p+delta, 10), 500));
    }
  };

  const handleZoomClick = (e: React.MouseEvent) => {
    if (tool !== "zoom") return;
    const step = e.shiftKey ? -25 : 25;
    setZoom(p=>Math.min(Math.max(p+step, 10), 500));
  };

  // ── Pan (hand tool) ────────────────────────────────────────────────────────
  const startPan = (e: React.MouseEvent) => {
    if (tool !== "hand") return;
    e.preventDefault();
    setIsPanning(true);
    panStart.current = {mx:e.clientX, my:e.clientY, px:panX, py:panY};
    const mv = (me: MouseEvent) => {
      setPanX(panStart.current.px + (me.clientX - panStart.current.mx));
      setPanY(panStart.current.py + (me.clientY - panStart.current.my));
    };
    const up = () => { setIsPanning(false); window.removeEventListener("mousemove",mv); window.removeEventListener("mouseup",up); };
    window.addEventListener("mousemove",mv); window.addEventListener("mouseup",up);
  };

  // ── Layer actions ──────────────────────────────────────────────────────────
  const addText = () => {
    if (!tText.trim()) return;
    const id = uid();
    setLayers(p=>[{id,type:"text",name:`Tekst: "${tText.slice(0,14)}"`,visible:true,locked:false,opacity:100,blend:"normal",text:tText,x:80,y:80,fontSize:tSize,fontFamily:tFont,color:tColor,bold:tBold,italic:tItal,underline:tUnder,shadow:tShadow},...p.filter(l=>l.type!=="image"),...p.filter(l=>l.type==="image")]);
    setSelId(id); setTText(""); pushHist("Tekst toegevoegd");
  };

  const addShape = () => {
    const id = uid();
    setLayers(p=>[{id,type:"shape",name:`Vorm: ${sKind}`,visible:true,locked:false,opacity:100,blend:"normal",shapeKind:sKind,x:60,y:60,x2:240,y2:180,fill:sFill,stroke:sStroke,strokeW:sStW,radius:sRadius},...p.filter(l=>l.type!=="image"),...p.filter(l=>l.type==="image")]);
    setSelId(id); pushHist("Vorm toegevoegd");
  };

  const addGradient = () => {
    const id = uid();
    setLayers(p=>[{id,type:"gradient",name:"Verloop",visible:true,locked:false,opacity:80,blend:"normal",gradColor1:gradC1,gradColor2:gradC2,gradDir},...p.filter(l=>l.type!=="image"),...p.filter(l=>l.type==="image")]);
    setSelId(id); pushHist("Verloop toegevoegd");
  };

  const addSticker = (emoji: string) => {
    const id = uid();
    setLayers(p=>[{id,type:"sticker",name:`Sticker ${emoji}`,visible:true,locked:false,opacity:100,blend:"normal",emoji,x:80,y:80,w:stSize,h:stSize,rot:0,isImg:false},...p.filter(l=>l.type!=="image"),...p.filter(l=>l.type==="image")]);
    setSelId(id); setSelSt(id); pushHist("Sticker toegevoegd");
  };

  const addImgSticker = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = e => {
      const b = e.target?.result as string;
      const id = uid(); const el = new Image(); el.src = b;
      el.onload = () => {
        const a = el.naturalWidth/el.naturalHeight;
        setLayers(p=>[{id,type:"sticker",name:"Afbeelding sticker",visible:true,locked:false,opacity:100,blend:"normal",imgUrl:b,x:60,y:60,w:150,h:150/a,rot:0,isImg:true},...p.filter(l=>l.type!=="image"),...p.filter(l=>l.type==="image")]);
        setSelId(id); setSelSt(id); pushHist("Afbeelding sticker");
      };
    };
    reader.readAsDataURL(file);
  };

  const startDrag = (e: React.MouseEvent, id: string, lx: number, ly: number) => {
    if (tool !== "move") return;
    e.preventDefault(); e.stopPropagation();
    const sc = zoom/100;
    const startX = e.clientX;
    const startY = e.clientY;
    const startLx = lx;
    const startLy = ly;
    const mv = (me: MouseEvent) => {
      const dx = (me.clientX - startX) / sc;
      const dy = (me.clientY - startY) / sc;
      setLayers(p=>p.map(l=>l.id===id?{...l,x:startLx+dx,y:startLy+dy}:l));
    };
    const up = () => { window.removeEventListener("mousemove",mv); window.removeEventListener("mouseup",up); pushHist("Laag verplaatst"); };
    window.addEventListener("mousemove",mv); window.addEventListener("mouseup",up);
  };

  const startResize = (e: React.MouseEvent, layer: Layer) => {
    e.preventDefault(); e.stopPropagation();
    const sx=e.clientX,sy=e.clientY,sw=layer.w||60,sh=layer.h||60;
    const mv=(me:MouseEvent)=>setLayers(p=>p.map(l=>l.id===layer.id?{...l,w:Math.max(20,sw+(me.clientX-sx)),h:Math.max(20,sh+(me.clientY-sy))}:l));
    const up=()=>{window.removeEventListener("mousemove",mv);window.removeEventListener("mouseup",up);pushHist("Sticker resized");};
    window.addEventListener("mousemove",mv); window.addEventListener("mouseup",up);
  };

  const delLayer  = (id: string) => { setLayers(p=>p.filter(l=>l.id!==id)); if(selId===id)setSelId(null); pushHist("Laag verwijderd"); };
  const dupLayer  = (id: string) => {
    const l=layers.find(x=>x.id===id); if(!l) return;
    const nl={...l,id:uid(),name:l.name+" kopie",x:(l.x||0)+20,y:(l.y||0)+20};
    setLayers(p=>[nl,...p]); setSelId(nl.id); pushHist("Laag gedupliceerd");
  };
  const moveLayerUp   = (id: string) => { setLayers(p=>{const i=p.findIndex(l=>l.id===id);if(i<=0)return p;const a=[...p];[a[i-1],a[i]]=[a[i],a[i-1]];return a;}); };
  const moveLayerDown = (id: string) => { setLayers(p=>{const i=p.findIndex(l=>l.id===id);if(i>=p.length-1)return p;const a=[...p];[a[i],a[i+1]]=[a[i+1],a[i]];return a;}); };

  // ── Export ─────────────────────────────────────────────────────────────────
  const exportImg = async () => {
    if (!imgRef.current) return;
    if (!user && dlCount >= FREE) { setShowBlock(true); return; }
    setExporting(true);
    const cr = cvRef.current?.getBoundingClientRect();
    const ir = imgElRef.current?.getBoundingClientRect();
    const ox = ir&&cr ? ir.left-cr.left : 0;
    const oy = ir&&cr ? ir.top-cr.top  : 0;
    const dW = ir?.width||1, dH = ir?.height||1;
    const nW = imgRef.current.naturalWidth, nH = imgRef.current.naturalHeight;
    const sX = nW/dW, sY = nH/dH;
    const c = document.createElement("canvas");
    c.width=nW; c.height=nH;
    const ctx = c.getContext("2d")!;
    // Base image
    ctx.filter = getFilter();
    ctx.drawImage(imgRef.current,0,0);
    ctx.filter = "none";
    // Photo filter tint
    if (pfDen>0) { ctx.fillStyle=pfColor; ctx.globalAlpha=pfDen*0.006; ctx.fillRect(0,0,nW,nH); ctx.globalAlpha=1; }
    // Vignette
    if (vig>0) { const g=ctx.createRadialGradient(nW/2,nH/2,nW*0.25,nW/2,nH/2,nW*0.75); g.addColorStop(0,"rgba(0,0,0,0)"); g.addColorStop(1,`rgba(0,0,0,${vig*0.009})`); ctx.fillStyle=g; ctx.fillRect(0,0,nW,nH); }
    // Layers
    for (const l of [...layers].reverse()) {
      if (!l.visible) continue;
      ctx.globalAlpha = l.opacity/100;
      ctx.globalCompositeOperation = l.blend==="normal" ? "source-over" : l.blend as GlobalCompositeOperation;
      if (l.type==="gradient") {
        const grd = l.gradDir==="radial"
          ? ctx.createRadialGradient(nW/2,nH/2,0,nW/2,nH/2,Math.max(nW,nH)/2)
          : ctx.createLinearGradient(
              l.gradDir?.includes("left") ? nW : 0, l.gradDir?.includes("bottom") ? 0 : 0,
              l.gradDir?.includes("right") ? nW : 0, l.gradDir?.includes("bottom") ? nH : 0
            );
        grd.addColorStop(0, l.gradColor1||"#4a9eff");
        grd.addColorStop(1, l.gradColor2||"#C9A84C");
        ctx.fillStyle = grd; ctx.fillRect(0,0,nW,nH);
      }
      if (l.type==="text"&&l.text) {
        ctx.font=`${l.italic?"italic ":""}${l.bold?"bold ":""}${(l.fontSize||36)*sX}px ${l.fontFamily||"Arial"}`;
        ctx.fillStyle=l.color||"#fff";
        if (l.shadow) { ctx.shadowColor="rgba(0,0,0,0.8)"; ctx.shadowBlur=10; }
        ctx.fillText(l.text,(l.x||0)*sX,(l.y||0)*sY);
        ctx.shadowBlur=0;
        if (l.underline) {
          const tm = ctx.measureText(l.text);
          ctx.fillRect((l.x||0)*sX,(l.y||0)*sY+4,tm.width,2*(l.fontSize||36)*sX/30);
        }
      }
      if (l.type==="shape"&&l.shapeKind) {
        const x1=(l.x||0)*sX,y1=(l.y||0)*sY,x2=(l.x2||200)*sX,y2=(l.y2||150)*sY;
        const fw=l.fill&&l.fill!=="none", sw2=l.stroke&&l.stroke!=="none";
        if (fw) ctx.fillStyle=l.fill!;
        if (sw2) { ctx.strokeStyle=l.stroke!; ctx.lineWidth=(l.strokeW||2)*sX; }
        ctx.beginPath();
        if (l.shapeKind==="rect") {
          if (l.radius&&l.radius>0) ctx.roundRect(x1,y1,x2-x1,y2-y1,[l.radius*sX]);
          else { ctx.rect(x1,y1,x2-x1,y2-y1); }
        } else if (l.shapeKind==="ellipse") {
          ctx.ellipse((x1+x2)/2,(y1+y2)/2,Math.abs(x2-x1)/2,Math.abs(y2-y1)/2,0,0,Math.PI*2);
        } else if (l.shapeKind==="triangle") {
          ctx.moveTo((x1+x2)/2,y1); ctx.lineTo(x2,y2); ctx.lineTo(x1,y2); ctx.closePath();
        } else if (l.shapeKind==="star") {
          const cx=(x1+x2)/2,cy=(y1+y2)/2,ro=Math.min(x2-x1,y2-y1)/2,ri=ro*0.4;
          for (let i=0;i<10;i++) { const a=i*Math.PI/5-Math.PI/2,r=i%2===0?ro:ri; i===0?ctx.moveTo(cx+r*Math.cos(a),cy+r*Math.sin(a)):ctx.lineTo(cx+r*Math.cos(a),cy+r*Math.sin(a)); }
          ctx.closePath();
        } else if (l.shapeKind==="polygon") {
          const cx=(x1+x2)/2,cy=(y1+y2)/2,ro=Math.min(x2-x1,y2-y1)/2;
          for (let i=0;i<6;i++) { const a=i*Math.PI/3-Math.PI/2; i===0?ctx.moveTo(cx+ro*Math.cos(a),cy+ro*Math.sin(a)):ctx.lineTo(cx+ro*Math.cos(a),cy+ro*Math.sin(a)); }
          ctx.closePath();
        } else if (l.shapeKind==="line"||l.shapeKind==="arrow") {
          ctx.moveTo(x1,y1); ctx.lineTo(x2,y2);
        }
        if (fw&&l.shapeKind!=="line"&&l.shapeKind!=="arrow") ctx.fill();
        if (sw2) { ctx.strokeStyle=l.fill&&l.shapeKind==="line"?l.fill:l.stroke||"#fff"; ctx.stroke(); }
      }
      if (l.type==="sticker") {
        ctx.save();
        const cx=((l.x||0)+(l.w||60)/2)*sX, cy=((l.y||0)+(l.h||60)/2)*sY;
        ctx.translate(cx,cy); ctx.rotate(((l.rot||0)*Math.PI)/180);
        if (!l.isImg&&l.emoji) {
          ctx.font=`${(l.w||60)*sX}px serif`;
          ctx.fillText(l.emoji,-(l.w||60)*sX/2,(l.h||60)*sY/2);
        } else if (l.isImg&&l.imgUrl) {
          await new Promise<void>(res=>{const si=new Image();si.onload=()=>{ctx.drawImage(si,-(l.w||60)*sX/2,-(l.h||60)*sY/2,(l.w||60)*sX,(l.h||60)*sY);res();};si.onerror=()=>res();si.src=l.imgUrl!;});
        }
        ctx.restore();
      }
      ctx.globalAlpha=1; ctx.globalCompositeOperation="source-over";
    }
    const a=document.createElement("a"); a.href=c.toDataURL("image/png"); a.download=`${imgName}_bewerkt.png`; a.click();
    setTimeout(()=>setExporting(false),700);
    if (!user) { const nc=dlCount+1; localStorage.setItem("brons_downloads",nc.toString()); setDlCount(nc); if(nc>=FREE-1)setShowLimit(true); }
  };

  // ─── Reusable micro-components ─────────────────────────────────────────────
  const Lbl = ({t,mb=6}:{t:string;mb?:number}) => (
    <span style={{fontSize:10,letterSpacing:2,textTransform:"uppercase" as const,color:C.muted,display:"block",marginBottom:mb}}>{t}</span>
  );
  const Sep = ({my=14}:{my?:number}) => <div style={{height:1,background:C.border,margin:`${my}px 0`}}/>;

  const Slide = ({label,val,min,max,set,suf="%",col=C.accent}:{label:string;val:number;min:number;max:number;set:(v:number)=>void;suf?:string;col?:string}) => (
    <div style={{marginBottom:10}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
        <Lbl t={label} mb={0}/>
        <span style={{fontSize:10,color:C.muted,fontVariantNumeric:"tabular-nums"}}>{val}{suf}</span>
      </div>
      <div style={{position:"relative",height:4,borderRadius:2,background:C.panel3}}>
        <div style={{position:"absolute",inset:0,borderRadius:2,background:`linear-gradient(90deg,${col}44,${col})`,width:`${Math.max(0,Math.min(100,((val-min)/(max-min))*100))}%`}}/>
        <input type="range" min={min} max={max} value={val} onChange={e=>set(parseInt(e.target.value))} style={{position:"absolute",inset:"-8px 0",opacity:0,width:"100%",height:"20px"}}/>
      </div>
    </div>
  );

  const Acc = ({k,title,children}:{k:string;title:string;children:React.ReactNode}) => (
    <div style={{borderBottom:`1px solid ${C.border}`}}>
      <div className="ah" onClick={()=>setAcc(p=>({...p,[k]:!p[k]}))}>
        <span>{title}</span>
        <span style={{fontSize:8,opacity:0.4,transform:acc[k]?"rotate(180deg)":"none",transition:"transform 0.18s"}}>▼</span>
      </div>
      {acc[k]&&<div style={{padding:"12px 14px",animation:"slideIn 0.14s ease"}}>{children}</div>}
    </div>
  );

  const CRow = ({label,val,set}:{label:string;val:string;set:(v:string)=>void}) => (
    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
      <input type="color" value={val} onChange={e=>set(e.target.value)} style={{width:36,height:26,borderRadius:4,border:`1px solid ${C.border}`,cursor:"pointer",background:"none",flexShrink:0}}/>
      {label&&<div><Lbl t={label} mb={2}/><span style={{fontSize:10,color:C.muted,fontFamily:"monospace"}}>{val.toUpperCase()}</span></div>}
    </div>
  );

  const Swatches = ({val,set}:{val:string;set:(c:string)=>void}) => (
    <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}>
      {SWATCHES.map(c=>(
        <button key={c} onClick={()=>set(c)} style={{width:20,height:20,borderRadius:3,background:c,border:val===c?`2px solid ${C.text}`:`1.5px solid ${C.border}`,cursor:"pointer",transform:val===c?"scale(1.15)":"scale(1)",transition:"transform 0.1s",flexShrink:0}}/>
      ))}
    </div>
  );

  // ─── Adjustment panel ────────────────────────────────────────────────────────
  const AdjPanel = () => (
    <div>
      <Acc k="basic" title="Basis">
        <Slide label="Helderheid"    val={bright}  min={0}    max={200} set={setBright}/>
        <Slide label="Contrast"      val={contr}   min={0}    max={200} set={setContr}/>
        <Slide label="Verzadiging"   val={sat}     min={0}    max={200} set={setSat}/>
        <Slide label="Transparantie" val={opac}    min={10}   max={100} set={setOpac}/>
        <Slide label="Levendigheid"  val={vib}     min={-100} max={100} set={setVib}   col={C.accent}/>
        <button onClick={()=>{setBright(100);setContr(100);setSat(100);setOpac(100);setVib(0);}} style={{fontSize:10,color:C.muted,background:"none",border:"none",cursor:"pointer",letterSpacing:1,textTransform:"uppercase" as const,padding:0,marginTop:2}}>↺ Reset alles</button>
      </Acc>
      <Acc k="tone" title="Toon & Belichting">
        <Slide label="Belichting"   val={expo}  min={-100} max={100} set={setExpo}  suf="" col="#ffcc44"/>
        <Slide label="Hooglichten"  val={highs} min={-100} max={100} set={setHighs} suf="" col="#e0e0e0"/>
        <Slide label="Schaduwen"    val={shads} min={-100} max={100} set={setShads} suf="" col="#888"/>
      </Acc>
      <Acc k="detail" title="Detail & Scherpte">
        <Slide label="Scherpte"   val={sharp}   min={0} max={100} set={setSharp}   suf="" col="#e0a070"/>
        <Slide label="Helderheid" val={clarity} min={0} max={100} set={setClarity} suf="" col="#70c0e0"/>
        <Slide label="Textuur"    val={texture} min={0} max={100} set={setTexture} suf="" col="#70a0e0"/>
        <Slide label="Dehaze"     val={dehaze}  min={0} max={100} set={setDehaze}  suf="" col="#90c090"/>
      </Acc>
      <Acc k="color" title="Kleur & Tint">
        <Slide label="Tint (Hue)" val={hue}    min={-180} max={180} set={setHue}    suf="°" col={C.accent}/>
        <Slide label="Warmte"     val={warmth} min={-60}  max={60}  set={setWarmth} suf="°" col="#e07040"/>
      </Acc>
      <Acc k="levels" title="Niveaus">
        <div style={{height:40,background:C.panel3,borderRadius:4,marginBottom:10,display:"flex",alignItems:"flex-end",gap:1,padding:"0 4px",overflow:"hidden"}}>
          {histBars.map((h,i)=>(<div key={i} style={{flex:1,background:`rgba(74,158,255,${0.25+i/48})`,height:`${h}%`,borderRadius:"1px 1px 0 0"}}/>))}
        </div>
        <Lbl t="Invoer"/><Slide label="Schaduwen" val={lI0} min={0} max={253} set={setLI0} suf=""/>
        <Slide label="Midden" val={lI1} min={1} max={254} set={setLI1} suf="" col="#aaa"/>
        <Slide label="Hoog"   val={lI2} min={2} max={255} set={setLI2} suf="" col="#e0e0e0"/>
        <Lbl t="Uitvoer"/><Slide label="Min" val={lO0} min={0} max={254} set={setLO0} suf=""/>
        <Slide label="Max"    val={lO1} min={1} max={255} set={setLO1} suf="" col="#e0e0e0"/>
      </Acc>
      <Acc k="curves" title="Curven">
        <svg width="100%" height="72" viewBox="0 0 200 72" style={{borderRadius:4,border:`1px solid ${C.border}`,background:C.panel3,marginBottom:10,display:"block"}}>
          <line x1="0" y1="72" x2="200" y2="0" stroke={C.border} strokeWidth="1" strokeDasharray="3,3"/>
          <path d={`M 0 ${36+cS*0.32} Q 100 ${36-cM*0.32} 200 ${36-cH*0.32}`} fill="none" stroke={C.accent} strokeWidth="2"/>
          {[[0,36+cS*0.32],[100,36-cM*0.32],[200,36-cH*0.32]].map(([x,y],i)=>(
            <circle key={i} cx={x} cy={y} r="4" fill={C.accent} stroke={C.panel} strokeWidth="1.5"/>
          ))}
        </svg>
        <Slide label="Hooglichten" val={cH} min={-100} max={100} set={setCH} suf="" col="#e0e0e0"/>
        <Slide label="Middentonen" val={cM} min={-100} max={100} set={setCM} suf="" col="#aaa"/>
        <Slide label="Schaduwen"   val={cS} min={-100} max={100} set={setCS} suf="" col="#555"/>
      </Acc>
      <Acc k="cb" title="Kleurbalans">
        <Lbl t="Schaduwen"/>
        <Slide label="R" val={cbSR} min={-100} max={100} set={setCbSR} suf="" col="#e05555"/>
        <Slide label="G" val={cbSG} min={-100} max={100} set={setCbSG} suf="" col="#55e055"/>
        <Slide label="B" val={cbSB} min={-100} max={100} set={setCbSB} suf="" col="#5599ff"/>
        <Lbl t="Middentonen"/>
        <Slide label="R" val={cbMR} min={-100} max={100} set={setCbMR} suf="" col="#e05555"/>
        <Slide label="G" val={cbMG} min={-100} max={100} set={setCbMG} suf="" col="#55e055"/>
        <Slide label="B" val={cbMB} min={-100} max={100} set={setCbMB} suf="" col="#5599ff"/>
      </Acc>
      <Acc k="pf" title="Foto filter">
        <CRow label="Filterkleur" val={pfColor} set={setPfColor}/>
        <Slide label="Dichtheid" val={pfDen} min={0} max={100} set={setPfDen}/>
      </Acc>
      <Acc k="fx" title="Effecten">
        <Slide label="Blur"     val={blur}    min={0} max={40}  set={setBlur}    suf="" col="#7090e0"/>
        <Slide label="Vignette" val={vig}     min={0} max={100} set={setVig}     suf="" col="#a070e0"/>
        <Slide label="Grain"    val={noise}   min={0} max={100} set={setNoise}   suf="" col="#70e0a0"/>
        <Slide label="Gloed"    val={glowStr} min={0} max={80}  set={setGlowStr} suf="" col={`rgb(${glowR},${glowG},${glowB})`}/>
        {glowStr>0&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginTop:4}}>
            {([["R",glowR,setGlowR,"#e05555"],["G",glowG,setGlowG,"#55e055"],["B",glowB,setGlowB,"#5599ff"]] as [string,number,(v:number)=>void,string][]).map(([l,v,s,c])=>(
              <div key={l}><span style={{fontSize:9,color:c,display:"block",textAlign:"center" as const,marginBottom:3}}>{l}</span><input type="range" min={0} max={255} value={v} onChange={e=>s(parseInt(e.target.value))} style={{accentColor:c,width:"100%"}}/></div>
            ))}
          </div>
        )}
      </Acc>
      <Acc k="border" title="Kader">
        {BORDERS.map(b=>(
          <button key={b.n} onClick={()=>setBorder(b.v)} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 10px",borderRadius:4,cursor:"pointer",background:border===b.v?C.aDim:"transparent",border:border===b.v?`1px solid ${C.aBorder}`:`1px solid transparent`,color:border===b.v?C.accent:C.muted,fontSize:12,width:"100%",textAlign:"left" as const,marginBottom:2,transition:"all 0.1s"}}
            onMouseEnter={e=>{if(border!==b.v){e.currentTarget.style.background=C.panel3;e.currentTarget.style.color=C.text;}}}
            onMouseLeave={e=>{if(border!==b.v){e.currentTarget.style.background="transparent";e.currentTarget.style.color=C.muted;}}}>
            <div style={{width:16,height:16,borderRadius:2,flexShrink:0,border:b.v==="none"?`1px dashed ${C.border}`:`3px solid ${b.c}`}}/>{b.n}
          </button>
        ))}
      </Acc>
    </div>
  );

  // ─── Filters panel ────────────────────────────────────────────────────────
  const FiltersPanel = () => (
    <div style={{padding:12}}>
      <button onClick={()=>{setBright(106);setContr(112);setSat(118);setVib(15);}} style={{width:"100%",padding:"9px",background:C.aDim,border:`1px solid ${C.aBorder}`,color:C.accent,borderRadius:5,fontSize:11,cursor:"pointer",marginBottom:12,letterSpacing:1}}>✨ Auto verbeteren</button>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
        {FILTERS.map((f,i)=>(
          <button key={i} onClick={()=>setPreset(i)} style={{border:preset===i?`1.5px solid ${C.accent}`:`1px solid ${C.border}`,borderRadius:5,background:preset===i?C.aDim:C.panel2,padding:5,cursor:"pointer",transition:"all 0.12s",overflow:"hidden"}}>
            <div style={{height:52,borderRadius:4,overflow:"hidden",position:"relative"}}>
              <img src={img!} alt={f.n} style={{width:"100%",height:"100%",objectFit:"cover",filter:f.f==="none"?"none":f.f}}/>
              {preset===i&&<div style={{position:"absolute",top:4,right:4,width:14,height:14,borderRadius:"50%",background:C.accent,display:"flex",alignItems:"center",justifyContent:"center"}}><svg width="8" height="8" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#111" strokeWidth="2" strokeLinecap="round"/></svg></div>}
            </div>
            <p style={{fontSize:9,color:preset===i?C.accent:C.muted,margin:"4px 0 1px",textAlign:"center" as const,letterSpacing:1,textTransform:"uppercase" as const}}>{f.n}</p>
          </button>
        ))}
      </div>
    </div>
  );

  // ─── Layers panel ─────────────────────────────────────────────────────────
  const LayersPanel = () => {
    const sl = layers.find(l=>l.id===selId);
    return (
      <div>
        <div style={{padding:"8px 10px",borderBottom:`1px solid ${C.border}`,display:"flex",gap:4}}>
          {[{i:"T",t:"Tekst",a:()=>setTool("text")},{i:"◯",t:"Vorm",a:()=>setTool("shape")},{i:"▦",t:"Verloop",a:()=>setTool("gradient")},{i:"☺",t:"Sticker",a:()=>setTool("sticker")}].map(b=>(
            <button key={b.i} onClick={b.a} title={b.t} style={{flex:1,padding:"5px",background:C.panel2,border:`1px solid ${C.border}`,borderRadius:4,color:C.muted,fontSize:14,cursor:"pointer"}}
              onMouseEnter={e=>{e.currentTarget.style.background=C.panel3;e.currentTarget.style.color=C.text;}}
              onMouseLeave={e=>{e.currentTarget.style.background=C.panel2;e.currentTarget.style.color=C.muted;}}>{b.i}</button>
          ))}
        </div>
        <div>
          {layers.map((l,i)=>(
            <div key={l.id} className={`lr${selId===l.id?" sel":""}`} onClick={()=>setSelId(l.id)} style={{opacity:l.visible?1:0.35}}>
              {/* thumb */}
              <div style={{width:26,height:26,borderRadius:3,background:C.panel3,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,border:`1px solid ${C.border}`}}>
                {l.type==="image"&&<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>}
                {l.type==="text"&&<span style={{fontSize:12,color:C.accent,fontWeight:"bold"}}>T</span>}
                {l.type==="shape"&&<span style={{fontSize:13,color:C.muted}}>{l.shapeKind==="rect"?"▭":l.shapeKind==="ellipse"?"○":l.shapeKind==="triangle"?"△":l.shapeKind==="star"?"★":"▭"}</span>}
                {l.type==="gradient"&&<span style={{fontSize:11}}>▦</span>}
                {l.type==="sticker"&&<span style={{fontSize:13}}>{l.emoji||"🖼"}</span>}
              </div>
              <div style={{flex:1,overflow:"hidden"}}>
                <div style={{fontSize:11,color:selId===l.id?C.accent:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l.name}</div>
                <div style={{fontSize:9,color:C.muted,letterSpacing:1,textTransform:"uppercase" as const}}>{l.blend} · {l.opacity}%</div>
              </div>
              <div style={{display:"flex",gap:2,flexShrink:0}}>
                <button onClick={e=>{e.stopPropagation();setLayers(p=>p.map(x=>x.id===l.id?{...x,visible:!x.visible}:x));}} style={{background:"none",border:"none",cursor:"pointer",color:l.visible?C.muted:"rgba(255,255,255,0.12)",fontSize:12,padding:"0 2px"}}>👁</button>
                <button onClick={e=>{e.stopPropagation();moveLayerUp(l.id);}} style={{background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,0.14)",fontSize:11,padding:"0 2px"}}>↑</button>
                <button onClick={e=>{e.stopPropagation();moveLayerDown(l.id);}} style={{background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,0.14)",fontSize:11,padding:"0 2px"}}>↓</button>
                {l.type!=="image"&&<button onClick={e=>{e.stopPropagation();delLayer(l.id);}} style={{background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,0.14)",fontSize:11,padding:"0 2px"}}>✕</button>}
              </div>
            </div>
          ))}
        </div>
        {sl&&sl.type!=="image"&&(
          <div style={{borderTop:`1px solid ${C.border}`,padding:"10px 12px"}}>
            <Slide label="Dekking" val={sl.opacity} min={0} max={100} set={v=>setLayers(p=>p.map(l=>l.id===sl.id?{...l,opacity:v}:l))}/>
            <Lbl t="Overvloeimodus" mb={6}/>
            <select value={sl.blend} onChange={e=>setLayers(p=>p.map(l=>l.id===sl.id?{...l,blend:e.target.value as Blend}:l))} style={{width:"100%",background:C.panel3,color:C.text,border:`1px solid ${C.border}`,borderRadius:4,padding:"6px 8px",fontSize:11,outline:"none",marginBottom:8}}>
              {BLENDS.map(m=><option key={m} value={m}>{m.charAt(0).toUpperCase()+m.slice(1)}</option>)}
            </select>
            <div style={{display:"flex",gap:5}}>
              <button onClick={()=>dupLayer(sl.id)} className="cbtn" style={{flex:1}}>Dupliceer</button>
              <button onClick={()=>delLayer(sl.id)} style={{flex:1,padding:"5px 10px",fontSize:11,cursor:"pointer",borderRadius:4,background:"rgba(224,82,82,0.08)",border:"1px solid rgba(224,82,82,0.2)",color:C.red}}>Verwijder</button>
            </div>
          </div>
        )}
        <div style={{padding:"8px 12px",borderTop:`1px solid ${C.border}`}}>
          <span style={{fontSize:9,color:"rgba(255,255,255,0.18)",letterSpacing:1,textTransform:"uppercase" as const}}>{layers.length} lagen</span>
        </div>
      </div>
    );
  };

  // ─── History panel ────────────────────────────────────────────────────────
  const HistPanel = () => (
    <div style={{padding:12}}>
      <Lbl t={`${hist.length} acties`}/>
      {[...hist].reverse().map((h,i)=>(
        <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 8px",borderRadius:4,background:i===0?C.aDim:"transparent",border:`1px solid ${i===0?C.aBorder:"transparent"}`,marginBottom:3,cursor:"pointer",transition:"background 0.1s"}}
          onMouseEnter={e=>{if(i!==0)e.currentTarget.style.background=C.panel2;}}
          onMouseLeave={e=>{if(i!==0)e.currentTarget.style.background="transparent";}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:i===0?C.accent:C.muted,flexShrink:0}}/>
          <span style={{fontSize:11,color:i===0?C.accent:C.muted,flex:1}}>{h.label}</span>
          <span style={{fontSize:9,color:"rgba(255,255,255,0.14)"}}>{new Date(h.ts).toLocaleTimeString("nl",{hour:"2-digit",minute:"2-digit"})}</span>
        </div>
      ))}
    </div>
  );

  // ─── Tool properties panel ────────────────────────────────────────────────
  const PropsPanel = () => {
    const neutral = ["move","hand","select","zoom","eyedropper"];
    if (neutral.includes(tool)) return (
      <>
        <div style={{display:"flex",borderBottom:`1px solid ${C.border}`,flexShrink:0,background:C.panel2}}>
          {([["adjust","Aanpassen"],["filters","Filters"],["layers","Lagen"],["history","Hist."]] as [PanelTab,string][]).map(([id,lbl])=>(
            <button key={id} className={`rt${ptab===id?" on":""}`} onClick={()=>setPtab(id)} style={{color:ptab===id?C.accent:C.muted}}>{lbl}</button>
          ))}
        </div>
        <div style={{flex:1,overflowY:"auto"}}>
          {ptab==="adjust"  && AdjPanel()}
          {ptab==="filters" && FiltersPanel()}
          {ptab==="layers"  && LayersPanel()}
          {ptab==="history" && HistPanel()}
        </div>
      </>
    );

    if (tool==="crop") return (
      <div style={{flex:1,overflowY:"auto",padding:"16px 14px"}}>
        <div style={{padding:"10px 12px",borderRadius:5,background:C.aDim,border:`1px solid ${C.aBorder}`,fontSize:11,color:C.accent,marginBottom:14,lineHeight:1.6}}>⊡ Kies een verhouding en pas de overlay aan.</div>
        <Lbl t="Verhouding" mb={8}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5,marginBottom:14}}>
          {[["Vrij","free"],["1:1","1:1"],["4:3","4:3"],["16:9","16:9"],["3:2","3:2"],["Portret","2:3"],["A4","0.71:1"],["Banner","3:1"]].map(([l,v])=>(
            <button key={v} className="sb" style={{textAlign:"center" as const}}>{l}</button>
          ))}
        </div>
      </div>
    );

    if (["brush","eraser","dodge","burn"].includes(tool)) {
      const info:{[k:string]:[string,string,string]} = {
        brush: ["✏","Teken op het canvas.",C.aDim],
        eraser:["◻","Verwijder lagen.",   "rgba(224,82,82,0.1)"],
        dodge: ["☀","Maakt lichter.",      "rgba(255,220,100,0.08)"],
        burn:  ["☽","Maakt donkerder.",    "rgba(150,100,50,0.12)"],
      };
      const [icon,desc,bgc]=info[tool];
      return (
        <div style={{flex:1,overflowY:"auto",padding:"16px 14px"}}>
          <div style={{padding:"10px 12px",borderRadius:5,background:bgc,border:`1px solid ${C.borderHi}`,fontSize:11,color:C.text,marginBottom:14,lineHeight:1.6}}>{icon} {desc}</div>
          <CRow label="Penseelkleur" val={bColor} set={setBColor}/>
          <Swatches val={bColor} set={setBColor}/>
          <Sep/>
          <Slide label="Grootte"  val={bSize} min={1}  max={200} set={setBSize} suf="px"/>
          <Slide label="Hardheid" val={bHard} min={0}  max={100} set={setBHard} suf="%"  col="#888"/>
          <Slide label="Dekking"  val={bOpac} min={1}  max={100} set={setBOpac} suf="%"  col="#aaa"/>
          <Sep/>
          <Lbl t="Penseeltype" mb={8}/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5}}>
            {["Zacht","Hard","Spons","Inkt","Spray","Kalk"].map((b,i)=>(
              <button key={b} className={`sb${i===0?" on":""}`}>{b}</button>
            ))}
          </div>
          <Sep/>
          <div style={{borderRadius:5,background:"#000",border:`1px solid ${C.border}`,height:56,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{width:Math.max(8,bSize*0.55),height:Math.max(8,bSize*0.55),borderRadius:"50%",background:bColor,opacity:bOpac/100,boxShadow:bHard>50?`0 0 0 1px ${bColor}44`:`0 0 ${(100-bHard)*0.12}px ${bColor}88`,transition:"all 0.15s"}}/>
          </div>
        </div>
      );
    }

    if (tool==="fill") return (
      <div style={{flex:1,overflowY:"auto",padding:"16px 14px"}}>
        <div style={{padding:"10px 12px",borderRadius:5,background:C.aDim,border:`1px solid ${C.aBorder}`,fontSize:11,color:C.accent,marginBottom:14,lineHeight:1.6}}>▣ Vult een laag met de gekozen kleur.</div>
        <CRow label="Vulkleur" val={fillC} set={setFillC}/>
        <Swatches val={fillC} set={setFillC}/>
        <Slide label="Tolerantie" val={50} min={0} max={100} set={()=>{}} suf="" col={C.accent}/>
      </div>
    );

    if (tool==="gradient") return (
      <div style={{flex:1,overflowY:"auto",padding:"16px 14px"}}>
        <div style={{padding:"10px 12px",borderRadius:5,background:C.aDim,border:`1px solid ${C.aBorder}`,fontSize:11,color:C.accent,marginBottom:14,lineHeight:1.6}}>▦ Voegt een verloop toe als laag.</div>
        <Lbl t="Startkleur" mb={6}/>
        <CRow label="" val={gradC1} set={setGradC1}/>
        <Swatches val={gradC1} set={setGradC1}/>
        <Lbl t="Eindkleur" mb={6}/>
        <CRow label="" val={gradC2} set={setGradC2}/>
        <Swatches val={gradC2} set={setGradC2}/>
        {/* Preview */}
        <div style={{height:36,borderRadius:4,marginBottom:12,background:gradDir==="radial"?`radial-gradient(circle, ${gradC1}, ${gradC2})`:`linear-gradient(${gradDir}, ${gradC1}, ${gradC2})`,border:`1px solid ${C.border}`}}/>
        <Lbl t="Richting" mb={8}/>
        <div style={{display:"flex",flexDirection:"column" as const,gap:4,marginBottom:12}}>
          {GRAD_DIRS.map(d=>(
            <button key={d.v} onClick={()=>setGradDir(d.v)} className={`sb${gradDir===d.v?" on":""}`}>{d.l}</button>
          ))}
        </div>
        <button onClick={addGradient} style={{width:"100%",padding:"10px",background:C.accent,color:"#111",border:"none",borderRadius:5,fontSize:11,fontWeight:700,letterSpacing:2,textTransform:"uppercase" as const,cursor:"pointer"}}>
          + Verloop toevoegen
        </button>
        {layers.filter(l=>l.type==="gradient").map(l=>(
          <div key={l.id} onClick={()=>setSelId(l.id)} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderRadius:4,cursor:"pointer",border:selId===l.id?`1px solid ${C.aBorder}`:`1px solid ${C.border}`,background:selId===l.id?C.aDim:"transparent",marginTop:6,transition:"all 0.1s"}}>
            <div style={{width:20,height:20,borderRadius:3,background:`linear-gradient(to right,${l.gradColor1},${l.gradColor2})`,flexShrink:0}}/>
            <span style={{fontSize:11,color:C.muted,flex:1}}>{l.name}</span>
            <button onClick={e=>{e.stopPropagation();delLayer(l.id);}} style={{background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,0.2)",fontSize:11}}>✕</button>
          </div>
        ))}
      </div>
    );

    if (tool==="text") return (
      <div style={{flex:1,overflowY:"auto",padding:"16px 14px"}}>
        <Lbl t="Tekst invoer" mb={6}/>
        <textarea value={tText} onChange={e=>setTText(e.target.value)} placeholder="Typ hier..." rows={3}
          style={{background:C.panel3,color:C.text,border:`1px solid ${C.border}`,borderRadius:5,padding:"9px 11px",fontSize:14,outline:"none",width:"100%",boxSizing:"border-box",resize:"vertical",fontFamily:tFont,fontWeight:tBold?"bold":"normal",fontStyle:tItal?"italic":"normal",lineHeight:1.5,marginBottom:10,transition:"border-color 0.15s"}}
          onFocus={e=>e.currentTarget.style.borderColor=C.aBorder} onBlur={e=>e.currentTarget.style.borderColor=C.border}
          onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&(e.preventDefault(),addText())}/>
        <div style={{display:"flex",gap:5,marginBottom:10}}>
          {([["B",tBold,setTBold],["/",tItal,setTItal],["U",tUnder,setTUnder],["S",tShadow,setTShadow]] as [string,boolean,(v:boolean)=>void][]).map(([l,v,s])=>(
            <button key={l} onClick={()=>s(!v)} style={{flex:1,padding:"6px",borderRadius:4,background:v?C.aDim:"transparent",border:v?`1px solid ${C.aBorder}`:`1px solid ${C.border}`,color:v?C.accent:C.muted,fontSize:l==="B"?14:12,cursor:"pointer",fontWeight:l==="B"?"bold":"normal",fontStyle:l==="/"?"italic":"normal",textDecoration:l==="U"?"underline":"none"}}>{l}</button>
          ))}
        </div>
        <Sep/>
        <Lbl t="Font" mb={6}/>
        <select value={tFont} onChange={e=>setTFont(e.target.value)} style={{width:"100%",background:C.panel3,color:C.text,border:`1px solid ${C.border}`,borderRadius:5,padding:"8px 10px",fontSize:12,outline:"none",cursor:"pointer",marginBottom:10}}>
          <optgroup label="Systeem fonts" style={{background:C.panel3}}>
            {FONTS.map(f=><option key={f} value={f}>{f}</option>)}
          </optgroup>
          <optgroup label="Google Fonts" style={{background:C.panel3}}>
            {EXTRA_FONTS.map(f=><option key={f.f} value={f.n}>{f.n}</option>)}
          </optgroup>
        </select>
        <Slide label="Grootte" val={tSize} min={8} max={200} set={setTSize} suf="px"/>
        <Sep/>
        <CRow label="Kleur" val={tColor} set={setTColor}/>
        <Swatches val={tColor} set={setTColor}/>
        {tText&&(
          <div style={{borderRadius:5,background:"#000",border:`1px solid ${C.border}`,padding:"12px",minHeight:48,display:"flex",alignItems:"center",marginBottom:10}}>
            <span style={{fontFamily:tFont,fontSize:Math.min(tSize,26),color:tColor,fontWeight:tBold?"bold":"normal",fontStyle:tItal?"italic":"normal",textDecoration:tUnder?"underline":"none",textShadow:tShadow?"0 2px 8px rgba(0,0,0,0.9)":"none"}}>{tText}</span>
          </div>
        )}
        <button onClick={addText} disabled={!tText.trim()} style={{width:"100%",padding:"10px",background:tText.trim()?C.accent:C.panel3,color:tText.trim()?"#111":C.muted,border:"none",borderRadius:5,fontSize:11,fontWeight:700,letterSpacing:2,textTransform:"uppercase" as const,cursor:tText.trim()?"pointer":"not-allowed",marginBottom:10}}>
          + Tekstlaag toevoegen
        </button>
        {layers.filter(l=>l.type==="text").length>0&&(<>
          <Sep/>
          <Lbl t="Tekst lagen" mb={6}/>
          {layers.filter(l=>l.type==="text").map(l=>(
            <div key={l.id} onClick={()=>setSelId(l.id)} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderRadius:4,cursor:"pointer",border:selId===l.id?`1px solid ${C.aBorder}`:`1px solid ${C.border}`,background:selId===l.id?C.aDim:"transparent",marginBottom:4,transition:"all 0.1s"}}>
              <span style={{fontFamily:l.fontFamily,fontSize:14,color:l.color||C.text,fontWeight:l.bold?"bold":"normal",minWidth:18,textAlign:"center" as const}}>{(l.text||"T").charAt(0)}</span>
              <span style={{fontSize:11,color:C.muted,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l.text}</span>
              <button onClick={e=>{e.stopPropagation();delLayer(l.id);}} style={{background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,0.2)",fontSize:11}}>✕</button>
            </div>
          ))}
        </>)}
      </div>
    );

    if (tool==="shape") return (
      <div style={{flex:1,overflowY:"auto",padding:"16px 14px"}}>
        <Lbl t="Vorm" mb={8}/>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,marginBottom:14}}>
          {([["rect","▭","Rechthoek"],["ellipse","○","Ellips"],["line","—","Lijn"],["arrow","→","Pijl"],["triangle","△","Driehoek"],["star","★","Ster"],["polygon","⬡","Veelhoek"]] as [ShapeKind,string,string][]).map(([s,icon,label])=>(
            <button key={s} onClick={()=>setSKind(s)} style={{padding:"10px 4px",borderRadius:5,background:sKind===s?C.aDim:"transparent",border:sKind===s?`1px solid ${C.aBorder}`:`1px solid ${C.border}`,color:sKind===s?C.accent:C.muted,cursor:"pointer",display:"flex",flexDirection:"column" as const,alignItems:"center",gap:4,transition:"all 0.1s"}}>
              <span style={{fontSize:18}}>{icon}</span>
              <span style={{fontSize:9,letterSpacing:0.5}}>{label}</span>
            </button>
          ))}
        </div>
        <Sep/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <Lbl t="Vulkleur" mb={0}/>
          <button onClick={()=>setSFill(sFill==="none"?fgC:"none")} style={{fontSize:9,color:sFill==="none"?C.accent:C.muted,background:"none",border:"none",cursor:"pointer",letterSpacing:1,textTransform:"uppercase" as const}}>
            {sFill==="none"?"Aan":"Geen"}
          </button>
        </div>
        {sFill!=="none"&&<CRow label="" val={sFill} set={setSFill}/>}
        <Swatches val={sFill} set={v=>{setSFill(v);}}/>
        <Sep/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <Lbl t="Lijnkleur" mb={0}/>
          <button onClick={()=>setSStroke(sStroke==="none"?"#ffffff":"none")} style={{fontSize:9,color:sStroke!=="none"?C.accent:C.muted,background:"none",border:"none",cursor:"pointer",letterSpacing:1,textTransform:"uppercase" as const}}>
            {sStroke==="none"?"Uit":"Aan"}
          </button>
        </div>
        {sStroke!=="none"&&<><CRow label="" val={sStroke} set={setSStroke}/><Slide label="Lijndikte" val={sStW} min={1} max={20} set={setSSW} suf="px" col="#888"/></>}
        {sKind==="rect"&&<Slide label="Hoekradius" val={sRadius} min={0} max={80} set={setSRadius} suf="px" col="#a070d0"/>}
        {/* SVG preview */}
        <div style={{borderRadius:5,background:"#000",border:`1px solid ${C.border}`,height:70,display:"flex",alignItems:"center",justifyContent:"center",margin:"8px 0 12px"}}>
          <svg width="90" height="54" viewBox="0 0 90 54">
            {sKind==="rect"&&<rect x="5" y="5" width="80" height="44" rx={sRadius} fill={sFill==="none"?"none":sFill} stroke={sStroke==="none"?"none":sStroke} strokeWidth={Math.min(sStW*0.5,4)}/>}
            {sKind==="ellipse"&&<ellipse cx="45" cy="27" rx="39" ry="22" fill={sFill==="none"?"none":sFill} stroke={sStroke==="none"?"none":sStroke} strokeWidth={Math.min(sStW*0.5,4)}/>}
            {sKind==="line"&&<line x1="5" y1="49" x2="85" y2="5" stroke={sFill==="none"?"#666":sFill} strokeWidth={Math.min(sStW*0.5,4)}/>}
            {sKind==="arrow"&&<><line x1="5" y1="27" x2="76" y2="27" stroke={sFill==="none"?"#666":sFill} strokeWidth={Math.min(sStW*0.5,4)}/><polygon points="76,20 90,27 76,34" fill={sFill==="none"?"#666":sFill}/></>}
            {sKind==="triangle"&&<polygon points="45,5 85,49 5,49" fill={sFill==="none"?"none":sFill} stroke={sStroke==="none"?"none":sStroke} strokeWidth={Math.min(sStW*0.5,4)}/>}
            {sKind==="star"&&<polygon points="45,4 52,28 80,28 58,45 66,72 45,55 24,72 32,45 10,28 38,28" fill={sFill==="none"?"none":sFill} stroke={sStroke==="none"?"none":sStroke} strokeWidth={Math.min(sStW*0.3,3)} transform="scale(0.62) translate(18,3)"/>}
            {sKind==="polygon"&&<polygon points="45,5 80,22 80,49 45,66 10,49 10,22" fill={sFill==="none"?"none":sFill} stroke={sStroke==="none"?"none":sStroke} strokeWidth={Math.min(sStW*0.5,4)} transform="scale(0.8) translate(11,5)"/>}
          </svg>
        </div>
        <button onClick={addShape} style={{width:"100%",padding:"10px",background:C.accent,color:"#111",border:"none",borderRadius:5,fontSize:11,fontWeight:700,letterSpacing:2,textTransform:"uppercase" as const,cursor:"pointer",marginBottom:10}}>
          + Vorm toevoegen
        </button>
        {layers.filter(l=>l.type==="shape").length>0&&(<>
          <Sep/>
          <Lbl t="Vorm lagen" mb={6}/>
          {layers.filter(l=>l.type==="shape").map(l=>(
            <div key={l.id} onClick={()=>setSelId(l.id)} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderRadius:4,cursor:"pointer",border:selId===l.id?`1px solid ${C.aBorder}`:`1px solid ${C.border}`,background:selId===l.id?C.aDim:"transparent",marginBottom:4,transition:"all 0.1s"}}>
              <span style={{fontSize:14}}>{l.shapeKind==="rect"?"▭":l.shapeKind==="ellipse"?"○":l.shapeKind==="triangle"?"△":l.shapeKind==="star"?"★":"—"}</span>
              <span style={{fontSize:11,color:C.muted,flex:1}}>{l.name}</span>
              <button onClick={e=>{e.stopPropagation();delLayer(l.id);}} style={{background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,0.2)",fontSize:11}}>✕</button>
            </div>
          ))}
        </>)}
      </div>
    );

    if (tool==="sticker") return (
      <div style={{flex:1,overflowY:"auto",padding:"16px 14px"}}>
        <button onClick={()=>stkRef.current?.click()} style={{width:"100%",padding:"9px",border:`1.5px dashed ${C.borderHi}`,background:"transparent",color:C.muted,fontSize:12,cursor:"pointer",borderRadius:5,marginBottom:12,display:"flex",alignItems:"center",justifyContent:"center",gap:8,transition:"all 0.15s"}}
          onMouseEnter={e=>{e.currentTarget.style.borderColor=C.accent;e.currentTarget.style.color=C.accent;}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor=C.borderHi;e.currentTarget.style.color=C.muted;}}>
          📁 Eigen afbeelding
        </button>
        <Slide label="Standaard grootte" val={stSize} min={20} max={150} set={setStSize} suf="px"/>
        <Sep/>
        <Lbl t="Emoji bibliotheek" mb={8}/>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,marginBottom:12}}>
          {STICKERS.map((em,i)=>(
            <button key={i} onClick={()=>addSticker(em)} style={{fontSize:20,padding:"5px",borderRadius:4,border:`1px solid transparent`,background:"transparent",cursor:"pointer",transition:"all 0.1s"}}
              onMouseEnter={ev=>{ev.currentTarget.style.background=C.panel3;ev.currentTarget.style.transform="scale(1.18)";}}
              onMouseLeave={ev=>{ev.currentTarget.style.background="transparent";ev.currentTarget.style.transform="scale(1)";}}>
              {em}
            </button>
          ))}
        </div>
        {selSt&&layers.find(l=>l.id===selSt)&&(()=>{
          const sl=layers.find(l=>l.id===selSt)!;
          return (<>
            <Sep/>
            <Lbl t="Geselecteerde sticker" mb={6}/>
            <div style={{padding:"10px",borderRadius:5,background:C.panel2,border:`1px solid ${C.aBorder}`}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                {!sl.isImg?<span style={{fontSize:26}}>{sl.emoji}</span>:<img src={sl.imgUrl} alt="" style={{width:32,height:32,objectFit:"cover",borderRadius:3}}/>}
                <span style={{fontSize:11,color:C.muted}}>{sl.name}</span>
              </div>
              {([["Rotatie",sl.rot||0,-180,180,"°",(v:number)=>setLayers(p=>p.map(l=>l.id===selSt?{...l,rot:v}:l))],
                ["Breedte",Math.round(sl.w||60),20,500,"px",(v:number)=>setLayers(p=>p.map(l=>l.id===selSt?{...l,w:v}:l))],
                ["Hoogte",Math.round(sl.h||60),20,500,"px",(v:number)=>setLayers(p=>p.map(l=>l.id===selSt?{...l,h:v}:l))],
              ] as [string,number,number,number,string,(v:number)=>void][]).map(([lbl,v,mn,mx,sf,fn])=>(
                <div key={lbl as string} style={{marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                    <span style={{fontSize:10,color:C.muted,letterSpacing:1,textTransform:"uppercase" as const}}>{lbl as string}</span>
                    <span style={{fontSize:10,color:C.muted}}>{v as number}{sf as string}</span>
                  </div>
                  <div style={{position:"relative",height:4,borderRadius:2,background:C.panel3}}>
                    <div style={{position:"absolute",inset:0,borderRadius:2,background:C.accent,width:`${Math.max(0,((v as number-(mn as number))/(mx as number-(mn as number)))*100)}%`}}/>
                    <input type="range" min={mn as number} max={mx as number} value={v as number} onChange={e=>(fn as (v:number)=>void)(parseInt(e.target.value))} style={{position:"absolute",inset:"-8px 0",opacity:0,width:"100%",height:"20px"}}/>
                  </div>
                </div>
              ))}
              <button onClick={()=>delLayer(selSt)} style={{width:"100%",padding:"6px",background:"rgba(224,82,82,0.1)",border:"1px solid rgba(224,82,82,0.25)",borderRadius:4,color:C.red,fontSize:11,cursor:"pointer",marginTop:4}}>✕ Verwijderen</button>
            </div>
          </>);
        })()}
      </div>
    );

    return <div style={{flex:1,padding:16}}><div style={{padding:"12px",borderRadius:5,background:C.panel2,fontSize:11,color:C.muted,textAlign:"center" as const}}>Selecteer een tool links.</div></div>;
  };

  // ─── Tool definitions ─────────────────────────────────────────────────────
  const TOOLS: {id:Tool;icon:string;key:string;label:string;group:number}[] = [
    {id:"move",       icon:"✥", key:"V",label:"Verplaatsen (V)",  group:0},
    {id:"select",     icon:"⬚", key:"M",label:"Selectie (M)",    group:0},
    {id:"crop",       icon:"⊡", key:"C",label:"Bijsnijden (C)",  group:1},
    {id:"eyedropper", icon:"◉", key:"I",label:"Pipet (I)",       group:1},
    {id:"fill",       icon:"▣", key:"G",label:"Emmertje (G)",    group:2},
    {id:"gradient",   icon:"▦", key:"G",label:"Verloop (G)",     group:2},
    {id:"brush",      icon:"✏", key:"B",label:"Penseel (B)",     group:2},
    {id:"eraser",     icon:"◻", key:"E",label:"Gum (E)",         group:2},
    {id:"dodge",      icon:"☀", key:"O",label:"Ontwijken (O)",   group:2},
    {id:"burn",       icon:"☽", key:"O",label:"Branden (O)",     group:2},
    {id:"text",       icon:"T",  key:"T",label:"Tekst (T)",       group:3},
    {id:"shape",      icon:"◯", key:"U",label:"Vormen (U)",      group:3},
    {id:"sticker",    icon:"☺", key:"S",label:"Stickers (S)",    group:3},
    {id:"zoom",       icon:"⊕", key:"Z",label:"Zoom (Z)",        group:4},
    {id:"hand",       icon:"✋",key:"H",label:"Hand (H)",        group:4},
  ];

  // ─── Menu bar data ─────────────────────────────────────────────────────────
  const MENUS: Record<string,{label:string;shortcut?:string;action:()=>void;sep?:boolean;sub?:boolean;dim?:boolean}[]> = {
    Bestand:[
      {label:"Openen…",              action:()=>fileRef.current?.click()},
      {label:"",action:()=>{},sep:true},
      {label:"Exporteren als PNG",   action:exportImg},
      {label:"Exporteren als JPEG",  action:exportImg},
      {label:"Exporteren als WebP",  action:exportImg},
      {label:"",action:()=>{},sep:true},
      {label:"Sluiten",              action:()=>setImg(null)},
    ],
    Bewerken:[
      {label:"Ongedaan maken",       shortcut:"Ctrl+Z",action:()=>{},dim:histIdx<=0},
      {label:"Opnieuw",              shortcut:"Ctrl+Y",action:()=>{},dim:histIdx>=hist.length-1},
      {label:"",action:()=>{},sep:true},
      {label:"Alles selecteren",     shortcut:"Ctrl+A",action:()=>{}},
      {label:"",action:()=>{},sep:true},
      {label:"Reset aanpassingen",   action:()=>{setBright(100);setContr(100);setSat(100);setOpac(100);setVib(0);setExpo(0);setHighs(0);setShads(0);setSharp(0);setClarity(0);setTexture(0);setDehaze(0);setHue(0);setWarmth(0);}},
      {label:"Reset effecten",       action:()=>{setBlur(0);setVig(0);setNoise(0);setGlowStr(0);setPfDen(0);}},
      {label:"Alle lagen wissen",    action:()=>setLayers(p=>p.filter(l=>l.type==="image"))},
    ],
    Afbeelding:[
      {label:"Auto verbeteren",      action:()=>{setBright(106);setContr(112);setSat(118);setVib(15);}},
      {label:"",action:()=>{},sep:true},
      {label:"Zwart-wit",            action:()=>setSat(0)},
      {label:"Sepia",                action:()=>setPreset(3)},
      {label:"Hoog contrast",        action:()=>{setContr(155);setSat(115);}},
      {label:"Dramatisch",           action:()=>setPreset(6)},
      {label:"Warm",                 action:()=>setPreset(1)},
      {label:"Koel",                 action:()=>setPreset(2)},
      {label:"Neon",                 action:()=>setPreset(9)},
      {label:"",action:()=>{},sep:true},
      {label:"Beeldinfo",            action:()=>alert(`${imgNat.w} × ${imgNat.h} px`)},
    ],
    Laag:[
      {label:"Nieuwe tekstlaag",     action:()=>setTool("text")},
      {label:"Nieuwe vormenlaag",    action:()=>setTool("shape")},
      {label:"Nieuw verloop",        action:()=>setTool("gradient")},
      {label:"Nieuwe sticker",       action:()=>setTool("sticker")},
      {label:"",action:()=>{},sep:true},
      {label:"Laag dupliceren",      action:()=>selId&&dupLayer(selId),dim:!selId},
      {label:"Laag omhoog",          action:()=>selId&&moveLayerUp(selId),dim:!selId},
      {label:"Laag omlaag",          action:()=>selId&&moveLayerDown(selId),dim:!selId},
      {label:"Laag verwijderen",     action:()=>selId&&delLayer(selId),dim:!selId||layers.find(l=>l.id===selId)?.type==="image"},
      {label:"",action:()=>{},sep:true},
      {label:"Alle lagen zichtbaar", action:()=>setLayers(p=>p.map(l=>({...l,visible:true})))},
    ],
    Filter:[
      {label:"Gaussian blur",        action:()=>{setBlur(20);}},
      {label:"Verscherpen",          action:()=>{setSharp(60);}},
      {label:"Vignette",             action:()=>{setVig(80);}},
      {label:"Gloed effect",         action:()=>{setGlowStr(40);}},
      {label:"Film grain",           action:()=>{setNoise(50);}},
      {label:"",action:()=>{},sep:true},
      {label:"Zwart-wit",            action:()=>setSat(0)},
      {label:"Sepia",                action:()=>setPreset(3)},
      {label:"Dramatisch",           action:()=>setPreset(6)},
      {label:"Neon",                 action:()=>setPreset(9)},
    ],
    Weergave:[
      {label:"Rasters",              shortcut:"Ctrl+'",action:()=>setShowGrid(p=>!p)},
      {label:"Linialen",             shortcut:"Ctrl+R",action:()=>setShowRules(p=>!p)},
      {label:"",action:()=>{},sep:true},
      {label:"25%",                  action:()=>{setZoom(25);setPanX(0);setPanY(0);}},
      {label:"50%",                  action:()=>{setZoom(50);setPanX(0);setPanY(0);}},
      {label:"75%",                  action:()=>{setZoom(75);setPanX(0);setPanY(0);}},
      {label:"100%",                 shortcut:"Ctrl+0",action:()=>{setZoom(100);setPanX(0);setPanY(0);}},
      {label:"150%",                 action:()=>{setZoom(150);setPanX(0);setPanY(0);}},
      {label:"200%",                 action:()=>{setZoom(200);setPanX(0);setPanY(0);}},
      {label:"",action:()=>{},sep:true},
      {label:"Inzoomen",             shortcut:"Ctrl++",action:()=>setZoom(p=>Math.min(p+25,500))},
      {label:"Uitzoomen",            shortcut:"Ctrl+-",action:()=>setZoom(p=>Math.max(p-25,10))},
      {label:"Canvas centreren",     action:()=>{setPanX(0);setPanY(0);}},
    ],
  };

  // ─── Tool options bar ─────────────────────────────────────────────────────
  const ToolBar = () => {
    const base: React.CSSProperties = {height:36,background:C.bg2,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10,padding:"0 14px",flexShrink:0,overflowX:"auto"};
    const lbl: React.CSSProperties  = {fontSize:10,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",whiteSpace:"nowrap"};
    const SR = ({v,mn,mx,s,w=70}:{v:number;mn:number;mx:number;s:(x:number)=>void;w?:number}) => (
      <div style={{width:w,position:"relative",height:4,borderRadius:2,background:C.panel3,flexShrink:0}}>
        <div style={{position:"absolute",inset:0,borderRadius:2,background:C.accent,width:`${((v-mn)/(mx-mn))*100}%`}}/>
        <input type="range" min={mn} max={mx} value={v} onChange={e=>s(parseInt(e.target.value))} style={{position:"absolute",inset:"-8px 0",opacity:0,width:"100%",height:"20px"}}/>
      </div>
    );
    if (["brush","eraser","dodge","burn"].includes(tool)) return (
      <div style={base}>
        <span style={lbl}>Grootte</span><SR v={bSize} mn={1} mx={200} s={setBSize} w={80}/><span style={{...lbl,marginLeft:4,minWidth:32}}>{bSize}px</span>
        <div style={{width:1,height:18,background:C.border,margin:"0 2px",flexShrink:0}}/>
        <span style={lbl}>Hardheid</span><SR v={bHard} mn={0} mx={100} s={setBHard}/><span style={{...lbl,marginLeft:4,minWidth:28}}>{bHard}%</span>
        <div style={{width:1,height:18,background:C.border,margin:"0 2px",flexShrink:0}}/>
        <span style={lbl}>Kleur</span><input type="color" value={bColor} onChange={e=>setBColor(e.target.value)} style={{width:26,height:22,borderRadius:3,border:`1px solid ${C.border}`,cursor:"pointer",flexShrink:0}}/>
        <div style={{width:1,height:18,background:C.border,margin:"0 2px",flexShrink:0}}/>
        <span style={lbl}>Dekking</span><SR v={bOpac} mn={1} mx={100} s={setBOpac}/><span style={{...lbl,marginLeft:4,minWidth:28}}>{bOpac}%</span>
        <div style={{width:1,height:18,background:C.border,margin:"0 2px",flexShrink:0}}/>
        <select style={{background:C.panel2,color:C.muted,border:`1px solid ${C.border}`,borderRadius:4,padding:"3px 6px",fontSize:11,cursor:"pointer",outline:"none",flexShrink:0}}>
          {["Zacht","Hard","Spons","Inkt","Spray"].map(b=><option key={b}>{b}</option>)}
        </select>
      </div>
    );
    if (tool==="text") return (
      <div style={base}>
        <select value={tFont} onChange={e=>setTFont(e.target.value)} style={{background:C.panel2,color:C.text,border:`1px solid ${C.border}`,borderRadius:4,padding:"3px 8px",fontSize:11,outline:"none",cursor:"pointer",flexShrink:0}}>
          {ALL_FONTS.map(f=><option key={f} value={f}>{f}</option>)}
        </select>
        <SR v={tSize} mn={8} mx={200} s={setTSize} w={60}/><span style={{...lbl,marginLeft:2,minWidth:32}}>{tSize}px</span>
        {([["B",tBold,setTBold,"bold","normal"],["I",tItal,setTItal,"normal","italic"],["U",tUnder,setTUnder,"normal","normal"]] as [string,boolean,(v:boolean)=>void,string,string][]).map(([l,v,s])=>(
          <button key={l} onClick={()=>s(!v)} style={{width:26,height:22,borderRadius:3,background:v?C.aDim:"transparent",border:v?`1px solid ${C.aBorder}`:`1px solid ${C.border}`,color:v?C.accent:C.muted,cursor:"pointer",fontSize:12,fontWeight:l==="B"?"bold":"normal",fontStyle:l==="I"?"italic":"normal",textDecoration:l==="U"?"underline":"none",flexShrink:0}}>{l}</button>
        ))}
        <input type="color" value={tColor} onChange={e=>setTColor(e.target.value)} style={{width:26,height:22,borderRadius:3,border:`1px solid ${C.border}`,cursor:"pointer",flexShrink:0}}/>
      </div>
    );
    if (tool==="shape") return (
      <div style={base}>
        {(["rect","ellipse","line","arrow","triangle","star","polygon"] as ShapeKind[]).map(s=>(
          <button key={s} onClick={()=>setSKind(s)} style={{padding:"3px 8px",borderRadius:4,background:sKind===s?C.aDim:"transparent",border:sKind===s?`1px solid ${C.aBorder}`:`1px solid ${C.border}`,color:sKind===s?C.accent:C.muted,fontSize:11,cursor:"pointer",letterSpacing:1,textTransform:"uppercase" as const,flexShrink:0}}>
            {s==="rect"?"▭":s==="ellipse"?"○":s==="line"?"—":s==="arrow"?"→":s==="triangle"?"△":s==="star"?"★":"⬡"}
          </button>
        ))}
        <div style={{width:1,height:18,background:C.border,margin:"0 2px",flexShrink:0}}/>
        <span style={lbl}>Vulling</span>
        <input type="color" value={sFill==="none"?"#4a9eff":sFill} onChange={e=>setSFill(e.target.value)} style={{width:26,height:22,borderRadius:3,border:`1px solid ${C.border}`,cursor:"pointer",flexShrink:0}}/>
        <span style={lbl}>Lijn</span>
        <input type="color" value={sStroke==="none"?"#ffffff":sStroke} onChange={e=>setSStroke(e.target.value)} style={{width:26,height:22,borderRadius:3,border:`1px solid ${C.border}`,cursor:"pointer",flexShrink:0}}/>
        <button onClick={addShape} style={{padding:"4px 14px",background:C.accent,color:"#111",border:"none",borderRadius:4,fontSize:11,cursor:"pointer",fontWeight:700,flexShrink:0,marginLeft:4}}>+ Toevoegen</button>
      </div>
    );
    if (tool==="gradient") return (
      <div style={base}>
        <span style={lbl}>Van</span>
        <input type="color" value={gradC1} onChange={e=>setGradC1(e.target.value)} style={{width:26,height:22,borderRadius:3,border:`1px solid ${C.border}`,cursor:"pointer",flexShrink:0}}/>
        <span style={lbl}>Naar</span>
        <input type="color" value={gradC2} onChange={e=>setGradC2(e.target.value)} style={{width:26,height:22,borderRadius:3,border:`1px solid ${C.border}`,cursor:"pointer",flexShrink:0}}/>
        <div style={{width:80,height:22,borderRadius:3,background:`linear-gradient(to right,${gradC1},${gradC2})`,border:`1px solid ${C.border}`,flexShrink:0}}/>
        {GRAD_DIRS.map(d=>(
          <button key={d.v} onClick={()=>setGradDir(d.v)} style={{padding:"3px 8px",borderRadius:4,background:gradDir===d.v?C.aDim:"transparent",border:gradDir===d.v?`1px solid ${C.aBorder}`:`1px solid ${C.border}`,color:gradDir===d.v?C.accent:C.muted,fontSize:10,cursor:"pointer",flexShrink:0}}>{d.l}</button>
        ))}
        <button onClick={addGradient} style={{padding:"4px 14px",background:C.accent,color:"#111",border:"none",borderRadius:4,fontSize:11,cursor:"pointer",fontWeight:700,flexShrink:0,marginLeft:4}}>+ Toevoegen</button>
      </div>
    );
    if (tool==="zoom") return (
      <div style={base}>
        <span style={lbl}>Zoom: {zoom}%</span>
        {[25,50,75,100,150,200,300].map(z=>(
          <button key={z} onClick={()=>{setZoom(z);setPanX(0);setPanY(0);}} style={{padding:"3px 8px",borderRadius:4,background:zoom===z?C.aDim:"transparent",border:zoom===z?`1px solid ${C.aBorder}`:`1px solid ${C.border}`,color:zoom===z?C.accent:C.muted,fontSize:11,cursor:"pointer",flexShrink:0}}>{z}%</button>
        ))}
        <button onClick={()=>setZoom(p=>Math.min(p+25,500))} style={{padding:"3px 10px",background:C.panel2,border:`1px solid ${C.border}`,color:C.text,borderRadius:4,fontSize:11,cursor:"pointer",flexShrink:0}}>+</button>
        <button onClick={()=>setZoom(p=>Math.max(p-25,10))}  style={{padding:"3px 10px",background:C.panel2,border:`1px solid ${C.border}`,color:C.text,borderRadius:4,fontSize:11,cursor:"pointer",flexShrink:0}}>−</button>
        <button onClick={()=>{setZoom(100);setPanX(0);setPanY(0);}} style={{padding:"3px 10px",background:C.panel2,border:`1px solid ${C.border}`,color:C.muted,borderRadius:4,fontSize:11,cursor:"pointer",flexShrink:0}}>Reset</button>
      </div>
    );
    if (tool==="crop") return (
      <div style={base}>
        {[["Vrij","free"],["1:1","1:1"],["4:3","4:3"],["16:9","16:9"],["3:2","3:2"],["Portret","2:3"]].map(([l,v])=>(
          <button key={v} style={{padding:"3px 10px",borderRadius:4,background:"transparent",border:`1px solid ${C.border}`,color:C.muted,fontSize:11,cursor:"pointer",flexShrink:0}}>{l}</button>
        ))}
      </div>
    );
    return <div style={{...base}}/>;
  };

  // ─── Upload screen ────────────────────────────────────────────────────────
  if (!img) return (
    <>
      <style>{CSS}</style>
      <link rel="stylesheet" href={gFonts}/>
      <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>e.target.files?.[0]&&openFile(e.target.files[0])}/>
      {openMenu&&<div style={{position:"fixed",inset:0,zIndex:8999}} onClick={()=>setOpenMenu(null)}/>}
      <div style={{height:"100vh",display:"flex",flexDirection:"column",background:C.bg,color:C.text,fontFamily:"system-ui,-apple-system,sans-serif"}}>
        {/* Working menu bar */}
        <div style={{height:28,background:C.menuBg,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",padding:"0 8px",flexShrink:0,zIndex:100}}>
          <span style={{fontSize:13,fontWeight:700,color:C.text,letterSpacing:"-0.4px",marginRight:8}}>IMAGE-TOOLZ</span>
          {Object.entries(MENUS).map(([name,items])=>(
            <div key={name} style={{position:"relative"}}>
              <span className={`mi${openMenu===name?" open":""}`} onClick={e=>{e.stopPropagation();setOpenMenu(openMenu===name?null:name)}}>{name}</span>
              {openMenu===name&&(
                <div className="dd" style={{top:28,left:0}}>
                  {items.map((item,i)=>item.sep?<div key={i} className="dds"/>:(
                    <div key={i} className={`ddr${item.dim?" dim":""}`} onClick={()=>{item.action();setOpenMenu(null);}}>
                      <span>{item.label}</span>
                      {item.shortcut&&<span style={{opacity:0.35,fontSize:10}}>{item.shortcut}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",backgroundImage:"radial-gradient(rgba(255,255,255,0.045) 1px,transparent 1px)",backgroundSize:"28px 28px"}}>
          <div style={{animation:"fadeUp 0.45s ease both",display:"flex",flexDirection:"column",alignItems:"center",gap:28}}>
            <div style={{textAlign:"center"}}>
              <h1 style={{fontSize:38,fontWeight:600,color:C.text,margin:"0 0 8px",letterSpacing:"-1.2px"}}>Image Editor</h1>
              <p style={{fontSize:14,color:C.muted,margin:0}}>Professionele beeldbewerking · Lagen · Aanpassingen · Filters · Effecten</p>
            </div>
            <div onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)} onDrop={onDrop} onClick={()=>fileRef.current?.click()}
              style={{width:420,padding:"52px 44px",cursor:"pointer",borderRadius:10,border:dragOver?`1.5px dashed ${C.accent}`:`1.5px dashed ${C.borderHi}`,background:dragOver?C.aDim:"rgba(255,255,255,0.015)",display:"flex",flexDirection:"column",alignItems:"center",gap:16,transition:"all 0.2s"}}>
              <div style={{width:60,height:60,borderRadius:12,background:dragOver?C.aDim:C.panel2,display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.2s"}}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={dragOver?C.accent:C.muted} strokeWidth="1.8" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
              </div>
              <div style={{textAlign:"center"}}>
                <p style={{fontSize:15,color:C.text,margin:"0 0 6px",fontWeight:500}}>Sleep je afbeelding hierheen</p>
                <p style={{fontSize:12,color:C.muted,margin:0}}>PNG · JPG · WebP · GIF · BMP · TIFF</p>
              </div>
              <span style={{fontSize:11,color:dragOver?C.accent:C.muted,padding:"5px 18px",borderRadius:20,border:`1px solid ${dragOver?C.aBorder:C.border}`,transition:"all 0.2s"}}>of klik om te bladeren</span>
            </div>
            <div style={{display:"flex",gap:7,flexWrap:"wrap",justifyContent:"center",maxWidth:500}}>
              {["16 Filters","Aanpassingen","Niveaus","Curven","Kleurbalans","Foto filter","Lagen","Blend modes","Verloop","Vormen","Tekst","Stickers","Kaders","Vignette","Grain","Gloed","Geschiedenis"].map((t,i)=>(
                <span key={t} style={{fontSize:10,color:C.muted,padding:"3px 10px",borderRadius:20,border:`1px solid ${C.border}`,animation:`fadeIn 0.4s ease ${0.1+i*0.04}s both`}}>{t}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );

  // ─── Main editor ──────────────────────────────────────────────────────────
  return (
    <>
      <style>{CSS}</style>
      <link rel="stylesheet" href={gFonts}/>
      <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>e.target.files?.[0]&&openFile(e.target.files[0])}/>
      <input ref={stkRef}  type="file" accept="image/*" style={{display:"none"}} onChange={e=>e.target.files?.[0]&&addImgSticker(e.target.files[0])}/>
      {openMenu&&<div style={{position:"fixed",inset:0,zIndex:8999}} onClick={()=>setOpenMenu(null)}/>}

      {/* Block modal */}
      {showBlock&&(
        <div style={{position:"fixed",inset:0,zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.82)",animation:"fadeIn 0.2s"}} onClick={()=>setShowBlock(false)}>
          <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:10,padding:40,maxWidth:380,width:"90%",textAlign:"center",animation:"fadeUp 0.2s"}} onClick={e=>e.stopPropagation()}>
            <h2 style={{fontSize:22,fontWeight:600,color:C.text,margin:"0 0 12px"}}>Download limiet bereikt</h2>
            <p style={{fontSize:13,color:C.muted,lineHeight:1.7,margin:"0 0 28px"}}>Log in voor onbeperkt downloaden — gratis.</p>
            <button onClick={()=>window.location.href="/login"} style={{width:"100%",padding:"11px",background:C.accent,color:"#111",border:"none",borderRadius:7,fontSize:12,fontWeight:700,letterSpacing:2,textTransform:"uppercase" as const,cursor:"pointer",marginBottom:10}}>Inloggen</button>
            <button onClick={()=>setShowBlock(false)} style={{background:"none",border:"none",fontSize:12,color:C.muted,cursor:"pointer"}}>Sluiten</button>
          </div>
        </div>
      )}
      {showLimit&&!user&&remaining>0&&(
        <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:900,background:C.panel,borderTop:`1px solid ${C.border}`,padding:"10px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",animation:"fadeUp 0.3s"}}>
          <span style={{fontSize:12,color:C.muted}}>Nog <strong style={{color:C.text}}>{remaining} download{remaining!==1?"s":""}</strong> over.</span>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>window.location.href="/login"} style={{padding:"5px 14px",background:C.accent,color:"#111",border:"none",borderRadius:5,fontSize:11,fontWeight:700,cursor:"pointer"}}>Inloggen</button>
            <button onClick={()=>setShowLimit(false)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:16}}>✕</button>
          </div>
        </div>
      )}

      <div style={{height:"100vh",display:"flex",flexDirection:"column",background:C.bg,color:C.text,fontFamily:"system-ui,-apple-system,sans-serif",overflow:"hidden"}}>

        {/* ══ MENU BAR ══ */}
        <div style={{height:28,background:C.menuBg,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",padding:"0 8px",flexShrink:0,zIndex:100}}>
          <a href="/" style={{fontSize:13,fontWeight:700,color:C.text,textDecoration:"none",letterSpacing:"-0.4px",marginRight:8}}>IMAGE-TOOLZ</a>
          {Object.entries(MENUS).map(([name,items])=>(
            <div key={name} style={{position:"relative"}}>
              <span className={`mi${openMenu===name?" open":""}`} onClick={e=>{e.stopPropagation();setOpenMenu(openMenu===name?null:name)}}>{name}</span>
              {openMenu===name&&(
                <div className="dd" style={{top:28,left:0}}>
                  {items.map((item,i)=>item.sep?<div key={i} className="dds"/>:(
                    <div key={i} className={`ddr${item.dim?" dim":""}`} onClick={()=>{item.action();setOpenMenu(null);}}>
                      <span>{item.label}</span>
                      {item.shortcut&&<span style={{opacity:0.35,fontSize:10}}>{item.shortcut}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>
            {!user&&<span style={{fontSize:10,color:C.muted,letterSpacing:1}}>{remaining} downloads</span>}
            {/* Zoom display */}
            <span style={{fontSize:10,color:C.muted,minWidth:36,textAlign:"right" as const}}>{zoom}%</span>
            <button onClick={exportImg} style={{padding:"3px 14px",background:exporting?C.aDim:C.accent,color:"#111",border:"none",borderRadius:4,fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
              {exporting?"Bezig...":"Exporteren"}
            </button>
          </div>
        </div>

        {/* ══ TOOL OPTIONS BAR ══ */}
        <ToolBar/>

        {/* ══ MAIN ══ */}
        <div style={{flex:1,display:"flex",overflow:"hidden"}}>

          {/* ── LEFT TOOLBAR ── */}
          <div style={{width:52,background:C.bg2,borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column",alignItems:"center",padding:"5px 0",flexShrink:0,overflowY:"auto"}}>
            {TOOLS.map((t,i)=>(
              <div key={t.id} style={{width:"100%",position:"relative"}}>
                {i>0&&TOOLS[i-1].group!==t.group&&<div style={{height:1,background:C.border,margin:"4px 10px"}}/>}
                <button className={`tb${tool===t.id?" on":""}`} onClick={()=>setTool(t.id)} onMouseEnter={()=>setTooltip(t.id)} onMouseLeave={()=>setTooltip(null)}>
                  <span style={{fontSize:16,lineHeight:1}}>{t.icon}</span>
                  <span style={{fontSize:7,letterSpacing:0.5,opacity:0.42}}>{t.key}</span>
                </button>
                {tooltip===t.id&&<div style={{position:"absolute",left:58,top:"50%",transform:"translateY(-50%)",background:"#111",border:`1px solid ${C.border}`,borderRadius:4,padding:"4px 9px",fontSize:11,color:C.text,whiteSpace:"nowrap",zIndex:200,pointerEvents:"none",animation:"fadeIn 0.1s"}}>{t.label}</div>}
              </div>
            ))}
            <div style={{height:1,background:C.border,margin:"6px 10px",width:"calc(100% - 20px)"}}/>
            {/* FG/BG swatches */}
            <div style={{position:"relative",width:38,height:34,margin:"4px auto",cursor:"pointer"}}>
              <div style={{position:"absolute",bottom:0,right:0,width:22,height:22,borderRadius:3,background:bgC,border:`1.5px solid ${C.borderHi}`}} onClick={()=>setBgC(fgC)}/>
              <div style={{position:"absolute",top:0,left:0,width:24,height:24,borderRadius:3,background:fgC,border:`2px solid ${C.text}`}} onClick={()=>setFgC(bColor)}/>
            </div>
            <button onClick={()=>{setFgC(fgC);setBgC(bgC);const tmp=fgC;setFgC(bgC);setBgC(tmp);}} style={{fontSize:9,color:C.muted,background:"none",border:"none",cursor:"pointer",marginTop:2,letterSpacing:0.5}}>⇄</button>
          </div>

          {/* ── CANVAS + RULERS ── */}
          <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
            {showRules&&(
              <div style={{height:18,background:C.bg2,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"flex-end",padding:"0 2px",flexShrink:0,overflow:"hidden"}}>
                {Array.from({length:90}).map((_,i)=>(
                  <div key={i} style={{minWidth:14,display:"flex",flexDirection:"column",alignItems:"center"}}>
                    {i%5===0&&<span style={{fontSize:7,color:"rgba(255,255,255,0.18)",marginBottom:2,lineHeight:1}}>{Math.round(i*10*(100/zoom))}</span>}
                    <div style={{height:i%5===0?6:3,width:1,background:`rgba(255,255,255,${i%5===0?0.18:0.07})`}}/>
                  </div>
                ))}
              </div>
            )}
            <div style={{flex:1,display:"flex",overflow:"hidden"}}>
              {showRules&&(
                <div style={{width:18,background:C.bg2,borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column",alignItems:"flex-end",padding:"2px 0",flexShrink:0,overflowY:"hidden"}}>
                  {Array.from({length:55}).map((_,i)=>(
                    <div key={i} style={{minHeight:14,display:"flex",alignItems:"center",justifyContent:"flex-end"}}>
                      {i%5===0&&<span style={{fontSize:7,color:"rgba(255,255,255,0.18)",writingMode:"vertical-rl" as const,transform:"rotate(180deg)",marginRight:2,lineHeight:1}}>{Math.round(i*10*(100/zoom))}</span>}
                      <div style={{width:i%5===0?6:3,height:1,background:`rgba(255,255,255,${i%5===0?0.18:0.07})`}}/>
                    </div>
                  ))}
                </div>
              )}

              {/* ── CANVAS ── */}
              <div ref={cvRef}
                style={{flex:1,overflow:"hidden",position:"relative",background:C.bg,backgroundImage:showGrid?"linear-gradient(rgba(255,255,255,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.04) 1px,transparent 1px)":"radial-gradient(rgba(255,255,255,0.06) 1px,transparent 1px)",backgroundSize:showGrid?"24px 24px":"28px 28px",cursor:tool==="zoom"?"zoom-in":tool==="hand"?(isPanning?"grabbing":"grab"):["brush","eraser","dodge","burn"].includes(tool)?"crosshair":tool==="text"?"text":tool==="eyedropper"?"crosshair":"default"}}
                onMouseDown={startPan}
                onClick={handleZoomClick}
                onMouseMove={e=>{const r=cvRef.current?.getBoundingClientRect();if(r)setCursorPos({x:Math.round((e.clientX-r.left-panX)/zoom*100),y:Math.round((e.clientY-r.top-panY)/zoom*100)});}}>

                {/* Zoomed & panned image container */}
                <div ref={wrapRef} style={{position:"absolute",top:"50%",left:"50%",transform:`translate(calc(-50% + ${panX}px), calc(-50% + ${panY}px)) scale(${zoom/100})`,transformOrigin:"center center",animation:loaded?"fadeUp 0.35s cubic-bezier(0.22,1,0.36,1)":"none",opacity:loaded?1:0}}>
                  {/* Shadow wrapper */}
                  <div style={{position:"relative",display:"inline-block",border:border==="none"?"none":border,boxShadow:getShadow()}}>
                    <img ref={imgElRef} src={img} alt="edit" style={{maxWidth:"none",width:imgNat.w>0?`${imgNat.w}px`:undefined,filter:getFilter(),display:"block",userSelect:"none"}}/>

                    {/* Effect overlays */}
                    {vig>0&&<div style={{position:"absolute",inset:0,pointerEvents:"none",background:`radial-gradient(ellipse at center,transparent 40%,rgba(0,0,0,${vig*0.008}) 100%)`}}/>}
                    {pfDen>0&&<div style={{position:"absolute",inset:0,pointerEvents:"none",background:pfColor,opacity:pfDen*0.006}}/>}
                    {glowStr>0&&<div style={{position:"absolute",inset:0,pointerEvents:"none",boxShadow:`inset 0 0 ${glowStr*3}px rgba(${glowR},${glowG},${glowB},${glowStr*0.02})`}}/>}
                    {noise>0&&<div style={{position:"absolute",inset:0,pointerEvents:"none",opacity:noise*0.006,backgroundImage:`url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E")`,backgroundSize:"200px 200px"}}/>}

                    {/* Gradient layers */}
                    {layers.filter(l=>l.type==="gradient"&&l.visible).map(l=>(
                      <div key={l.id} onClick={e=>{e.stopPropagation();setSelId(l.id);}}
                        style={{position:"absolute",inset:0,cursor:"pointer",background:l.gradDir==="radial"?`radial-gradient(circle,${l.gradColor1},${l.gradColor2})`:`linear-gradient(${l.gradDir},${l.gradColor1},${l.gradColor2})`,opacity:l.opacity/100,mixBlendMode:l.blend as any,outline:selId===l.id?`2px solid ${C.accent}`:"none"}}/>
                    ))}

                    {/* Text layers */}
                    {layers.filter(l=>l.type==="text"&&l.visible).map(l=>(
                      <div key={l.id} onMouseDown={e=>startDrag(e,l.id,l.x||0,l.y||0)} onClick={e=>{e.stopPropagation();setSelId(l.id);}}
                        style={{position:"absolute",top:l.y,left:l.x,color:l.color,fontSize:l.fontSize,fontFamily:l.fontFamily,fontWeight:l.bold?"bold":"normal",fontStyle:l.italic?"italic":"normal",textDecoration:l.underline?"underline":"none",textShadow:l.shadow?"0 2px 10px rgba(0,0,0,0.9)":"none",cursor:tool==="move"?"move":"default",userSelect:"none",whiteSpace:"nowrap",opacity:l.opacity/100,mixBlendMode:l.blend as any,outline:selId===l.id?`1.5px solid ${C.accent}`:"none",outlineOffset:6}}>
                        {l.text}
                      </div>
                    ))}

                    {/* Shape layers */}
                    {layers.filter(l=>l.type==="shape"&&l.visible).map(l=>(
                      <div key={l.id} onClick={e=>{e.stopPropagation();setSelId(l.id);}} onMouseDown={e=>startDrag(e,l.id,l.x||0,l.y||0)}
                        style={{position:"absolute",top:l.y,left:l.x,width:(l.x2||120)-(l.x||0),height:(l.y2||100)-(l.y||0),cursor:tool==="move"?"move":"default",opacity:l.opacity/100,outline:selId===l.id?`1.5px dashed ${C.accent}`:"none",outlineOffset:4}}>
                        <svg width="100%" height="100%" style={{overflow:"visible"}}>
                          {l.shapeKind==="rect"&&<rect x="0" y="0" width="100%" height="100%" rx={l.radius||0} fill={l.fill==="none"?"none":l.fill||"transparent"} stroke={l.stroke==="none"?"none":l.stroke||"transparent"} strokeWidth={l.strokeW||2}/>}
                          {l.shapeKind==="ellipse"&&<ellipse cx="50%" cy="50%" rx="50%" ry="50%" fill={l.fill==="none"?"none":l.fill||"transparent"} stroke={l.stroke==="none"?"none":l.stroke||"transparent"} strokeWidth={l.strokeW||2}/>}
                          {(l.shapeKind==="line"||l.shapeKind==="arrow")&&<line x1="0" y1="0" x2="100%" y2="100%" stroke={l.fill||"#fff"} strokeWidth={l.strokeW||2}/>}
                          {l.shapeKind==="triangle"&&<polygon points="50%,0 100%,100% 0,100%" fill={l.fill==="none"?"none":l.fill||"transparent"} stroke={l.stroke==="none"?"none":l.stroke||"transparent"} strokeWidth={l.strokeW||2}/>}
                          {l.shapeKind==="star"&&<polygon points="50%,0 61%,35% 98%,35% 68%,57% 79%,91% 50%,70% 21%,91% 32%,57% 2%,35% 39%,35%" fill={l.fill==="none"?"none":l.fill||"transparent"} stroke={l.stroke==="none"?"none":l.stroke||"transparent"} strokeWidth={l.strokeW||2}/>}
                          {l.shapeKind==="polygon"&&<polygon points="50%,0 100%,25% 100%,75% 50%,100% 0,75% 0,25%" fill={l.fill==="none"?"none":l.fill||"transparent"} stroke={l.stroke==="none"?"none":l.stroke||"transparent"} strokeWidth={l.strokeW||2}/>}
                        </svg>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Stickers — positioned in canvas space (outside scaled wrapper) */}
                {layers.filter(l=>l.type==="sticker"&&l.visible).map(l=>{
                  // Convert image coordinates to screen coordinates
                  const r = cvRef.current?.getBoundingClientRect();
                  const wr = wrapRef.current?.getBoundingClientRect();
                  if (!r||!wr) return null;
                  const sc = zoom/100;
                  const sx = wr.left - r.left + (l.x||0)*sc;
                  const sy = wr.top  - r.top  + (l.y||0)*sc;
                  return (
                    <div key={l.id} onClick={e=>{e.stopPropagation();setSelId(l.id);setSelSt(l.id);}} onMouseDown={e=>startDrag(e,l.id,l.x||0,l.y||0)}
                      style={{position:"absolute",left:sx,top:sy,width:(l.w||stSize)*sc,height:(l.isImg?l.h:l.w||stSize)*sc,cursor:tool==="move"?"move":"default",userSelect:"none",transform:`rotate(${l.rot||0}deg)`,outline:selId===l.id?`1.5px solid ${C.accent}`:"none",borderRadius:3,opacity:l.opacity/100}}>
                      {!l.isImg
                        ?<span style={{fontSize:(l.w||stSize)*sc,lineHeight:1,display:"block"}}>{l.emoji}</span>
                        :<img src={l.imgUrl} alt="" style={{width:"100%",height:"100%",display:"block",objectFit:"fill"}} draggable={false}/>}
                      {selId===l.id&&<div onMouseDown={e=>startResize(e,l)} style={{position:"absolute",bottom:-5,right:-5,width:12,height:12,background:C.accent,borderRadius:"50%",cursor:"se-resize",border:"2px solid #111"}}/>}
                    </div>
                  );
                })}

                {/* Canvas info */}
                <div style={{position:"absolute",bottom:12,left:12,display:"flex",gap:6,pointerEvents:"none"}}>
                  {[`${zoom}%`, imgNat.w>0?`${imgNat.w}×${imgNat.h}px`:"", `${cursorPos.x}, ${cursorPos.y}px`, `${layers.length} lagen`].filter(Boolean).map(t=>(
                    <div key={t} style={{background:"rgba(0,0,0,0.65)",borderRadius:4,padding:"3px 8px",fontSize:10,color:C.muted,backdropFilter:"blur(6px)",border:`1px solid ${C.border}`}}>{t}</div>
                  ))}
                </div>

                {/* Zoom hint */}
                <div style={{position:"absolute",bottom:12,right:12,display:"flex",gap:4,pointerEvents:"none"}}>
                  <div style={{background:"rgba(0,0,0,0.55)",borderRadius:4,padding:"3px 8px",fontSize:9,color:"rgba(255,255,255,0.25)",backdropFilter:"blur(4px)",border:`1px solid ${C.border}`}}>Ctrl+scroll = zoom · Shift+scroll = pan</div>
                </div>
              </div>
            </div>
          </div>

          {/* ── RIGHT PANEL ── */}
          <div style={{width:268,background:C.panel,borderLeft:`1px solid ${C.border}`,display:"flex",flexDirection:"column",flexShrink:0,overflow:"hidden"}}>
            {/* Panel header */}
            <div style={{height:38,background:C.panel2,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",padding:"0 14px",flexShrink:0,gap:8}}>
              <span style={{fontSize:15}}>{TOOLS.find(t=>t.id===tool)?.icon||"⚙"}</span>
              <span style={{fontSize:11,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase" as const,color:C.text,flex:1}}>
                {TOOLS.find(t=>t.id===tool)?.label.split(" (")[0]||"Eigenschappen"}
              </span>
              {/* Layers quick button */}
              <button onClick={()=>{setPtab("layers");setTool("move");}} title="Lagen" style={{background:"none",border:"none",cursor:"pointer",color:C.muted,fontSize:14,padding:"0 2px",lineHeight:1}} onMouseEnter={e=>e.currentTarget.style.color=C.text} onMouseLeave={e=>e.currentTarget.style.color=C.muted}>▤</button>
            </div>

            {/* Panel body */}
            {PropsPanel()}

            {/* Status bar */}
            <div style={{height:22,borderTop:`1px solid ${C.border}`,padding:"0 12px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,background:C.panel2}}>
              <span style={{fontSize:9,color:"rgba(255,255,255,0.18)",letterSpacing:1,textTransform:"uppercase" as const}}>IMAGE-TOOLZ</span>
              <span style={{fontSize:9,color:"rgba(255,255,255,0.18)"}}>{imgNat.w>0?`${imgNat.w}×${imgNat.h}`:""}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}