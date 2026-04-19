"use client";
import { useState, useRef, useCallback, useEffect, useReducer } from "react";
import { supabase } from "../lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────
type ActiveTool = "move"|"marquee"|"lasso"|"crop"|"brush"|"eraser"|"text"|"shape"|"eyedropper"|"zoom"|"hand"|"gradient";
type RightTab   = "adjust"|"layers"|"history"|"filters";
type ShapeType  = "rect"|"ellipse"|"line"|"arrow";
type BlendMode  = "normal"|"multiply"|"screen"|"overlay"|"darken"|"lighten"|"color-dodge"|"color-burn"|"hard-light"|"soft-light"|"difference"|"exclusion";

interface Layer {
  id: string; type: "image"|"text"|"shape"|"sticker"|"draw"|"adjustment";
  name: string; visible: boolean; locked: boolean; opacity: number;
  blendMode: BlendMode; selected: boolean;
  // text layer
  text?: string; x?: number; y?: number; fontSize?: number; fontFamily?: string;
  color?: string; bold?: boolean; italic?: boolean;
  // sticker layer
  emoji?: string; imageUrl?: string; width?: number; height?: number; rotation?: number;
  isImageSticker?: boolean;
  // shape layer
  shapeType?: ShapeType; x2?: number; y2?: number; fillColor?: string; strokeColor?: string; strokeWidth?: number;
  // draw layer (base64 strokes)
  drawData?: string;
}

interface HistoryEntry { label: string; timestamp: number; }

const FREE_LIMIT = 3;

// ── Color palette ─────────────────────────────────────────────────────────────
const C = {
  bg:"#1a1a1a", surface:"#202020", panel:"#252525", panel2:"#2d2d2d",
  panel3:"#363636", border:"rgba(255,255,255,0.07)", borderHi:"rgba(255,255,255,0.13)",
  text:"#ececec", muted:"rgba(236,236,236,0.38)", accent:"#C9A84C",
  accentDim:"rgba(201,168,76,0.15)", accentBorder:"rgba(201,168,76,0.35)",
  blue:"#4a9eff", red:"#e05252", green:"#52c472",
  menubar:"#2f2f2f",
};

const FILTERS_LIST = [
  { name:"Origineel",  f:"none" },
  { name:"Warm",       f:"sepia(0.3) saturate(1.4) brightness(1.05)" },
  { name:"Koel",       f:"hue-rotate(30deg) saturate(0.9) brightness(1.05)" },
  { name:"Vintage",    f:"sepia(0.5) contrast(0.85) brightness(0.95) saturate(0.8)" },
  { name:"Zwart-wit",  f:"grayscale(1)" },
  { name:"Helder",     f:"brightness(1.3) contrast(1.1)" },
  { name:"Dramatisch", f:"contrast(1.4) saturate(1.3) brightness(0.9)" },
  { name:"Fade",       f:"opacity(0.85) brightness(1.1) saturate(0.7)" },
  { name:"Boost",      f:"saturate(1.8) contrast(1.1)" },
  { name:"Neon",       f:"saturate(2.5) brightness(1.1) contrast(1.3)" },
  { name:"Ijzig",      f:"hue-rotate(180deg) saturate(0.7) brightness(1.1)" },
  { name:"Goud",       f:"sepia(0.8) saturate(2) brightness(1.05) hue-rotate(-10deg)" },
  { name:"Cyaan",      f:"hue-rotate(160deg) saturate(1.3) brightness(1.05)" },
  { name:"Roze",       f:"hue-rotate(300deg) saturate(1.5) brightness(1.1)" },
];

const FONTS = [
  "Arial","Georgia","Impact","Courier New","Verdana","Times New Roman",
  "Trebuchet MS","Palatino","Garamond","Book Antiqua","Arial Black","Comic Sans MS",
];

const STICKERS = [
  "😀","😂","😍","🥰","😎","🤩","😢","😡","🥳","🤔","👍","👎","❤️","🔥","⭐",
  "🎉","🎨","🌈","🌟","💫","🦋","🌸","🍀","🌙","☀️","⚡","🎵","🎶","🏆","💎",
  "🐶","🐱","🦊","🐼","🦁","🦄","🐙","🌺","🎭","🍕","🎮","🚀","💻","📸","🎬",
];

const BLEND_MODES: BlendMode[] = ["normal","multiply","screen","overlay","darken","lighten","color-dodge","color-burn","hard-light","soft-light","difference","exclusion"];

const BORDER_STYLES = [
  { n:"Geen",     v:"none",                  p:"transparent" },
  { n:"Dun wit",  v:"4px solid #FAF7F2",     p:"#FAF7F2" },
  { n:"Dik wit",  v:"16px solid #FAF7F2",    p:"#FAF7F2" },
  { n:"Zwart",    v:"16px solid #111",       p:"#111" },
  { n:"Goud",     v:"10px solid #C9A84C",    p:"#C9A84C" },
  { n:"Gestippeld",v:"4px dashed #FAF7F2",   p:"#FAF7F2" },
  { n:"Dubbel",   v:"8px double #FAF7F2",    p:"#FAF7F2" },
  { n:"Grijs",    v:"10px solid #555",       p:"#555" },
  { n:"Rood",     v:"10px solid #e05252",    p:"#e05252" },
  { n:"Blauw",    v:"10px solid #4a9eff",    p:"#4a9eff" },
];

const googleFonts = `https://fonts.googleapis.com/css2?family=Montserrat&family=Playfair+Display&family=Oswald&family=Poppins&family=Dancing+Script&family=Pacifico&family=Bebas+Neue&family=Great+Vibes&family=Lobster&display=swap`;

// ── Main Component ─────────────────────────────────────────────────────────────
export default function Editor() {
  const [image,          setImage]          = useState<string|null>(null);
  const [imageName,      setImageName]      = useState("afbeelding");
  const [activeTool,     setActiveTool]     = useState<ActiveTool>("move");
  const [rightTab,       setRightTab]       = useState<RightTab>("adjust");
  const [layers,         setLayers]         = useState<Layer[]>([]);
  const [history,        setHistory]        = useState<HistoryEntry[]>([]);
  const [historyIdx,     setHistoryIdx]     = useState(-1);
  const [zoom,           setZoom]           = useState(100);
  const [showGrid,       setShowGrid]       = useState(false);
  const [showRulers,     setShowRulers]     = useState(true);
  const [openMenu,       setOpenMenu]       = useState<string|null>(null);
  const [draggingUpload, setDraggingUpload] = useState(false);

  // Adjust
  const [brightness,  setBrightness]  = useState(100);
  const [contrast,    setContrast]    = useState(100);
  const [saturation,  setSaturation]  = useState(100);
  const [opacity,     setOpacity]     = useState(100);
  const [hue,         setHue]         = useState(0);
  const [warmth,      setWarmth]      = useState(0);
  const [vibrance,    setVibrance]    = useState(0);
  const [exposure,    setExposure]    = useState(0);
  const [highlights,  setHighlights]  = useState(0);
  const [shadows2,    setShadows2]    = useState(0);
  const [whites,      setWhites]      = useState(0);
  const [blacks,      setBlacks]      = useState(0);
  // Levels
  const [levelsIn0,  setLevelsIn0]   = useState(0);
  const [levelsIn1,  setLevelsIn1]   = useState(128);
  const [levelsIn2,  setLevelsIn2]   = useState(255);
  const [levelsOut0, setLevelsOut0]  = useState(0);
  const [levelsOut1, setLevelsOut1]  = useState(255);
  // Curves (simplified: shadows / midtones / highlights)
  const [curveShadow, setCurveShadow]   = useState(0);
  const [curveMid,    setCurveMid]      = useState(0);
  const [curveHigh,   setCurveHigh]     = useState(0);
  // Color balance
  const [cbShadowR,   setCbShadowR]    = useState(0);
  const [cbShadowG,   setCbShadowG]    = useState(0);
  const [cbShadowB,   setCbShadowB]    = useState(0);
  const [cbMidR,      setCbMidR]       = useState(0);
  const [cbMidG,      setCbMidG]       = useState(0);
  const [cbMidB,      setCbMidB]       = useState(0);
  // Photo filter
  const [filterColor, setFilterColor]  = useState("#e08020");
  const [filterDensity,setFilterDensity]=useState(0);
  // Effects
  const [blur,        setBlur]         = useState(0);
  const [sharpen,     setSharpen]      = useState(0);
  const [vignette,    setVignette]     = useState(0);
  const [grain,       setGrain]        = useState(0);
  const [glowR,       setGlowR]        = useState(255);
  const [glowG,       setGlowG]        = useState(200);
  const [glowB,       setGlowB]        = useState(100);
  const [glowStr,     setGlowStr]      = useState(0);
  const [pixelate,    setPixelate]     = useState(0);
  const [noiseAmt,    setNoiseAmt]     = useState(0);
  // Filter preset
  const [filterPreset,setFilterPreset] = useState(0);
  // Border
  const [borderStyle, setBorderStyle]  = useState("none");
  // Text tool state
  const [newText,     setNewText]      = useState("");
  const [textColor,   setTextColor]    = useState("#ffffff");
  const [textSize,    setTextSize]     = useState(36);
  const [textFont,    setTextFont]     = useState("Arial");
  const [textBold,    setTextBold]     = useState(true);
  const [textItalic,  setTextItalic]   = useState(false);
  // Shape
  const [shapeType,   setShapeType]    = useState<ShapeType>("rect");
  const [shapeFill,   setShapeFill]    = useState("#C9A84C");
  const [shapeStroke, setShapeStroke]  = useState("none");
  const [shapeStrokeW,setShapeStrokeW] = useState(2);
  // Draw
  const [brushSize,   setBrushSize]    = useState(10);
  const [brushColor,  setBrushColor]   = useState("#C9A84C");
  const [brushOpacity,setBrushOpacity] = useState(100);
  const [isDrawing,   setIsDrawing]    = useState(false);
  const [drawPaths,   setDrawPaths]    = useState<{x:number;y:number;size:number;color:string;opacity:number}[][]>([]);
  const [currentPath, setCurrentPath]  = useState<{x:number;y:number;size:number;color:string;opacity:number}[]>([]);
  // FG/BG colors
  const [fgColor,     setFgColor]      = useState("#C9A84C");
  const [bgColor,     setBgColor]      = useState("#1a1a1a");
  // Selected layer
  const [selectedLayerId, setSelectedLayerId] = useState<string|null>(null);
  const [draggingLayer,   setDraggingLayer]   = useState<string|null>(null);
  const [dragOverLayer,   setDragOverLayer]   = useState<string|null>(null);
  // Crop
  const [cropMode,    setCropMode]     = useState("free");
  const [cropX,       setCropX]        = useState(0);
  const [cropY,       setCropY]        = useState(0);
  const [cropW,       setCropW]        = useState(100);
  const [cropH,       setCropH]        = useState(100);
  const [showCrop,    setShowCrop]     = useState(false);
  // Misc
  const [user,        setUser]         = useState<any>(null);
  const [dlCount,     setDlCount]      = useState(0);
  const [showLimit,   setShowLimit]    = useState(false);
  const [showBlock,   setShowBlock]    = useState(false);
  const [tooltip,     setTooltip]      = useState<string|null>(null);
  const [imageLoaded, setImageLoaded]  = useState(false);
  const [exporting,   setExporting]    = useState(false);
  const [adjustOpen,  setAdjustOpen]   = useState<Record<string,boolean>>({ basic:true, tone:false, color:false, levels:false, curves:false, colorbal:false, photofilter:false, effects:true });
  const [selectedSticker, setSelectedSticker] = useState<string|null>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const [imgNatural, setImgNatural] = useState({ w: 0, h: 0 });

  const imgRef        = useRef<HTMLImageElement|null>(null);
  const imgElRef      = useRef<HTMLImageElement|null>(null);
  const canvasAreaRef = useRef<HTMLDivElement>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement|null>(null);
  const inputRef      = useRef<HTMLInputElement>(null);
  const stickerRef    = useRef<HTMLInputElement>(null);

  const remaining = Math.max(0, FREE_LIMIT - dlCount);

  useEffect(() => {
    supabase.auth.getUser().then(({data:{user}}) => setUser(user));
    setDlCount(parseInt(localStorage.getItem("brons_downloads")||"0"));
  }, []);

  const addHistory = useCallback((label: string) => {
    setHistory(prev => [...prev.slice(0, historyIdx+1), { label, timestamp: Date.now() }].slice(-30));
    setHistoryIdx(prev => Math.min(prev+1, 29));
  }, [historyIdx]);

  const getFilter = () => {
    const base = FILTERS_LIST[filterPreset].f;
    const exp  = exposure !== 0 ? `brightness(${100 + exposure * 1.2}%)` : "";
    const vib  = vibrance !== 0 ? `saturate(${100 + vibrance}%)` : "";
    const sh   = sharpen  > 0   ? `contrast(${100 + sharpen * 0.5}%)` : "";
    const main = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) opacity(${opacity}%) hue-rotate(${hue + warmth}deg) blur(${blur * 0.08}px)`;
    return [base==="none"?"":base, main, exp, vib, sh].filter(Boolean).join(" ");
  };

  const getBoxShadow = () => {
    const p:string[] = ["0 12px 80px rgba(0,0,0,0.8)"];
    if (glowStr > 0) p.push(`0 0 ${glowStr * 3}px rgba(${glowR},${glowG},${glowB},${glowStr*0.014})`);
    return p.join(", ");
  };

  const addFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setImageName(file.name.replace(/\.[^.]+$/,""));
    setImageLoaded(false);
    const reader = new FileReader();
    reader.onload = e => {
      const b64 = e.target?.result as string;
      setImage(b64);
      const img = new Image();
      img.src = b64;
      img.onload = () => {
        imgRef.current = img;
        setImgNatural({ w: img.naturalWidth, h: img.naturalHeight });
        const baseLayer: Layer = { id:"base-img", type:"image", name:"Achtergrond", visible:true, locked:false, opacity:100, blendMode:"normal", selected:true };
        setLayers([baseLayer]);
        setSelectedLayerId("base-img");
        setHistory([{ label:"Afbeelding geopend", timestamp:Date.now() }]);
        setHistoryIdx(0);
        setTimeout(() => setImageLoaded(true), 50);
      };
    };
    reader.readAsDataURL(file);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDraggingUpload(false);
    const file = e.dataTransfer.files[0];
    if (file) addFile(file);
  }, []);

  const addTextLayer = () => {
    if (!newText.trim()) return;
    const id = Math.random().toString(36).slice(2);
    const layer: Layer = { id, type:"text", name:`Tekst: "${newText.slice(0,12)}"`, visible:true, locked:false, opacity:100, blendMode:"normal", selected:true, text:newText, x:80, y:80, fontSize:textSize, fontFamily:textFont, color:textColor, bold:textBold, italic:textItalic };
    setLayers(prev => [layer, ...prev.filter(l=>l.type!=="image"), ...prev.filter(l=>l.type==="image")]);
    setSelectedLayerId(id);
    setNewText("");
    addHistory("Tekst toegevoegd");
  };

  const addShapeLayer = () => {
    const id = Math.random().toString(36).slice(2);
    const layer: Layer = { id, type:"shape", name:`Vorm: ${shapeType}`, visible:true, locked:false, opacity:100, blendMode:"normal", selected:true, shapeType, x:60, y:60, x2:200, y2:160, fillColor:shapeFill, strokeColor:shapeStroke, strokeWidth:shapeStrokeW };
    setLayers(prev => [layer, ...prev.filter(l=>l.type!=="image"), ...prev.filter(l=>l.type==="image")]);
    setSelectedLayerId(id);
    addHistory("Vorm toegevoegd");
  };

  const addStickerLayer = (emoji: string) => {
    const id = Math.random().toString(36).slice(2);
    const layer: Layer = { id, type:"sticker", name:`Sticker: ${emoji}`, visible:true, locked:false, opacity:100, blendMode:"normal", selected:true, emoji, x:80, y:80, width:60, height:60, rotation:0, isImageSticker:false };
    setLayers(prev => [layer, ...prev.filter(l=>l.type!=="image"), ...prev.filter(l=>l.type==="image")]);
    setSelectedLayerId(id);
    addHistory("Sticker toegevoegd");
  };

  const addImageStickerLayer = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = e => {
      const b64 = e.target?.result as string;
      const id = Math.random().toString(36).slice(2);
      const img = new Image();
      img.src = b64;
      img.onload = () => {
        const a = img.naturalWidth / img.naturalHeight;
        const w = 150, h = w / a;
        const layer: Layer = { id, type:"sticker", name:"Afbeelding sticker", visible:true, locked:false, opacity:100, blendMode:"normal", selected:true, imageUrl:b64, x:60, y:60, width:w, height:h, rotation:0, isImageSticker:true };
        setLayers(prev => [layer, ...prev.filter(l=>l.type!=="image"), ...prev.filter(l=>l.type==="image")]);
        setSelectedLayerId(id);
        addHistory("Afbeelding sticker toegevoegd");
      };
    };
    reader.readAsDataURL(file);
  };

  const startDrag = (e: React.MouseEvent, layerId: string, cx: number, cy: number) => {
    if (activeTool !== "move") return;
    e.preventDefault(); e.stopPropagation();
    const rect = canvasAreaRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ox = e.clientX - rect.left - cx, oy = e.clientY - rect.top - cy;
    const move = (me: MouseEvent) => {
      const r = canvasAreaRef.current?.getBoundingClientRect();
      if (!r) return;
      setLayers(prev => prev.map(l => l.id===layerId ? {...l, x: me.clientX-r.left-ox, y: me.clientY-r.top-oy} : l));
    };
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };

  const startStickerResize = (e: React.MouseEvent, layer: Layer) => {
    e.preventDefault(); e.stopPropagation();
    const sx = e.clientX, sy = e.clientY, sw = layer.width||60, sh = layer.height||60;
    const move = (me: MouseEvent) => {
      setLayers(prev => prev.map(l => l.id===layer.id ? {...l, width:Math.max(20,sw+(me.clientX-sx)), height:Math.max(20,sh+(me.clientY-sy))} : l));
    };
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };

  const deleteLayer = (id: string) => {
    setLayers(prev => prev.filter(l => l.id !== id));
    if (selectedLayerId === id) setSelectedLayerId(null);
    addHistory("Laag verwijderd");
  };

  const duplicateLayer = (id: string) => {
    const layer = layers.find(l => l.id === id);
    if (!layer) return;
    const newId = Math.random().toString(36).slice(2);
    const newLayer = { ...layer, id:newId, name:layer.name+" kopie", x:(layer.x||0)+20, y:(layer.y||0)+20 };
    setLayers(prev => [newLayer, ...prev]);
    setSelectedLayerId(newId);
    addHistory("Laag gedupliceerd");
  };

  const download = async () => {
    if (!imgRef.current) return;
    if (!user && dlCount >= FREE_LIMIT) { setShowBlock(true); return; }
    setExporting(true);

    const canvasRect = canvasAreaRef.current?.getBoundingClientRect();
    const imgRect    = imgElRef.current?.getBoundingClientRect();
    const offsetX    = imgRect && canvasRect ? imgRect.left - canvasRect.left : 0;
    const offsetY    = imgRect && canvasRect ? imgRect.top  - canvasRect.top  : 0;
    const dW         = imgRect?.width  || 1, dH = imgRect?.height || 1;
    const nW         = imgRef.current.naturalWidth, nH = imgRef.current.naturalHeight;
    const scX        = nW/dW, scY = nH/dH;

    const canvas = document.createElement("canvas");
    canvas.width = nW; canvas.height = nH;
    const ctx = canvas.getContext("2d")!;
    ctx.filter = getFilter();
    ctx.drawImage(imgRef.current, 0, 0);
    ctx.filter = "none";

    // Photo filter overlay
    if (filterDensity > 0) {
      ctx.fillStyle = filterColor;
      ctx.globalAlpha = filterDensity * 0.006;
      ctx.fillRect(0, 0, nW, nH);
      ctx.globalAlpha = 1;
    }

    // Vignette
    if (vignette > 0) {
      const grad = ctx.createRadialGradient(nW/2,nH/2,nW*0.25,nW/2,nH/2,nW*0.75);
      grad.addColorStop(0,"rgba(0,0,0,0)");
      grad.addColorStop(1,`rgba(0,0,0,${vignette*0.009})`);
      ctx.fillStyle = grad; ctx.fillRect(0,0,nW,nH);
    }

    // Grain
    if (noiseAmt > 0) {
      const imgData = ctx.getImageData(0,0,nW,nH);
      for (let i=0;i<imgData.data.length;i+=4) {
        const n = (Math.random()-0.5)*noiseAmt*1.5;
        imgData.data[i]+=n; imgData.data[i+1]+=n; imgData.data[i+2]+=n;
      }
      ctx.putImageData(imgData,0,0);
    }

    // Draw layers
    for (const layer of [...layers].reverse()) {
      if (!layer.visible) continue;
      ctx.globalAlpha = layer.opacity / 100;
      ctx.globalCompositeOperation = layer.blendMode === "normal" ? "source-over" : layer.blendMode as GlobalCompositeOperation;

      if (layer.type==="text" && layer.text) {
        const ff = `${layer.italic?"italic ":""}${layer.bold?"bold ":""}${(layer.fontSize||36)*scX}px ${layer.fontFamily||"Arial"}`;
        ctx.font = ff; ctx.fillStyle = layer.color||"#fff";
        ctx.shadowColor="rgba(0,0,0,0.7)"; ctx.shadowBlur=6;
        ctx.fillText(layer.text, (layer.x||0)*scX, (layer.y||0)*scY);
        ctx.shadowBlur=0;
      }
      if (layer.type==="shape") {
        const x1=(layer.x||0)*scX, y1=(layer.y||0)*scY;
        const x2=(layer.x2||100)*scX, y2=(layer.y2||100)*scY;
        ctx.fillStyle = layer.fillColor||"transparent";
        ctx.strokeStyle = layer.strokeColor!=="none"?(layer.strokeColor||"transparent"):"transparent";
        ctx.lineWidth = (layer.strokeWidth||2)*scX;
        if (layer.shapeType==="rect") {
          if (layer.fillColor!=="none") ctx.fillRect(x1,y1,x2-x1,y2-y1);
          if (layer.strokeColor!=="none") ctx.strokeRect(x1,y1,x2-x1,y2-y1);
        } else if (layer.shapeType==="ellipse") {
          ctx.beginPath(); ctx.ellipse((x1+x2)/2,(y1+y2)/2,Math.abs(x2-x1)/2,Math.abs(y2-y1)/2,0,0,Math.PI*2);
          if (layer.fillColor!=="none") ctx.fill();
          if (layer.strokeColor!=="none") ctx.stroke();
        } else if (layer.shapeType==="line"||layer.shapeType==="arrow") {
          ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2);
          ctx.strokeStyle = layer.fillColor||"#fff"; ctx.lineWidth=(layer.strokeWidth||2)*scX;
          ctx.stroke();
        }
      }
      if (layer.type==="sticker") {
        ctx.save();
        const cx = ((layer.x||0)+(layer.width||60)/2)*scX;
        const cy = ((layer.y||0)+(layer.height||60)/2)*scY;
        ctx.translate(cx,cy); ctx.rotate(((layer.rotation||0)*Math.PI)/180);
        if (!layer.isImageSticker && layer.emoji) {
          ctx.font = `${(layer.width||60)*scX}px serif`;
          ctx.fillText(layer.emoji, -(layer.width||60)*scX/2, (layer.height||60)*scY/2);
        } else if (layer.imageUrl) {
          await new Promise<void>(res => {
            const si = new Image();
            si.onload = () => { ctx.drawImage(si,-(layer.width||60)*scX/2,-(layer.height||60)*scY/2,(layer.width||60)*scX,(layer.height||60)*scY); res(); };
            si.onerror = () => res(); si.src = layer.imageUrl!;
          });
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    }

    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png"); a.download = `${imageName}_bewerkt.png`; a.click();
    setTimeout(() => setExporting(false), 800);

    if (!user) {
      const nc = dlCount+1;
      localStorage.setItem("brons_downloads", nc.toString());
      setDlCount(nc);
      if (nc >= FREE_LIMIT-1) setShowLimit(true);
    }
  };

  // ── CSS ────────────────────────────────────────────────────────────────────
  const css = `
    @keyframes fadeInUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
    @keyframes fadeIn   { from{opacity:0} to{opacity:1} }
    @keyframes slidePanel { from{opacity:0;transform:translateX(8px)} to{opacity:1;transform:translateX(0)} }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
    ::-webkit-scrollbar{width:4px;height:4px}
    ::-webkit-scrollbar-track{background:transparent}
    ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:2px}
    ::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,0.2)}
    .ps-menu-item { position:relative; padding:0 12px; height:100%; display:flex; align-items:center; font-size:12px; cursor:pointer; color:rgba(236,236,236,0.7); user-select:none; }
    .ps-menu-item:hover { background:rgba(255,255,255,0.08); color:#ececec; }
    .ps-menu-item.active { background:rgba(255,255,255,0.1); color:#ececec; }
    .tool-btn { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; width:100%; height:52px; border:none; cursor:pointer; background:transparent; color:rgba(236,236,236,0.4); transition:all 0.1s; border-left:2px solid transparent; }
    .tool-btn:hover { background:rgba(255,255,255,0.06); color:#ececec; }
    .tool-btn.active { background:rgba(201,168,76,0.14); color:#C9A84C; border-left:2px solid #C9A84C; }
    .section-header { display:flex; align-items:center; justify-content:space-between; padding:8px 14px; cursor:pointer; user-select:none; font-size:11px; font-weight:600; color:rgba(236,236,236,0.55); letter-spacing:1px; text-transform:uppercase; background:rgba(255,255,255,0.02); border-bottom:1px solid rgba(255,255,255,0.05); }
    .section-header:hover { background:rgba(255,255,255,0.05); color:#ececec; }
    .layer-row { display:flex; align-items:center; gap:8px; padding:6px 10px; cursor:pointer; font-size:12px; transition:background 0.1s; border-bottom:1px solid rgba(255,255,255,0.04); }
    .layer-row:hover { background:rgba(255,255,255,0.04); }
    .layer-row.selected { background:rgba(201,168,76,0.12); }
    .slider-track { position:relative; height:4px; border-radius:2px; background:rgba(255,255,255,0.1); margin:6px 0 12px; cursor:pointer; }
    .slider-track input[type=range] { position:absolute; inset:-8px 0; opacity:0; cursor:pointer; width:100%; height:20px; }
    input[type=range] { accent-color:#C9A84C; }
    .dropdown-menu { position:fixed; background:#1e1e1e; border:1px solid rgba(255,255,255,0.12); border-radius:5px; min-width:160px; z-index:1000; box-shadow:0 8px 32px rgba(0,0,0,0.6); animation:fadeIn 0.12s ease; }
    .dropdown-item { padding:7px 14px; font-size:12px; color:rgba(236,236,236,0.7); cursor:pointer; display:flex; justify-content:space-between; gap:20px; white-space:nowrap; }
    .dropdown-item:hover { background:rgba(255,255,255,0.07); color:#ececec; }
    .dropdown-item.disabled { opacity:0.35; cursor:default; pointer-events:none; }
    .dropdown-separator { height:1px; background:rgba(255,255,255,0.07); margin:3px 0; }
  `;

  // ── Helper components ──────────────────────────────────────────────────────
  const Label = ({ch, noMb}:{ch:string; noMb?:boolean}) => (
    <span style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:C.muted,display:"block",marginBottom:noMb?0:6}}>{ch}</span>
  );

  const SliderRow = ({label,value,min,max,set,suffix="%",color=C.accent}:{label:string;value:number;min:number;max:number;set:(v:number)=>void;suffix?:string;color?:string}) => (
    <div style={{marginBottom:2}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
        <Label ch={label} noMb />
        <span style={{fontSize:10,color:C.muted,fontVariantNumeric:"tabular-nums"}}>{value}{suffix}</span>
      </div>
      <div className="slider-track">
        <div style={{position:"absolute",left:0,top:0,height:"100%",borderRadius:2,width:`${((value-min)/(max-min))*100}%`,background:`linear-gradient(90deg,${color}66,${color})`}} />
        <input type="range" min={min} max={max} value={value} onChange={e=>set(parseInt(e.target.value))} />
      </div>
    </div>
  );

  const AccordionSection = ({id,title,children}:{id:string;title:string;children:React.ReactNode}) => (
    <div style={{borderBottom:`1px solid ${C.border}`}}>
      <div className="section-header" onClick={()=>setAdjustOpen(p=>({...p,[id]:!p[id]}))}>
        <span>{title}</span>
        <span style={{fontSize:10,opacity:0.5,transform:adjustOpen[id]?"rotate(180deg)":"none",transition:"transform 0.2s"}}>▼</span>
      </div>
      {adjustOpen[id] && <div style={{padding:"12px 14px",display:"flex",flexDirection:"column",gap:8,animation:"slidePanel 0.15s ease"}}>{children}</div>}
    </div>
  );

  // ── Menu bar data ──────────────────────────────────────────────────────────
  const menus = {
    Bestand: [
      { label:"Openen", action:()=>inputRef.current?.click() },
      { sep:true },
      { label:"Exporteren als PNG", action:download },
      { label:"Exporteren als JPEG", action:download },
      { sep:true },
      { label:"Sluiten", action:()=>setImage(null) },
    ],
    Bewerken: [
      { label:"Ongedaan maken", shortcut:"Ctrl+Z", action:()=>{}, disabled:historyIdx<=0 },
      { label:"Opnieuw",        shortcut:"Ctrl+Y", action:()=>{}, disabled:historyIdx>=history.length-1 },
      { sep:true },
      { label:"Alles selecteren", shortcut:"Ctrl+A", action:()=>{} },
      { sep:true },
      { label:"Reset aanpassingen", action:()=>{setBrightness(100);setContrast(100);setSaturation(100);setOpacity(100);setHue(0);setWarmth(0);setVibrance(0);setExposure(0);setBorderStyle("none")} },
      { label:"Reset effecten",     action:()=>{setBlur(0);setSharpen(0);setVignette(0);setGrain(0);setGlowStr(0);setNoiseAmt(0);setPixelate(0)} },
    ],
    Afbeelding: [
      { label:"Aanpassingen", action:()=>{setRightTab("adjust");setOpenMenu(null)} },
      { label:"Filters",       action:()=>{setRightTab("filters");setOpenMenu(null)} },
      { sep:true },
      { label:"Afbeeldingsgrootte",  action:()=>{} },
      { label:"Canvas roteren 90°",  action:()=>{} },
    ],
    Laag: [
      { label:"Nieuwe laag",        action:()=>addTextLayer() },
      { label:"Laag dupliceren",     action:()=>selectedLayerId && duplicateLayer(selectedLayerId) },
      { label:"Laag verwijderen",    action:()=>selectedLayerId && deleteLayer(selectedLayerId) },
      { sep:true },
      { label:"Alles samenvoegen",  action:()=>{} },
    ],
    Filter: [
      { label:"Gaussian blur",   action:()=>{setBlur(15);setOpenMenu(null)} },
      { label:"Verscherpen",     action:()=>{setSharpen(60);setOpenMenu(null)} },
      { label:"Ruis toevoegen",  action:()=>{setNoiseAmt(40);setOpenMenu(null)} },
      { label:"Vignette",        action:()=>{setVignette(80);setOpenMenu(null)} },
      { sep:true },
      { label:"Zwart-wit",       action:()=>{setSaturation(0);setOpenMenu(null)} },
      { label:"Sepia",           action:()=>{setFilterPreset(4);setOpenMenu(null)} },
    ],
    Weergave: [
      { label:"Rasters tonen",   action:()=>setShowGrid(p=>!p),   shortcut:"Ctrl+'" },
      { label:"Linialen tonen",  action:()=>setShowRulers(p=>!p), shortcut:"Ctrl+R" },
      { sep:true },
      { label:"100%",            action:()=>setZoom(100) },
      { label:"Aanpassen",       action:()=>setZoom(75) },
      { label:"Inzoomen",        action:()=>setZoom(p=>Math.min(p+25,400)) },
      { label:"Uitzoomen",       action:()=>setZoom(p=>Math.max(p-25,25)) },
    ],
  };

  // ── Left toolbar tools ─────────────────────────────────────────────────────
  const TOOLS_LEFT = [
    { id:"move" as ActiveTool,       icon:"✥", label:"Verplaatsen (V)",    group:0 },
    { id:"marquee" as ActiveTool,    icon:"⬚", label:"Selectie (M)",       group:0 },
    { id:"crop" as ActiveTool,       icon:"⊡", label:"Bijsnijden (C)",      group:1 },
    { id:"eyedropper" as ActiveTool, icon:"💉",label:"Pipet (I)",           group:1 },
    { id:"brush" as ActiveTool,      icon:"✏", label:"Penseel (B)",        group:2 },
    { id:"eraser" as ActiveTool,     icon:"◻", label:"Gum (E)",            group:2 },
    { id:"gradient" as ActiveTool,   icon:"▦", label:"Verloop (G)",        group:2 },
    { id:"text" as ActiveTool,       icon:"T", label:"Tekst (T)",           group:3 },
    { id:"shape" as ActiveTool,      icon:"◯", label:"Vormen (U)",          group:3 },
    { id:"zoom" as ActiveTool,       icon:"⊕", label:"Zoom (Z)",            group:4 },
    { id:"hand" as ActiveTool,       icon:"✋",label:"Hand (H)",            group:4 },
  ];

  // ── Right panel: Adjustments ───────────────────────────────────────────────
  const AdjustPanel = () => (
    <div style={{display:"flex",flexDirection:"column"}}>
      <AccordionSection id="basic" title="Basis">
        <SliderRow label="Helderheid"    value={brightness} min={0}   max={200} set={setBrightness} />
        <SliderRow label="Contrast"      value={contrast}   min={0}   max={200} set={setContrast} />
        <SliderRow label="Verzadiging"   value={saturation} min={0}   max={200} set={setSaturation} />
        <SliderRow label="Transparantie" value={opacity}    min={10}  max={100} set={setOpacity} />
        <SliderRow label="Levendigheid"  value={vibrance}   min={-100}max={100} set={setVibrance} color="#44aaff" />
      </AccordionSection>

      <AccordionSection id="tone" title="Toon">
        <SliderRow label="Belichting"    value={exposure}   min={-100}max={100} set={setExposure}   suffix="" color="#ffcc44" />
        <SliderRow label="Hooglichten"   value={highlights} min={-100}max={100} set={setHighlights} suffix="" color="#e0e0e0" />
        <SliderRow label="Schaduwen"     value={shadows2}   min={-100}max={100} set={setShadows2}   suffix="" color="#888" />
        <SliderRow label="Witten"        value={whites}     min={-100}max={100} set={setWhites}     suffix="" color="#fff" />
        <SliderRow label="Zwarten"       value={blacks}     min={-100}max={100} set={setBlacks}     suffix="" color="#555" />
      </AccordionSection>

      <AccordionSection id="color" title="Kleur">
        <SliderRow label="Tint (Hue)"    value={hue}    min={-180} max={180} set={setHue}    suffix="°" color={C.blue} />
        <SliderRow label="Warmte"        value={warmth} min={-60}  max={60}  set={setWarmth} suffix="°" color="#e07040" />
      </AccordionSection>

      <AccordionSection id="levels" title="Niveaus">
        <Label ch="Invoer" />
        <SliderRow label="Schaduwen"   value={levelsIn0} min={0}   max={253} set={setLevelsIn0} suffix="" />
        <SliderRow label="Middentonen" value={levelsIn1} min={1}   max={254} set={setLevelsIn1} suffix="" color="#aaa" />
        <SliderRow label="Hooglichten" value={levelsIn2} min={2}   max={255} set={setLevelsIn2} suffix="" color="#eee" />
        <Label ch="Uitvoer" />
        <SliderRow label="Min"  value={levelsOut0} min={0} max={254} set={setLevelsOut0} suffix="" />
        <SliderRow label="Max"  value={levelsOut1} min={1} max={255} set={setLevelsOut1} suffix="" color="#eee" />
      </AccordionSection>

      <AccordionSection id="curves" title="Curven">
        <SliderRow label="Hooglichten" value={curveHigh}   min={-100} max={100} set={setCurveHigh}   suffix="" color="#e0e0e0" />
        <SliderRow label="Middentonen" value={curveMid}    min={-100} max={100} set={setCurveMid}    suffix="" color="#aaa" />
        <SliderRow label="Schaduwen"   value={curveShadow} min={-100} max={100} set={setCurveShadow} suffix="" color="#666" />
        {/* Visual curve preview */}
        <svg width="100%" height="64" viewBox="0 0 200 64" style={{borderRadius:4,border:`1px solid ${C.border}`,background:C.panel2}}>
          <path d={`M 0 ${32+curveShadow*0.3} Q 100 ${32-curveMid*0.3} 200 ${32-curveHigh*0.3}`} fill="none" stroke={C.accent} strokeWidth="1.5" />
          <line x1="0" y1="64" x2="200" y2="0" stroke={C.border} strokeWidth="1" strokeDasharray="3,3"/>
        </svg>
      </AccordionSection>

      <AccordionSection id="colorbal" title="Kleurbalans">
        <Label ch="Schaduwen" />
        <SliderRow label="R" value={cbShadowR} min={-100} max={100} set={setCbShadowR} suffix="" color="#e05555" />
        <SliderRow label="G" value={cbShadowG} min={-100} max={100} set={setCbShadowG} suffix="" color="#55e055" />
        <SliderRow label="B" value={cbShadowB} min={-100} max={100} set={setCbShadowB} suffix="" color="#5599ff" />
        <Label ch="Middentonen" />
        <SliderRow label="R" value={cbMidR} min={-100} max={100} set={setCbMidR} suffix="" color="#e05555" />
        <SliderRow label="G" value={cbMidG} min={-100} max={100} set={setCbMidG} suffix="" color="#55e055" />
        <SliderRow label="B" value={cbMidB} min={-100} max={100} set={setCbMidB} suffix="" color="#5599ff" />
      </AccordionSection>

      <AccordionSection id="photofilter" title="Foto filter">
        <Label ch="Filterkleur" />
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
          <input type="color" value={filterColor} onChange={e=>setFilterColor(e.target.value)} style={{width:32,height:24,borderRadius:4,border:`1px solid ${C.border}`,background:"none",cursor:"pointer"}} />
          <span style={{fontSize:11,color:C.muted}}>{filterColor}</span>
        </div>
        <SliderRow label="Dichtheid" value={filterDensity} min={0} max={100} set={setFilterDensity} />
      </AccordionSection>

      <AccordionSection id="effects" title="Effecten">
        <SliderRow label="Blur"       value={blur}      min={0} max={40}  set={setBlur}      suffix="" color="#7090e0" />
        <SliderRow label="Scherpte"   value={sharpen}   min={0} max={100} set={setSharpen}   suffix="" color="#e0a070" />
        <SliderRow label="Vignette"   value={vignette}  min={0} max={100} set={setVignette}  suffix="" color="#a070e0" />
        <SliderRow label="Ruis"       value={noiseAmt}  min={0} max={100} set={setNoiseAmt}  suffix="" color="#70e0a0" />
        <SliderRow label="Gloed"      value={glowStr}   min={0} max={80}  set={setGlowStr}   suffix="" color={`rgb(${glowR},${glowG},${glowB})`} />
        {glowStr > 0 && (
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
            {[{l:"R",v:glowR,s:setGlowR,c:"#e05555"},{l:"G",v:glowG,s:setGlowG,c:"#55e055"},{l:"B",v:glowB,s:setGlowB,c:"#5599ff"}].map(ch=>(
              <div key={ch.l}><span style={{fontSize:9,color:ch.c,letterSpacing:1,display:"block",textAlign:"center",marginBottom:3}}>{ch.l}</span><input type="range" min={0} max={255} value={ch.v} onChange={e=>ch.s(parseInt(e.target.value))} style={{accentColor:ch.c,width:"100%"}} /></div>
            ))}
          </div>
        )}
      </AccordionSection>

      <AccordionSection id="border" title="Kader">
        {BORDER_STYLES.map(b=>(
          <button key={b.n} onClick={()=>setBorderStyle(b.v)} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 10px",borderRadius:4,cursor:"pointer",background:borderStyle===b.v?C.accentDim:"transparent",border:borderStyle===b.v?`1px solid ${C.accentBorder}`:`1px solid transparent`,color:borderStyle===b.v?C.accent:C.muted,fontSize:12,width:"100%",textAlign:"left",transition:"all 0.1s"}}>
            <div style={{width:16,height:16,borderRadius:2,flexShrink:0,border:b.v==="none"?`1px dashed ${C.border}`:`3px solid ${b.p}`}} />
            {b.n}
          </button>
        ))}
      </AccordionSection>
    </div>
  );

  // ── Right panel: Filters ───────────────────────────────────────────────────
  const FiltersPanel = () => (
    <div style={{padding:14}}>
      <button onClick={()=>{setVibrance(20);setBrightness(105);setContrast(108);setSaturation(112)}} style={{width:"100%",padding:"8px",background:C.accentDim,border:`1px solid ${C.accentBorder}`,color:C.accent,borderRadius:5,fontSize:11,cursor:"pointer",marginBottom:12,letterSpacing:1}}>✨ Auto verbeteren</button>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
        {FILTERS_LIST.map((f,i)=>(
          <button key={i} onClick={()=>setFilterPreset(i)} style={{border:filterPreset===i?`1.5px solid ${C.accent}`:`1px solid ${C.border}`,borderRadius:5,background:filterPreset===i?C.accentDim:C.panel2,padding:5,cursor:"pointer",transition:"all 0.12s"}}>
            <div style={{height:54,borderRadius:4,overflow:"hidden",position:"relative"}}>
              <img src={image!} alt={f.name} style={{width:"100%",height:"100%",objectFit:"cover",filter:f.f==="none"?"none":f.f}} />
              {filterPreset===i && <div style={{position:"absolute",top:4,right:4,width:14,height:14,borderRadius:"50%",background:C.accent,display:"flex",alignItems:"center",justifyContent:"center"}}><svg width="8" height="8" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#111" strokeWidth="2" strokeLinecap="round"/></svg></div>}
            </div>
            <p style={{fontSize:9,color:filterPreset===i?C.accent:C.muted,margin:"5px 0 1px",textAlign:"center",letterSpacing:1,textTransform:"uppercase"}}>{f.name}</p>
          </button>
        ))}
      </div>
    </div>
  );

  // ── Right panel: Layers ────────────────────────────────────────────────────
  const LayersPanel = () => (
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      <div style={{padding:"10px 12px",borderBottom:`1px solid ${C.border}`,display:"flex",gap:6}}>
        {[
          {icon:"T",  action:()=>{ setRightTab("adjust"); setActiveTool("text"); }, tip:"Tekst laag" },
          {icon:"⬜", action:()=>{ setRightTab("adjust"); setActiveTool("shape"); }, tip:"Vorm laag" },
          {icon:"😊", action:()=>{}, tip:"Sticker" },
        ].map(b=>(
          <button key={b.icon} onClick={b.action} title={b.tip} style={{flex:1,padding:"5px",background:C.panel2,border:`1px solid ${C.border}`,borderRadius:4,color:C.muted,fontSize:14,cursor:"pointer"}}>
            {b.icon}
          </button>
        ))}
      </div>
      <div style={{flex:1,overflowY:"auto"}}>
        {layers.map((layer,i)=>(
          <div key={layer.id} className={`layer-row ${selectedLayerId===layer.id?"selected":""}`}
            onClick={()=>setSelectedLayerId(layer.id)}
            style={{opacity:layer.visible?1:0.4}}>
            {/* Thumb */}
            <div style={{width:28,height:28,borderRadius:3,background:C.panel3,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,border:`1px solid ${C.border}`}}>
              {layer.type==="image" && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>}
              {layer.type==="text"  && <span style={{fontSize:13,color:C.accent,fontWeight:"bold"}}>T</span>}
              {layer.type==="shape" && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2"><rect x="3" y="3" width="18" height="18"/></svg>}
              {layer.type==="sticker" && <span style={{fontSize:16}}>{layer.emoji||"🖼"}</span>}
            </div>
            {/* Name */}
            <div style={{flex:1,overflow:"hidden"}}>
              <div style={{fontSize:11,color:selectedLayerId===layer.id?C.accent:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{layer.name}</div>
              <div style={{fontSize:9,color:C.muted,letterSpacing:1,textTransform:"uppercase"}}>{layer.blendMode} · {layer.opacity}%</div>
            </div>
            {/* Controls */}
            <div style={{display:"flex",gap:3,flexShrink:0}}>
              <button onClick={e=>{e.stopPropagation();setLayers(p=>p.map(l=>l.id===layer.id?{...l,visible:!l.visible}:l))}} style={{background:"none",border:"none",cursor:"pointer",color:layer.visible?C.muted:"rgba(255,255,255,0.15)",fontSize:13,padding:"0 2px"}}>
                {layer.visible?"👁":""}
              </button>
              {layer.type!=="image" && (
                <button onClick={e=>{e.stopPropagation();deleteLayer(layer.id)}} style={{background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,0.15)",fontSize:11,padding:"0 2px"}}>✕</button>
              )}
            </div>
          </div>
        ))}
      </div>
      {/* Layer properties */}
      {selectedLayerId && (() => {
        const layer = layers.find(l=>l.id===selectedLayerId);
        if (!layer) return null;
        return (
          <div style={{borderTop:`1px solid ${C.border}`,padding:"10px 12px",display:"flex",flexDirection:"column",gap:8}}>
            <SliderRow label="Opacity" value={layer.opacity} min={0} max={100} set={v=>setLayers(p=>p.map(l=>l.id===layer.id?{...l,opacity:v}:l))} />
            <div>
              <Label ch="Overvloeimodus" noMb />
              <select value={layer.blendMode} onChange={e=>setLayers(p=>p.map(l=>l.id===layer.id?{...l,blendMode:e.target.value as BlendMode}:l))} style={{width:"100%",background:C.panel3,color:C.text,border:`1px solid ${C.border}`,borderRadius:4,padding:"5px 8px",fontSize:11,marginTop:6}}>
                {BLEND_MODES.map(m=><option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            {layer.type!=="image" && (
              <button onClick={()=>duplicateLayer(layer.id)} style={{padding:"6px",background:C.panel2,border:`1px solid ${C.border}`,borderRadius:4,color:C.muted,fontSize:11,cursor:"pointer"}}>Dupliceer laag</button>
            )}
          </div>
        );
      })()}
    </div>
  );

  // ── Right panel: History ───────────────────────────────────────────────────
  const HistoryPanel = () => (
    <div style={{padding:"12px",display:"flex",flexDirection:"column",gap:3}}>
      <Label ch={`${history.length} acties`} />
      {[...history].reverse().map((h,i)=>(
        <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 8px",borderRadius:4,background:i===0?C.accentDim:"transparent",border:`1px solid ${i===0?C.accentBorder:"transparent"}`,cursor:"pointer"}}
          onClick={()=>{}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:i===0?C.accent:C.muted,flexShrink:0}} />
          <span style={{fontSize:11,color:i===0?C.accent:C.muted}}>{h.label}</span>
          <span style={{fontSize:9,color:"rgba(255,255,255,0.15)",marginLeft:"auto"}}>{new Date(h.timestamp).toLocaleTimeString("nl",{hour:"2-digit",minute:"2-digit"})}</span>
        </div>
      ))}
    </div>
  );

  // ── Tool options bar ───────────────────────────────────────────────────────
  const ToolOptionsBar = () => {
    if (activeTool==="brush") return (
      <div style={{height:36,background:C.surface,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:12,padding:"0 14px",flexShrink:0}}>
        <Label ch="Grootte" noMb /><div style={{width:80}}><SliderRow label="" value={brushSize} min={1} max={100} set={setBrushSize} suffix="px" /></div>
        <Label ch="Kleur" noMb />
        <input type="color" value={brushColor} onChange={e=>setBrushColor(e.target.value)} style={{width:28,height:22,borderRadius:3,border:`1px solid ${C.border}`,cursor:"pointer"}} />
        <Label ch="Dekking" noMb /><div style={{width:80}}><SliderRow label="" value={brushOpacity} min={1} max={100} set={setBrushOpacity} /></div>
      </div>
    );
    if (activeTool==="text") return (
      <div style={{height:36,background:C.surface,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10,padding:"0 14px",flexShrink:0,overflowX:"auto"}}>
        <select value={textFont} onChange={e=>setTextFont(e.target.value)} style={{background:C.panel2,color:C.text,border:`1px solid ${C.border}`,borderRadius:4,padding:"3px 6px",fontSize:11}}>
          {FONTS.map(f=><option key={f} value={f}>{f}</option>)}
        </select>
        <div style={{width:70}}><SliderRow label="" value={textSize} min={8} max={120} set={setTextSize} suffix="px" /></div>
        {[{l:"B",v:textBold,s:setTextBold,style:{fontWeight:"bold"}},{l:"I",v:textItalic,s:setTextItalic,style:{fontStyle:"italic"}}].map(t=>(
          <button key={t.l} onClick={()=>t.s(!t.v)} style={{width:26,height:22,borderRadius:3,background:t.v?C.accentDim:"transparent",border:t.v?`1px solid ${C.accentBorder}`:`1px solid ${C.border}`,color:t.v?C.accent:C.muted,cursor:"pointer",fontSize:12,...t.style}}>{t.l}</button>
        ))}
        <input type="color" value={textColor} onChange={e=>setTextColor(e.target.value)} style={{width:28,height:22,borderRadius:3,border:`1px solid ${C.border}`,cursor:"pointer"}} />
      </div>
    );
    if (activeTool==="shape") return (
      <div style={{height:36,background:C.surface,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10,padding:"0 14px",flexShrink:0}}>
        {(["rect","ellipse","line","arrow"] as ShapeType[]).map(s=>(
          <button key={s} onClick={()=>setShapeType(s)} style={{padding:"3px 10px",borderRadius:4,background:shapeType===s?C.accentDim:"transparent",border:shapeType===s?`1px solid ${C.accentBorder}`:`1px solid ${C.border}`,color:shapeType===s?C.accent:C.muted,fontSize:11,cursor:"pointer"}}>
            {s==="rect"?"⬜":s==="ellipse"?"⚪":s==="line"?"—":"→"}  {s}
          </button>
        ))}
        <span style={{fontSize:10,color:C.muted}}>Vulling</span>
        <input type="color" value={shapeFill} onChange={e=>setShapeFill(e.target.value)} style={{width:26,height:22,borderRadius:3,border:`1px solid ${C.border}`,cursor:"pointer"}} />
        <button onClick={addShapeLayer} style={{padding:"3px 12px",background:C.accent,color:"#111",border:"none",borderRadius:4,fontSize:11,cursor:"pointer",fontWeight:700}}>Toevoegen</button>
      </div>
    );
    if (activeTool==="zoom") return (
      <div style={{height:36,background:C.surface,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10,padding:"0 14px",flexShrink:0}}>
        <button onClick={()=>setZoom(p=>Math.min(p+25,400))} style={{padding:"3px 10px",background:C.panel2,border:`1px solid ${C.border}`,color:C.text,borderRadius:4,fontSize:12,cursor:"pointer"}}>+ Inzoomen</button>
        <button onClick={()=>setZoom(p=>Math.max(p-25,25))}  style={{padding:"3px 10px",background:C.panel2,border:`1px solid ${C.border}`,color:C.text,borderRadius:4,fontSize:12,cursor:"pointer"}}>− Uitzoomen</button>
        <button onClick={()=>setZoom(100)} style={{padding:"3px 10px",background:C.panel2,border:`1px solid ${C.border}`,color:C.muted,borderRadius:4,fontSize:11,cursor:"pointer"}}>100%</button>
        <span style={{fontSize:11,color:C.muted}}>Huidig: {zoom}%</span>
      </div>
    );
    return <div style={{height:36,background:C.surface,borderBottom:`1px solid ${C.border}`,flexShrink:0}} />;
  };

  // ── Upload screen ──────────────────────────────────────────────────────────
  if (!image) return (
    <>
      <style>{css}</style>
      <link rel="stylesheet" href={googleFonts} />
      <div style={{height:"100vh",display:"flex",flexDirection:"column",background:C.bg,color:C.text,fontFamily:"system-ui,-apple-system,sans-serif"}}>
        {/* PS-style menu bar (decorative on upload) */}
        <div style={{height:28,background:C.menubar,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",padding:"0 8px",flexShrink:0,gap:4}}>
          {["IMAGE-TOOLZ","Bestand","Bewerken","Afbeelding","Laag","Filter","Weergave"].map((m,i)=>(
            <span key={m} className="ps-menu-item" style={{fontWeight:i===0?"700":"400",fontSize:i===0?13:12,letterSpacing:i===0?"-0.4px":"0"}}>{m}</span>
          ))}
        </div>
        {/* Upload area */}
        <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",backgroundImage:"radial-gradient(rgba(255,255,255,0.04) 1px,transparent 1px)",backgroundSize:"28px 28px"}}>
          <div style={{animation:"fadeInUp 0.5s ease both",display:"flex",flexDirection:"column",alignItems:"center",gap:28}}>
            <div style={{textAlign:"center"}}>
              <h1 style={{fontSize:36,fontWeight:600,color:C.text,margin:"0 0 8px",letterSpacing:"-1px"}}>Image Editor</h1>
              <p style={{fontSize:14,color:C.muted,margin:0}}>Professionele beeldbewerking · Lagen · Aanpassingen · Effecten</p>
            </div>
            <div onDragOver={e=>{e.preventDefault();setDraggingUpload(true)}} onDragLeave={()=>setDraggingUpload(false)} onDrop={onDrop} onClick={()=>inputRef.current?.click()} style={{width:400,padding:"52px 44px",cursor:"pointer",borderRadius:10,border:draggingUpload?`1.5px dashed ${C.accent}`:`1.5px dashed ${C.borderHi}`,background:draggingUpload?C.accentDim:"rgba(255,255,255,0.015)",display:"flex",flexDirection:"column",alignItems:"center",gap:16,transition:"all 0.2s"}}>
              <div style={{width:60,height:60,borderRadius:12,background:draggingUpload?C.accentDim:C.panel2,display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.2s"}}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={draggingUpload?C.accent:C.muted} strokeWidth="1.8" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
              </div>
              <div style={{textAlign:"center"}}>
                <p style={{fontSize:15,color:C.text,margin:"0 0 6px",fontWeight:500}}>Sleep je afbeelding hierheen</p>
                <p style={{fontSize:12,color:C.muted,margin:0}}>PNG · JPG · WebP · GIF · BMP</p>
              </div>
              <span style={{fontSize:11,color:draggingUpload?C.accent:C.muted,padding:"5px 16px",borderRadius:20,border:`1px solid ${draggingUpload?C.accentBorder:C.border}`,transition:"all 0.2s"}}>of klik om te bladeren</span>
              <input ref={inputRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>e.target.files?.[0]&&addFile(e.target.files[0])} />
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center",maxWidth:440}}>
              {["Filters","Aanpassingen","Niveaus","Curven","Kleurbalans","Effecten","Lagen","Vormen","Tekst","Stickers","Kaders","Geschiedenis"].map((t,i)=>(
                <span key={t} style={{fontSize:11,color:C.muted,padding:"4px 10px",borderRadius:20,border:`1px solid ${C.border}`,animation:`fadeIn 0.4s ease ${0.1+i*0.04}s both`}}>{t}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );

  // ── Main editor ────────────────────────────────────────────────────────────
  return (
    <>
      <style>{css}</style>
      <link rel="stylesheet" href={googleFonts} />
      <input ref={inputRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>e.target.files?.[0]&&addFile(e.target.files[0])} />
      <input ref={stickerRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>e.target.files?.[0]&&addImageStickerLayer(e.target.files[0])} />

      {/* Modals */}
      {showBlock && (
        <div style={{position:"fixed",inset:0,zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.8)",animation:"fadeIn 0.2s ease"}} onClick={()=>setShowBlock(false)}>
          <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:10,padding:40,maxWidth:380,width:"90%",textAlign:"center",animation:"fadeInUp 0.25s ease"}} onClick={e=>e.stopPropagation()}>
            <h2 style={{fontSize:22,fontWeight:600,color:C.text,margin:"0 0 12px"}}>Download limiet bereikt</h2>
            <p style={{fontSize:13,color:C.muted,lineHeight:1.7,margin:"0 0 28px"}}>Log in voor onbeperkt downloaden — gratis.</p>
            <button onClick={()=>window.location.href="/login"} style={{width:"100%",padding:"11px",background:C.accent,color:"#111",border:"none",borderRadius:7,fontSize:12,fontWeight:700,letterSpacing:2,textTransform:"uppercase",cursor:"pointer",marginBottom:10}}>Inloggen</button>
            <button onClick={()=>setShowBlock(false)} style={{background:"none",border:"none",fontSize:12,color:C.muted,cursor:"pointer"}}>Sluiten</button>
          </div>
        </div>
      )}
      {showLimit && !user && remaining > 0 && (
        <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:50,background:C.panel,borderTop:`1px solid ${C.border}`,padding:"10px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",animation:"fadeInUp 0.3s ease"}}>
          <span style={{fontSize:12,color:C.muted}}>Nog <strong style={{color:C.text}}>{remaining} download{remaining!==1?"s":""}</strong> over.</span>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>window.location.href="/login"} style={{padding:"5px 14px",background:C.accent,color:"#111",border:"none",borderRadius:5,fontSize:11,fontWeight:700,cursor:"pointer"}}>Inloggen</button>
            <button onClick={()=>setShowLimit(false)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:16}}>✕</button>
          </div>
        </div>
      )}

      {/* Click outside to close menus */}
      {openMenu && <div style={{position:"fixed",inset:0,zIndex:99}} onClick={()=>setOpenMenu(null)} />}

      <div style={{height:"100vh",display:"flex",flexDirection:"column",background:C.bg,color:C.text,fontFamily:"system-ui,-apple-system,sans-serif",overflow:"hidden"}}>

        {/* ══ MENU BAR ══ */}
        <div style={{height:28,background:C.menubar,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",padding:"0 8px",flexShrink:0,zIndex:100}}>
          <span style={{fontSize:13,fontWeight:700,color:C.text,letterSpacing:"-0.4px",marginRight:8}}>IMAGE-TOOLZ</span>
          {Object.entries(menus).map(([name, items])=>(
            <div key={name} style={{position:"relative"}}>
              <span className={`ps-menu-item${openMenu===name?" active":""}`} onClick={e=>{e.stopPropagation();setOpenMenu(openMenu===name?null:name)}}>{name}</span>
              {openMenu===name && (
                <div className="dropdown-menu" style={{top:28,left:0}}>
                  {(items as any[]).map((item,i)=>
                    item.sep
                      ? <div key={i} className="dropdown-separator" />
                      : <div key={i} className={`dropdown-item${item.disabled?" disabled":""}`} onClick={()=>{item.action();setOpenMenu(null);}}>
                          <span>{item.label}</span>
                          {item.shortcut && <span style={{opacity:0.4,fontSize:10}}>{item.shortcut}</span>}
                        </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {/* Right side of menu bar */}
          <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>
            {!user && <span style={{fontSize:10,color:C.muted,letterSpacing:1}}>{remaining} downloads over</span>}
            <button onClick={download} style={{padding:"3px 14px",background:exporting?C.accentDim:C.accent,color:"#111",border:"none",borderRadius:4,fontSize:11,fontWeight:700,letterSpacing:1,cursor:"pointer",transition:"all 0.2s",display:"flex",alignItems:"center",gap:5}}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
              {exporting ? "Exporteren..." : "Exporteren"}
            </button>
          </div>
        </div>

        {/* ══ TOOL OPTIONS BAR ══ */}
        <ToolOptionsBar />

        {/* ══ MAIN AREA ══ */}
        <div style={{flex:1,display:"flex",overflow:"hidden"}}>

          {/* ── LEFT TOOLBAR ── */}
          <div style={{width:52,background:C.surface,borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column",alignItems:"center",padding:"6px 0",flexShrink:0,zIndex:5}}>
            {TOOLS_LEFT.map((tool,i) => (
              <div key={tool.id} style={{width:"100%",position:"relative"}}>
                {i>0 && TOOLS_LEFT[i-1].group!==tool.group && <div style={{height:1,background:C.border,margin:"4px 12px"}} />}
                <button className={`tool-btn${activeTool===tool.id?" active":""}`} onClick={()=>setActiveTool(tool.id)} onMouseEnter={()=>setTooltip(tool.id)} onMouseLeave={()=>setTooltip(null)}>
                  <span style={{fontSize:17,lineHeight:1}}>{tool.icon}</span>
                </button>
                {tooltip===tool.id && <div style={{position:"absolute",left:58,top:"50%",transform:"translateY(-50%)",background:"#111",border:`1px solid ${C.border}`,borderRadius:4,padding:"4px 8px",fontSize:11,color:C.text,whiteSpace:"nowrap",zIndex:200,pointerEvents:"none",animation:"fadeIn 0.1s"}}>{tool.label}</div>}
              </div>
            ))}

            {/* Divider + FG/BG color */}
            <div style={{height:1,background:C.border,margin:"8px 12px",width:"calc(100% - 24px)"}} />
            <div style={{position:"relative",width:36,height:32,margin:"4px auto"}}>
              <div style={{position:"absolute",bottom:0,right:0,width:20,height:20,borderRadius:3,background:bgColor,border:`1.5px solid ${C.borderHi}`,cursor:"pointer"}} onClick={()=>{}} />
              <div style={{position:"absolute",top:0,left:0,width:22,height:22,borderRadius:3,background:fgColor,border:`1.5px solid ${C.text}`,cursor:"pointer"}} onClick={()=>{}} />
            </div>
            <span style={{fontSize:8,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginTop:2}}>VG/AG</span>
          </div>

          {/* ── CANVAS + RULERS ── */}
          <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",position:"relative"}}>
            {/* Top ruler */}
            {showRulers && (
              <div style={{height:18,background:C.surface,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"flex-end",padding:"0 4px",flexShrink:0,overflowX:"hidden"}}>
                {Array.from({length:60}).map((_,i)=>(
                  <div key={i} style={{minWidth:20,display:"flex",flexDirection:"column",alignItems:"center"}}>
                    {i%5===0 && <span style={{fontSize:7,color:"rgba(255,255,255,0.2)",letterSpacing:0,marginBottom:2}}>{i*10}</span>}
                    <div style={{height:i%5===0?6:3,width:1,background:`rgba(255,255,255,${i%5===0?0.2:0.08})`}} />
                  </div>
                ))}
              </div>
            )}
            <div style={{flex:1,display:"flex",overflow:"hidden"}}>
              {/* Left ruler */}
              {showRulers && (
                <div style={{width:18,background:C.surface,borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column",alignItems:"flex-end",padding:"4px 0",flexShrink:0,overflowY:"hidden"}}>
                  {Array.from({length:40}).map((_,i)=>(
                    <div key={i} style={{minHeight:20,display:"flex",alignItems:"center",justifyContent:"flex-end"}}>
                      {i%5===0 && <span style={{fontSize:7,color:"rgba(255,255,255,0.2)",writingMode:"vertical-rl",transform:"rotate(180deg)",marginRight:2}}>{i*10}</span>}
                      <div style={{width:i%5===0?6:3,height:1,background:`rgba(255,255,255,${i%5===0?0.2:0.08})`}} />
                    </div>
                  ))}
                </div>
              )}

              {/* Canvas */}
              <div ref={canvasAreaRef} onClick={()=>{setSelectedSticker(null);setSelectedLayerId(null)}}
                style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",overflow:"auto",position:"relative",background:C.bg,backgroundImage:showGrid?"linear-gradient(rgba(255,255,255,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.04) 1px,transparent 1px)":"radial-gradient(rgba(255,255,255,0.06) 1px,transparent 1px)",backgroundSize:showGrid?"24px 24px":"28px 28px",cursor:activeTool==="zoom"?"zoom-in":activeTool==="hand"?"grab":activeTool==="brush"?"crosshair":activeTool==="eyedropper"?"crosshair":"default"}}>

                {/* Image + layers */}
                <div style={{position:"relative",display:"inline-block",transform:`scale(${zoom/100})`,transformOrigin:"center center",border:borderStyle==="none"?"none":borderStyle,boxShadow:getBoxShadow(),animation:imageLoaded?"fadeInUp 0.35s cubic-bezier(0.22,1,0.36,1)":"none",opacity:imageLoaded?1:0}}>
                  <img ref={imgElRef} src={image} alt="bewerkt"
                    style={{maxWidth:"calc(100vw - 420px)",maxHeight:"calc(100vh - 140px)",filter:getFilter(),display:"block",userSelect:"none"}}
                    onLoad={e=>{const el=e.target as HTMLImageElement;setCanvasSize({w:el.width,h:el.height})}} />

                  {/* Vignette overlay */}
                  {vignette>0 && <div style={{position:"absolute",inset:0,pointerEvents:"none",background:`radial-gradient(ellipse at center,transparent 40%,rgba(0,0,0,${vignette*0.008}) 100%)`}} />}

                  {/* Photo filter tint */}
                  {filterDensity>0 && <div style={{position:"absolute",inset:0,pointerEvents:"none",background:filterColor,opacity:filterDensity*0.006}} />}

                  {/* Glow */}
                  {glowStr>0 && <div style={{position:"absolute",inset:0,pointerEvents:"none",boxShadow:`inset 0 0 ${glowStr*3}px rgba(${glowR},${glowG},${glowB},${glowStr*0.02})`}} />}

                  {/* Crop overlay */}
                  {showCrop && (
                    <div style={{position:"absolute",inset:0,pointerEvents:"none"}}>
                      <div style={{position:"absolute",border:`2px solid ${C.accent}`,boxShadow:`0 0 0 9999px rgba(0,0,0,0.5)`,left:`${cropX}%`,top:`${cropY}%`,width:`${cropW}%`,height:`${cropH}%`}}>
                        <div style={{position:"absolute",inset:0,backgroundImage:"linear-gradient(rgba(255,255,255,0.07) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.07) 1px,transparent 1px)",backgroundSize:"33.33% 33.33%"}} />
                        {[["0%","0%"],["50%","0%"],["100%","0%"],["0%","50%"],["100%","50%"],["0%","100%"],["50%","100%"],["100%","100%"]].map(([l,t],i)=>(
                          <div key={i} style={{position:"absolute",width:9,height:9,background:C.accent,borderRadius:1,left:l,top:t,transform:"translate(-50%,-50%)"}} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Text layers */}
                  {layers.filter(l=>l.type==="text"&&l.visible).map(l=>(
                    <div key={l.id} onMouseDown={e=>startDrag(e,l.id,l.x||0,l.y||0)}
                      onClick={e=>{e.stopPropagation();setSelectedLayerId(l.id)}}
                      style={{position:"absolute",top:l.y,left:l.x,color:l.color,fontSize:l.fontSize,fontFamily:l.fontFamily,fontWeight:l.bold?"bold":"normal",fontStyle:l.italic?"italic":"normal",textShadow:"0 2px 10px rgba(0,0,0,0.8)",cursor:activeTool==="move"?"move":"default",userSelect:"none",whiteSpace:"nowrap",opacity:l.opacity/100,mixBlendMode:l.blendMode as any,outline:selectedLayerId===l.id?`1.5px solid ${C.accent}`:"none",outlineOffset:4}}>
                      {l.text}
                    </div>
                  ))}

                  {/* Shape layers */}
                  {layers.filter(l=>l.type==="shape"&&l.visible).map(l=>(
                    <div key={l.id} onClick={e=>{e.stopPropagation();setSelectedLayerId(l.id)}} onMouseDown={e=>startDrag(e,l.id,l.x||0,l.y||0)}
                      style={{position:"absolute",top:l.y,left:l.x,width:(l.x2||100)-(l.x||0),height:(l.y2||100)-(l.y||0),cursor:activeTool==="move"?"move":"default",opacity:l.opacity/100,outline:selectedLayerId===l.id?`1.5px dashed ${C.accent}`:"none",outlineOffset:2}}>
                      <svg width="100%" height="100%" style={{overflow:"visible"}}>
                        {l.shapeType==="rect"   && <rect x="0" y="0" width="100%" height="100%" fill={l.fillColor==="none"?"none":l.fillColor||"transparent"} stroke={l.strokeColor==="none"?"none":l.strokeColor||"transparent"} strokeWidth={l.strokeWidth||2} />}
                        {l.shapeType==="ellipse" && <ellipse cx="50%" cy="50%" rx="50%" ry="50%" fill={l.fillColor==="none"?"none":l.fillColor||"transparent"} stroke={l.strokeColor==="none"?"none":l.strokeColor||"transparent"} strokeWidth={l.strokeWidth||2} />}
                        {(l.shapeType==="line"||l.shapeType==="arrow") && <line x1="0" y1="0" x2="100%" y2="100%" stroke={l.fillColor||"#fff"} strokeWidth={l.strokeWidth||2} />}
                      </svg>
                    </div>
                  ))}
                </div>

                {/* Sticker layers (outside zoom wrapper so they stay absolute on canvas) */}
                {layers.filter(l=>l.type==="sticker"&&l.visible).map(l=>(
                  <div key={l.id} onClick={e=>{e.stopPropagation();setSelectedLayerId(l.id);setSelectedSticker(l.id)}}
                    onMouseDown={e=>startDrag(e,l.id,l.x||0,l.y||0)}
                    style={{position:"absolute",left:l.x,top:l.y,width:l.width,height:l.isImageSticker?l.height:l.width,cursor:activeTool==="move"?"move":"default",userSelect:"none",transform:`rotate(${l.rotation||0}deg)`,outline:selectedLayerId===l.id?`1.5px solid ${C.accent}`:"none",borderRadius:3,opacity:l.opacity/100}}>
                    {!l.isImageSticker
                      ? <span style={{fontSize:l.width,lineHeight:1,display:"block"}}>{l.emoji}</span>
                      : <img src={l.imageUrl} alt="" style={{width:l.width,height:l.height,display:"block",objectFit:"fill"}} draggable={false} />}
                    {selectedLayerId===l.id && (
                      <div onMouseDown={e=>startStickerResize(e,l)} style={{position:"absolute",bottom:-5,right:-5,width:12,height:12,background:C.accent,borderRadius:"50%",cursor:"se-resize",border:"2px solid #111"}} />
                    )}
                  </div>
                ))}

                {/* Canvas info */}
                <div style={{position:"absolute",bottom:12,left:12,display:"flex",gap:6}}>
                  <div style={{background:"rgba(0,0,0,0.6)",borderRadius:4,padding:"3px 8px",fontSize:10,color:C.muted,backdropFilter:"blur(6px)",border:`1px solid ${C.border}`}}>{zoom}%</div>
                  {imgNatural.w > 0 && <div style={{background:"rgba(0,0,0,0.6)",borderRadius:4,padding:"3px 8px",fontSize:10,color:C.muted,backdropFilter:"blur(6px)",border:`1px solid ${C.border}`}}>{imgNatural.w} × {imgNatural.h}px</div>}
                  <div style={{background:"rgba(0,0,0,0.6)",borderRadius:4,padding:"3px 8px",fontSize:10,color:C.muted,backdropFilter:"blur(6px)",border:`1px solid ${C.border}`}}>{layers.length} laag{layers.length!==1?"en":""}</div>
                </div>
              </div>
            </div>
          </div>

          {/* ── RIGHT PANEL ── */}
          <div style={{width:268,background:C.panel,borderLeft:`1px solid ${C.border}`,display:"flex",flexDirection:"column",flexShrink:0,overflow:"hidden"}}>
            {/* Tabs */}
            <div style={{display:"flex",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
              {([["adjust","Aanpassen"],["filters","Filters"],["layers","Lagen"],["history","Geschiedenis"]] as [RightTab,string][]).map(([id,label])=>(
                <button key={id} onClick={()=>setRightTab(id)} style={{flex:1,padding:"9px 4px",border:"none",cursor:"pointer",fontSize:10,letterSpacing:1,fontWeight:600,textTransform:"uppercase",transition:"all 0.1s",background:rightTab===id?C.panel2:"transparent",color:rightTab===id?C.accent:C.muted,borderBottom:rightTab===id?`2px solid ${C.accent}`:"2px solid transparent"}}>
                  {label}
                </button>
              ))}
            </div>

            {/* Panel content */}
            <div style={{flex:1,overflowY:"auto",animation:"slidePanel 0.15s ease"}}>
              {rightTab==="adjust"  && <AdjustPanel />}
              {rightTab==="filters" && <FiltersPanel />}
              {rightTab==="layers"  && <LayersPanel />}
              {rightTab==="history" && <HistoryPanel />}
            </div>

            {/* Tool-specific panel at bottom */}
            {(activeTool==="text"||activeTool==="sticker"||activeTool==="crop") && (
              <div style={{borderTop:`1px solid ${C.border}`,padding:"12px 14px",background:C.panel2,flexShrink:0}}>
                {activeTool==="text" && (
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    <textarea value={newText} onChange={e=>setNewText(e.target.value)} placeholder="Typ je tekst..." rows={2}
                      style={{background:C.panel3,color:C.text,border:`1px solid ${C.border}`,borderRadius:4,padding:"7px 10px",fontSize:12,outline:"none",width:"100%",boxSizing:"border-box",resize:"none",fontFamily:"inherit"}}
                      onFocus={e=>e.currentTarget.style.borderColor=C.accentBorder} onBlur={e=>e.currentTarget.style.borderColor=C.border}
                      onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&(e.preventDefault(),addTextLayer())} />
                    <button onClick={addTextLayer} disabled={!newText.trim()} style={{padding:"8px",background:newText.trim()?C.accent:C.panel3,color:newText.trim()?"#111":C.muted,border:"none",borderRadius:5,fontSize:11,fontWeight:700,letterSpacing:2,textTransform:"uppercase",cursor:newText.trim()?"pointer":"not-allowed"}}>Laag toevoegen</button>
                  </div>
                )}
                {activeTool==="sticker" && (
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    <button onClick={()=>stickerRef.current?.click()} style={{padding:"6px",background:C.panel3,border:`1px dashed ${C.borderHi}`,borderRadius:4,color:C.muted,fontSize:11,cursor:"pointer"}}>+ Eigen afbeelding</button>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,maxHeight:100,overflowY:"auto"}}>
                      {STICKERS.map((e,i)=>(
                        <button key={i} onClick={()=>addStickerLayer(e)} style={{fontSize:18,padding:"4px",borderRadius:3,border:"none",background:"transparent",cursor:"pointer",transition:"transform 0.1s"}}
                          onMouseEnter={ev=>(ev.currentTarget.style.transform="scale(1.2)")}
                          onMouseLeave={ev=>(ev.currentTarget.style.transform="scale(1)")}>{e}</button>
                      ))}
                    </div>
                  </div>
                )}
                {activeTool==="crop" && (
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    <Label ch="Bijsnijden" />
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4}}>
                      {[{l:"Vrij",v:"free"},{l:"1:1",v:"1:1"},{l:"4:3",v:"4:3"},{l:"16:9",v:"16:9"}].map(r=>(
                        <button key={r.v} onClick={()=>{setCropMode(r.v);setShowCrop(true)}} style={{padding:"5px",borderRadius:4,background:cropMode===r.v?C.accentDim:"transparent",border:cropMode===r.v?`1px solid ${C.accentBorder}`:`1px solid ${C.border}`,color:cropMode===r.v?C.accent:C.muted,fontSize:11,cursor:"pointer"}}>{r.l}</button>
                      ))}
                    </div>
                    <button onClick={()=>setShowCrop(!showCrop)} style={{padding:"6px",background:showCrop?C.accentDim:C.panel3,border:`1px solid ${showCrop?C.accentBorder:C.border}`,borderRadius:4,color:showCrop?C.accent:C.muted,fontSize:11,cursor:"pointer"}}>{showCrop?"✓ Overlay actief":"Toon overlay"}</button>
                  </div>
                )}
              </div>
            )}

            {/* Status bar */}
            <div style={{height:22,borderTop:`1px solid ${C.border}`,padding:"0 10px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
              <span style={{fontSize:9,color:"rgba(255,255,255,0.2)",letterSpacing:1}}>IMAGE-TOOLZ EDITOR</span>
              <span style={{fontSize:9,color:"rgba(255,255,255,0.2)",letterSpacing:1}}>{imgNatural.w>0?`${imgNatural.w}×${imgNatural.h}`:""}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}