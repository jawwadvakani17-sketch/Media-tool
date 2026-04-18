import { useState, useRef, useCallback } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────

const ASPECT_RATIOS = [
  { label: "9:16", icon: "▯", desc: "Vertical" },
  { label: "16:9", icon: "▭", desc: "Widescreen" },
  { label: "1:1",  icon: "□", desc: "Square"     },
];
const CAMERA_PRESETS = ["Pan", "Tilt", "Zoom", "Crane"];
const STYLE_MODIFIERS = {
  image: ["4K Ultra HD","Volumetric Lighting","Hyper-Realistic","Cinematic","Ray Tracing","Bokeh Depth"],
  video: ["Motion Blur","Slow Motion","Depth of Field","Film Grain","Lens Flare","Temporal Smoothing"],
};

// Gradient palettes for generated-asset thumbnails / previews
const PALETTES = [
  ["#7c3aed","#f472b6"], ["#0e7490","#38bdf8"], ["#be185d","#fb7185"],
  ["#047857","#34d399"], ["#c2410c","#fb923c"], ["#1d4ed8","#60a5fa"],
];

// Fake generated images: rich CSS-gradient "stills" used as stand-ins
const FAKE_IMAGES = [
  "linear-gradient(135deg,#0f172a 0%,#3b0764 40%,#701a75 70%,#f472b6 100%)",
  "linear-gradient(160deg,#0c1a2e 0%,#0e7490 50%,#22d3ee 100%)",
  "linear-gradient(120deg,#1a0533 0%,#6d28d9 45%,#c4b5fd 100%)",
  "linear-gradient(140deg,#042f2e 0%,#065f46 40%,#34d399 100%)",
  "linear-gradient(150deg,#1c0f04 0%,#92400e 50%,#fbbf24 100%)",
  "linear-gradient(130deg,#0f172a 0%,#1e40af 45%,#93c5fd 100%)",
];

// Initial seed gallery
const INITIAL_GALLERY = [
  { id:1, type:"image", label:"Neon Samurai",   ratio:"1:1",  palIdx:0, savedAt: Date.now()-9e5 },
  { id:2, type:"video", label:"Ocean Storm",    ratio:"16:9", palIdx:1, savedAt: Date.now()-6e5 },
  { id:3, type:"image", label:"Crystal Cave",   ratio:"9:16", palIdx:2, savedAt: Date.now()-3e5 },
  { id:4, type:"video", label:"City Timelapse", ratio:"16:9", palIdx:3, savedAt: Date.now()-1e5 },
];

// ─── Tiny helpers ─────────────────────────────────────────────────────────────

const ratioPad = r => r==="9:16" ? "177.7%" : r==="1:1" ? "100%" : "56.25%";
const ratioRes  = r => r==="9:16" ? "1080×1920" : r==="1:1" ? "1024×1024" : "1920×1080";

// ─── Sub-components ───────────────────────────────────────────────────────────

function Glass({ children, style={}, onClick }) {
  return (
    <div onClick={onClick} style={{
      background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.09)",
      borderRadius:16, backdropFilter:"blur(14px)", ...style,
    }}>{children}</div>
  );
}

function ProgressBar({ v }) {
  return (
    <div style={{ width:"100%", background:"rgba(255,255,255,0.07)", borderRadius:999, height:4, overflow:"hidden" }}>
      <div style={{ height:"100%", width:`${v}%`, borderRadius:999, transition:"width .35s ease",
        background:"linear-gradient(90deg,#a78bfa,#f472b6,#38bdf8)",
        boxShadow:"0 0 10px #a78bfa77" }} />
    </div>
  );
}

function RangeSlider({ label, value, onChange, min=1, max=10 }) {
  const pct = ((value-min)/(max-min))*100;
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
      <div style={{ display:"flex", justifyContent:"space-between" }}>
        <span style={{ color:"#94a3b8", fontSize:11, fontFamily:"'DM Mono',monospace", letterSpacing:1, textTransform:"uppercase" }}>{label}</span>
        <span style={{ color:"#f472b6", fontSize:12, fontFamily:"'DM Mono',monospace", fontWeight:700 }}>{value}</span>
      </div>
      <div style={{ position:"relative", height:20, display:"flex", alignItems:"center" }}>
        <div style={{ position:"absolute", width:"100%", height:3, borderRadius:99, background:"rgba(255,255,255,0.08)" }} />
        <div style={{ position:"absolute", width:`${pct}%`, height:3, borderRadius:99, background:"linear-gradient(90deg,#a78bfa,#f472b6)" }} />
        <input type="range" min={min} max={max} value={value} onChange={e=>onChange(+e.target.value)}
          style={{ position:"absolute", width:"100%", opacity:0, cursor:"pointer", height:20, zIndex:2 }} />
        <div style={{ position:"absolute", left:`calc(${pct}% - 8px)`, width:16, height:16, borderRadius:"50%",
          background:"linear-gradient(135deg,#a78bfa,#f472b6)", boxShadow:"0 0 10px #a78bfa88",
          zIndex:1, transition:"left .1s", pointerEvents:"none" }} />
      </div>
    </div>
  );
}

// ─── Media Viewer Modal ───────────────────────────────────────────────────────

function MediaViewer({ item, onClose, onSave, isSaved }) {
  const isVideo = item.type === "video";
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [vol, setVol] = useState(0.8);
  const [videoTime, setVideoTime] = useState(0);

  const fakeGrad = FAKE_IMAGES[item.palIdx % FAKE_IMAGES.length];

  const togglePlay = () => setPlaying(p => !p);

  return (
    <div onClick={onClose} style={{
      position:"fixed", inset:0, zIndex:1200,
      background:"rgba(0,0,0,0.88)", backdropFilter:"blur(18px)",
      display:"flex", alignItems:"center", justifyContent:"center", padding:20,
    }}>
      <div onClick={e=>e.stopPropagation()} style={{
        width:"100%", maxWidth: item.ratio==="9:16" ? 420 : item.ratio==="1:1" ? 600 : 860,
        display:"flex", flexDirection:"column", gap:0,
        border:"1px solid rgba(255,255,255,0.1)", borderRadius:20,
        overflow:"hidden", boxShadow:"0 40px 120px rgba(0,0,0,0.8)",
      }}>

        {/* Top bar */}
        <div style={{ background:"rgba(10,10,20,0.95)", borderBottom:"1px solid rgba(255,255,255,0.07)",
          padding:"12px 18px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:18 }}>{isVideo ? "🎬" : "🖼"}</span>
            <div>
              <div style={{ color:"#f1f5f9", fontSize:13, fontWeight:600 }}>{item.label}</div>
              <div style={{ color:"#475569", fontSize:10, fontFamily:"'DM Mono',monospace", marginTop:1 }}>
                {item.type.toUpperCase()} · {item.ratio} · {ratioRes(item.ratio)}
              </div>
            </div>
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            {/* Save to gallery */}
            <button onClick={onSave} style={{
              padding:"6px 14px", borderRadius:8, border:"none", cursor:"pointer", fontSize:11,
              fontWeight:600, fontFamily:"'DM Mono',monospace", letterSpacing:0.5, transition:"all .2s",
              background: isSaved ? "rgba(16,185,129,0.2)" : "rgba(167,139,250,0.15)",
              color: isSaved ? "#10b981" : "#a78bfa",
              boxShadow: isSaved ? "inset 0 0 0 1px rgba(16,185,129,0.4)" : "inset 0 0 0 1px rgba(167,139,250,0.3)",
            }}>
              {isSaved ? "✓ Saved" : "＋ Save to Gallery"}
            </button>
            {/* Download */}
            <button onClick={() => {
              const link = document.createElement("a");
              // Create a canvas to capture the gradient as a PNG stand-in
              const canvas = document.createElement("canvas");
              canvas.width = 400; canvas.height = 400;
              const ctx = canvas.getContext("2d");
              const g = ctx.createLinearGradient(0,0,400,400);
              const [c1,c2] = PALETTES[item.palIdx % PALETTES.length];
              g.addColorStop(0, c1); g.addColorStop(1, c2);
              ctx.fillStyle = g; ctx.fillRect(0,0,400,400);
              ctx.fillStyle = "rgba(255,255,255,0.12)";
              ctx.font = "bold 24px sans-serif"; ctx.textAlign="center";
              ctx.fillText(item.label, 200, 200);
              link.href = canvas.toDataURL("image/png");
              link.download = `${item.label.replace(/\s+/g,"-")}.${isVideo?"mp4":"png"}`;
              link.click();
            }} style={{
              padding:"6px 14px", borderRadius:8, border:"1px solid rgba(56,189,248,0.3)",
              background:"rgba(56,189,248,0.1)", color:"#38bdf8",
              fontSize:11, cursor:"pointer", fontFamily:"'DM Mono',monospace", fontWeight:600,
            }}>↓ Download</button>
            <button onClick={onClose} style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)",
              color:"#94a3b8", width:30, height:30, borderRadius:8, cursor:"pointer", fontSize:15,
              display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
          </div>
        </div>

        {/* Media body */}
        <div style={{ position:"relative", background:"#080810", aspectRatio: item.ratio==="9:16" ? "9/16" : item.ratio==="1:1" ? "1/1" : "16/9" }}>
          {/* Visual stand-in — full gradient fills the frame */}
          <div style={{ position:"absolute", inset:0, background: fakeGrad }} />

          {/* Noise grain overlay */}
          <div style={{ position:"absolute", inset:0, opacity:0.04,
            backgroundImage:"url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }} />

          {/* Grid lines artistic overlay */}
          <div style={{ position:"absolute", inset:0, opacity:0.06,
            backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 40px,rgba(255,255,255,1) 40px,rgba(255,255,255,1) 41px),repeating-linear-gradient(90deg,transparent,transparent 40px,rgba(255,255,255,1) 40px,rgba(255,255,255,1) 41px)" }} />

          {/* Center label */}
          <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column",
            alignItems:"center", justifyContent:"center", gap:10 }}>
            <div style={{ fontSize: item.ratio==="9:16" ? 48 : 56, opacity:0.18 }}>{isVideo?"🎬":"🖼"}</div>
            <div style={{ color:"rgba(255,255,255,0.5)", fontSize:14, fontWeight:600, textAlign:"center", maxWidth:"70%" }}>{item.label}</div>
            <div style={{ color:"rgba(255,255,255,0.2)", fontSize:10, fontFamily:"'DM Mono',monospace", letterSpacing:2 }}>
              {isVideo ? "SIMULATED PREVIEW" : "GENERATED IMAGE"}
            </div>
          </div>

          {/* Video controls overlay */}
          {isVideo && (
            <div style={{ position:"absolute", bottom:0, left:0, right:0,
              background:"linear-gradient(transparent,rgba(0,0,0,0.85))", padding:"30px 18px 14px" }}>
              {/* Scrubber */}
              <div style={{ marginBottom:10 }}>
                <div style={{ width:"100%", background:"rgba(255,255,255,0.15)", borderRadius:99, height:3, position:"relative", cursor:"pointer" }}
                  onClick={e => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setVideoTime(Math.round(((e.clientX - rect.left) / rect.width) * 100));
                  }}>
                  <div style={{ height:"100%", width:`${videoTime}%`, background:"linear-gradient(90deg,#a78bfa,#f472b6)", borderRadius:99 }} />
                  <div style={{ position:"absolute", top:"50%", left:`${videoTime}%`, transform:"translate(-50%,-50%)",
                    width:11, height:11, borderRadius:"50%", background:"#fff", boxShadow:"0 0 8px rgba(167,139,250,0.8)" }} />
                </div>
              </div>
              {/* Transport */}
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <button onClick={()=>setVideoTime(0)} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.6)", cursor:"pointer", fontSize:14, padding:0 }}>⏮</button>
                <button onClick={togglePlay} style={{
                  width:36, height:36, borderRadius:"50%", border:"none", cursor:"pointer",
                  background:"linear-gradient(135deg,#a78bfa,#f472b6)", color:"#fff",
                  display:"flex", alignItems:"center", justifyContent:"center", fontSize:14,
                }}>
                  {playing ? "⏸" : "▶"}
                </button>
                <button style={{ background:"none", border:"none", color:"rgba(255,255,255,0.6)", cursor:"pointer", fontSize:14, padding:0 }}>⏭</button>
                <span style={{ color:"rgba(255,255,255,0.4)", fontSize:10, fontFamily:"'DM Mono',monospace", marginLeft:4 }}>
                  {String(Math.floor(videoTime*0.24/60)).padStart(2,"0")}:{String(Math.floor(videoTime*0.24%60)).padStart(2,"0")} / 00:24
                </span>
                <div style={{ display:"flex", alignItems:"center", gap:6, marginLeft:"auto" }}>
                  <span style={{ fontSize:12, opacity:0.5 }}>🔊</span>
                  <input type="range" min={0} max={1} step={0.01} value={vol}
                    onChange={e=>setVol(+e.target.value)}
                    style={{ width:60, opacity:0.7, cursor:"pointer" }} />
                </div>
                <button style={{ background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.15)",
                  color:"rgba(255,255,255,0.6)", borderRadius:5, padding:"3px 8px",
                  fontSize:9, cursor:"pointer", fontFamily:"'DM Mono',monospace", letterSpacing:1 }}>HD</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Payload Modal ─────────────────────────────────────────────────────────────

function PayloadModal({ payload, onClose }) {
  return (
    <div onClick={onClose} style={{
      position:"fixed", inset:0, zIndex:1100,
      background:"rgba(0,0,0,0.75)", backdropFilter:"blur(8px)",
      display:"flex", alignItems:"center", justifyContent:"center", padding:24,
    }}>
      <Glass onClick={e=>e.stopPropagation()}
        style={{ maxWidth:640, width:"100%", padding:26, maxHeight:"80vh", overflow:"auto" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <span style={{ color:"#a78bfa", fontFamily:"'DM Mono',monospace", fontSize:10, letterSpacing:2, textTransform:"uppercase" }}>⬡ API Payload</span>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"#64748b", fontSize:18, cursor:"pointer" }}>✕</button>
        </div>
        <pre style={{ fontFamily:"'DM Mono',monospace", fontSize:11, lineHeight:1.8,
          color:"#e2e8f0", whiteSpace:"pre-wrap", wordBreak:"break-word",
          background:"rgba(0,0,0,0.35)", borderRadius:10, padding:16,
          border:"1px solid rgba(255,255,255,0.06)", margin:0 }}>
          {JSON.stringify(payload,null,2)}
        </pre>
      </Glass>
    </div>
  );
}

// ─── Reference Image Upload Panel ─────────────────────────────────────────────

function RefImagePanel({ refs, onAdd, onRemove }) {
  const fileRef = useRef(null);
  const dropRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const readFile = file => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = e => onAdd({ id: Date.now(), name: file.name, src: e.target.result });
    reader.readAsDataURL(file);
  };

  const handleDrop = e => {
    e.preventDefault(); setDragging(false);
    Array.from(e.dataTransfer.files).forEach(readFile);
  };

  return (
    <Glass style={{ padding:14 }}>
      <label style={{ color:"#64748b", fontSize:10, letterSpacing:1.5, textTransform:"uppercase",
        fontFamily:"'DM Mono',monospace", display:"block", marginBottom:10 }}>
        Image References <span style={{ color:"#334155" }}>({refs.length}/4)</span>
      </label>

      {/* Drop zone */}
      <div ref={dropRef}
        onDragOver={e=>{e.preventDefault();setDragging(true);}}
        onDragLeave={()=>setDragging(false)}
        onDrop={handleDrop}
        onClick={()=>fileRef.current?.click()}
        style={{
          border:`1.5px dashed ${dragging ? "rgba(167,139,250,0.6)" : "rgba(255,255,255,0.1)"}`,
          borderRadius:10, padding:"14px 10px", cursor:"pointer", textAlign:"center",
          background: dragging ? "rgba(167,139,250,0.07)" : "rgba(255,255,255,0.02)",
          transition:"all .2s", marginBottom: refs.length ? 10 : 0,
        }}>
        <div style={{ fontSize:20, opacity:0.3, marginBottom:4 }}>⊕</div>
        <div style={{ color:"#475569", fontSize:11, lineHeight:1.5 }}>
          Drop images or <span style={{ color:"#a78bfa" }}>click to upload</span>
        </div>
        <div style={{ color:"#334155", fontSize:10, marginTop:3, fontFamily:"'DM Mono',monospace" }}>
          PNG · JPG · WEBP
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple style={{ display:"none" }}
        onChange={e=>Array.from(e.target.files).forEach(readFile)} />

      {/* Thumbnails */}
      {refs.length > 0 && (
        <div style={{ display:"flex", gap:7, flexWrap:"wrap", marginTop:4 }}>
          {refs.map(r => (
            <div key={r.id} style={{ position:"relative", width:58, height:58, borderRadius:9, overflow:"hidden",
              border:"1px solid rgba(255,255,255,0.1)", flexShrink:0 }}>
              <img src={r.src} alt={r.name} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
              {/* Overlay label */}
              <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0)", transition:"background .2s",
                display:"flex", alignItems:"flex-end" }}
                onMouseEnter={e=>e.currentTarget.style.background="rgba(0,0,0,0.55)"}
                onMouseLeave={e=>e.currentTarget.style.background="rgba(0,0,0,0)"}>
                <button onClick={()=>onRemove(r.id)} style={{
                  position:"absolute", top:3, right:3, width:16, height:16,
                  borderRadius:"50%", background:"rgba(239,68,68,0.85)", border:"none",
                  color:"#fff", fontSize:9, cursor:"pointer", display:"flex",
                  alignItems:"center", justifyContent:"center", lineHeight:1,
                }}>✕</button>
              </div>
              {/* "REF" badge */}
              <div style={{ position:"absolute", bottom:2, left:2,
                background:"rgba(167,139,250,0.8)", borderRadius:3, padding:"1px 4px",
                fontSize:7, color:"#fff", fontFamily:"'DM Mono',monospace", fontWeight:700 }}>REF</div>
            </div>
          ))}
          {/* Add more slot */}
          {refs.length < 4 && (
            <div onClick={()=>fileRef.current?.click()} style={{
              width:58, height:58, borderRadius:9, border:"1.5px dashed rgba(255,255,255,0.1)",
              display:"flex", alignItems:"center", justifyContent:"center",
              cursor:"pointer", color:"#334155", fontSize:20, flexShrink:0,
              background:"rgba(255,255,255,0.02)", transition:"all .2s",
            }}
              onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(167,139,250,0.4)";e.currentTarget.style.color="#a78bfa";}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,0.1)";e.currentTarget.style.color="#334155";}}>
              ＋
            </div>
          )}
        </div>
      )}
    </Glass>
  );
}

// ─── Gallery Strip ─────────────────────────────────────────────────────────────

function GalleryStrip({ gallery, savedIds, onView, onSave }) {
  return (
    <div style={{ borderTop:"1px solid rgba(255,255,255,0.05)", padding:"16px 22px 20px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:11 }}>
        <span style={{ color:"#475569", fontSize:10, letterSpacing:1.5, fontFamily:"'DM Mono',monospace", textTransform:"uppercase" }}>
          Gallery
        </span>
        <span style={{ color:"#334155", fontSize:10, fontFamily:"'DM Mono',monospace" }}>{gallery.length} assets · {savedIds.size} saved</span>
      </div>
      <div style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:3 }}>
        {gallery.map(item => {
          const [c1,c2] = PALETTES[item.palIdx % PALETTES.length];
          const isSaved = savedIds.has(item.id);
          return (
            <div key={item.id} style={{ position:"relative", flexShrink:0,
              width: item.ratio==="9:16" ? 44 : item.ratio==="1:1" ? 66 : 102,
              height:66, borderRadius:9, overflow:"hidden", cursor:"pointer",
              background:`linear-gradient(135deg,${c1}66,#0f172a)`,
              border:`${isSaved ? "1.5px solid rgba(167,139,250,0.55)" : "1px solid rgba(255,255,255,0.07)"}`,
              boxShadow: item.isNew ? `0 0 14px ${c1}55` : "none",
              transition:"transform .15s, box-shadow .15s",
            }}
              onClick={()=>onView(item)}
              onMouseEnter={e=>{e.currentTarget.style.transform="scale(1.04)";}}
              onMouseLeave={e=>{e.currentTarget.style.transform="scale(1)";}}
            >
              {/* Gradient fill */}
              <div style={{ position:"absolute", inset:0, background:`linear-gradient(135deg,${c1}44,${c2}22)` }} />

              {/* Bottom info */}
              <div style={{ position:"absolute", bottom:0, left:0, right:0,
                padding:"12px 5px 4px", background:"linear-gradient(transparent,rgba(0,0,0,0.75))" }}>
                <div style={{ color:"#e2e8f0", fontSize:7.5, fontWeight:600, overflow:"hidden",
                  whiteSpace:"nowrap", textOverflow:"ellipsis" }}>{item.label}</div>
                <div style={{ color:"#64748b", fontSize:7, fontFamily:"'DM Mono',monospace", marginTop:1 }}>
                  {item.type.toUpperCase()} · {item.ratio}
                </div>
              </div>

              {/* New dot */}
              {item.isNew && <div style={{ position:"absolute", top:4, right:4, width:5, height:5,
                borderRadius:"50%", background:"#a78bfa", boxShadow:"0 0 6px #a78bfa" }} />}

              {/* Saved star */}
              {isSaved && <div style={{ position:"absolute", top:3, left:3, fontSize:8, lineHeight:1 }}>★</div>}

              {/* Hover overlay with quick actions */}
              <div className="gallery-hover" style={{ position:"absolute", inset:0,
                background:"rgba(0,0,0,0)", display:"flex", flexDirection:"column",
                alignItems:"center", justifyContent:"center", gap:4, opacity:0, transition:"opacity .15s" }}
                onMouseEnter={e=>{e.currentTarget.style.opacity=1;e.currentTarget.style.background="rgba(0,0,0,0.55)";}}
                onMouseLeave={e=>{e.currentTarget.style.opacity=0;e.currentTarget.style.background="rgba(0,0,0,0)";}}>
                <div style={{ color:"#fff", fontSize:10, fontWeight:700 }}>View</div>
                <button onClick={ev=>{ev.stopPropagation();onSave(item.id);}} style={{
                  padding:"2px 7px", borderRadius:5, border:"none",
                  background: isSaved ? "rgba(16,185,129,0.8)" : "rgba(167,139,250,0.8)",
                  color:"#fff", fontSize:9, cursor:"pointer", fontWeight:600,
                }}>
                  {isSaved ? "✓ Saved" : "＋ Save"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [mode,        setMode]        = useState("image");
  const [prompt,      setPrompt]      = useState("");
  const [charRef,     setCharRef]     = useState("");
  const [ratio,       setRatio]       = useState("16:9");
  const [motionStr,   setMotionStr]   = useState(5);
  const [camera,      setCamera]      = useState("Pan");
  const [activeMods,  setActiveMods]  = useState([]);
  const [status,      setStatus]      = useState("idle"); // idle|enhancing|generating|done
  const [progress,    setProgress]    = useState(0);
  const [enhPrompt,   setEnhPrompt]   = useState("");
  const [payload,     setPayload]     = useState(null);
  const [showPayload, setShowPayload] = useState(false);
  const [gallery,     setGallery]     = useState(INITIAL_GALLERY);
  const [savedIds,    setSavedIds]    = useState(new Set());
  const [viewItem,    setViewItem]    = useState(null);   // item being viewed in media viewer
  const [latestItem,  setLatestItem]  = useState(null);   // most-recently generated item
  const [refImages,   setRefImages]   = useState([]);     // uploaded reference images
  const [genPalIdx,   setGenPalIdx]   = useState(0);

  const toggleMod = mod => setActiveMods(p => p.includes(mod) ? p.filter(m=>m!==mod) : [...p,mod]);

  const handleSave = useCallback(id => {
    setSavedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const addRef  = img => setRefImages(p => p.length < 4 ? [...p, img] : p);
  const remRef  = id  => setRefImages(p => p.filter(r => r.id !== id));

  const reset = () => {
    setStatus("idle"); setProgress(0); setEnhPrompt(""); setPrompt(""); setLatestItem(null);
  };

  const generate = async () => {
    if (!prompt.trim()) return;
    setStatus("enhancing"); setProgress(0); setEnhPrompt("");

    await new Promise(r=>setTimeout(r,350));

    const mods = activeMods.length ? activeMods : STYLE_MODIFIERS[mode].slice(0,3);
    const suffix = mode==="video"
      ? `, ${camera.toLowerCase()} shot, motion strength ${motionStr}/10, ${mods.join(", ")}, temporal consistency, 24fps cinematic`
      : `, ${mods.join(", ")}, studio composition, golden hour, award-winning photography`;
    const cSuffix = charRef ? `, consistent character: ${charRef}` : "";
    const refSuffix = refImages.length ? `, reference images applied (${refImages.length} uploaded)` : "";
    const enh = `Photorealistic ${prompt.trim()}, ${ratio} aspect ratio${suffix}${cSuffix}${refSuffix}, ultra-detailed, masterpiece quality`;
    setEnhPrompt(enh);

    const palIdx = Math.floor(Math.random() * PALETTES.length);
    setGenPalIdx(palIdx);

    const p = {
      model: mode==="image" ? "stable-diffusion-xl-1024" : "video-diffusion-v3",
      prompt: enh,
      negative_prompt: "blurry, low quality, artifacts, watermark, text, deformed",
      parameters: {
        aspect_ratio: ratio, num_inference_steps:40, guidance_scale:7.5,
        seed: Math.floor(Math.random()*999999),
        ...(mode==="video" && { motion_strength:motionStr, camera_movement:camera.toLowerCase(), num_frames:72, fps:24 }),
        ...(charRef && { character_reference: charRef }),
        ...(refImages.length && { reference_images: refImages.map(r=>r.name) }),
      },
      output:{ format: mode==="image"?"png":"mp4", quality:"ultra", resolution: ratioRes(ratio) },
    };
    setPayload(p);

    setStatus("generating");
    const logs = [
      "▸ Initializing inference pipeline...",
      "▸ Loading checkpoint weights...",
      refImages.length ? `▸ Encoding ${refImages.length} reference image(s)...` : "▸ Encoding text embeddings...",
      `▸ Running ${mode==="video"?"temporal":"spatial"} diffusion (40 steps)...`,
      "▸ Decoding latent space...",
      `▸ Upscaling to ${ratioRes(ratio)}...`,
      "▸ Post-processing & sharpening...",
      "✓ Generation complete.",
    ];
    const logState = [];
    for (let i=0;i<logs.length;i++) {
      await new Promise(r=>setTimeout(r,360+Math.random()*220));
      logState.push(logs[i]);
      setProgress(Math.round(((i+1)/logs.length)*100));
      // we store logs inside latestItem via a running state trick
      setLatestItem(prev => prev ? {...prev, logs:[...logState]} : { logs:[...logState] });
    }

    const newItem = {
      id: Date.now(), type:mode,
      label: prompt.slice(0,24)+(prompt.length>24?"…":""),
      ratio, palIdx, isNew:true,
      savedAt: Date.now(), logs,
      enhPrompt: enh,
    };
    setLatestItem(newItem);
    setGallery(prev=>[newItem,...prev]);
    setStatus("done");
  };

  // ── render ──

  const currentLogs = latestItem?.logs ?? [];

  return (
    <div style={{ minHeight:"100vh", background:"#05070f", color:"#e2e8f0",
      fontFamily:"'Inter','SF Pro Display',sans-serif", display:"flex", flexDirection:"column" }}>

      {/* Ambient glow */}
      <div style={{ position:"fixed", inset:0, zIndex:0, pointerEvents:"none",
        background:"radial-gradient(ellipse 60% 40% at 20% 10%,rgba(124,58,237,.12) 0%,transparent 60%),radial-gradient(ellipse 50% 40% at 80% 80%,rgba(244,114,182,.08) 0%,transparent 60%)" }} />

      <div style={{ position:"relative", zIndex:1, display:"flex", flexDirection:"column", minHeight:"100vh" }}>

        {/* ── Header ── */}
        <header style={{ padding:"16px 26px", display:"flex", alignItems:"center",
          justifyContent:"space-between", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:30,height:30,borderRadius:8,background:"linear-gradient(135deg,#a78bfa,#f472b6)",
              display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:900 }}>⬡</div>
            <span style={{ fontSize:16,fontWeight:700,letterSpacing:-0.5,color:"#f1f5f9" }}>HIGGSFIELD</span>
            <span style={{ fontSize:9,fontFamily:"'DM Mono',monospace",letterSpacing:2,color:"#a78bfa",
              background:"rgba(167,139,250,0.1)",border:"1px solid rgba(167,139,250,0.2)",
              borderRadius:4,padding:"2px 6px",textTransform:"uppercase" }}>Studio v2</span>
          </div>
          <div style={{ display:"flex", gap:6 }}>
            {["Dashboard","Models","Library","API"].map(n=>(
              <button key={n} style={{ background:"none",border:"none",color:"#64748b",
                fontSize:12,cursor:"pointer",padding:"5px 10px",borderRadius:7 }}>{n}</button>
            ))}
          </div>
        </header>

        {/* ── Main grid ── */}
        <main style={{ flex:1, display:"grid", gridTemplateColumns:"320px 1fr", overflow:"hidden" }}>

          {/* ── LEFT PANEL ── */}
          <div style={{ borderRight:"1px solid rgba(255,255,255,0.05)", overflowY:"auto",
            padding:"18px 14px", display:"flex", flexDirection:"column", gap:14 }}>

            {/* Mode toggle */}
            <Glass style={{ padding:4, display:"flex", gap:2 }}>
              {["image","video"].map(m=>(
                <button key={m} onClick={()=>{setMode(m);reset();}} style={{
                  flex:1, padding:"8px 0", borderRadius:12, border:"none", cursor:"pointer",
                  fontSize:12, fontWeight:600, letterSpacing:0.5, textTransform:"uppercase", transition:"all .25s",
                  background: mode===m ? "linear-gradient(135deg,rgba(167,139,250,0.3),rgba(244,114,182,0.2))" : "transparent",
                  color: mode===m ? "#f1f5f9" : "#475569",
                  boxShadow: mode===m ? "inset 0 0 0 1px rgba(167,139,250,0.3)" : "none",
                }}>
                  {m==="image" ? "⬛ Image Gen" : "▶ Video Gen"}
                </button>
              ))}
            </Glass>

            {/* Prompt */}
            <Glass style={{ padding:13 }}>
              <label style={{ color:"#64748b",fontSize:10,letterSpacing:1.5,textTransform:"uppercase",
                fontFamily:"'DM Mono',monospace",display:"block",marginBottom:8 }}>Concept</label>
              <textarea value={prompt} onChange={e=>setPrompt(e.target.value)}
                placeholder={mode==="image" ? "A warrior on a cliff at sunset..." : "A drone flies over a futuristic city..."}
                style={{ width:"100%",minHeight:76,resize:"none",
                  background:"rgba(0,0,0,0.25)",border:"1px solid rgba(255,255,255,0.07)",
                  borderRadius:10,color:"#e2e8f0",fontSize:13,lineHeight:1.6,
                  padding:"9px 11px",boxSizing:"border-box",outline:"none",fontFamily:"inherit" }}
                onFocus={e=>e.target.style.borderColor="rgba(167,139,250,0.4)"}
                onBlur={e=>e.target.style.borderColor="rgba(255,255,255,0.07)"}
              />
              {enhPrompt && (
                <div style={{ marginTop:9,padding:9,background:"rgba(167,139,250,0.07)",
                  borderRadius:8,border:"1px solid rgba(167,139,250,0.15)" }}>
                  <div style={{ color:"#a78bfa",fontSize:9,letterSpacing:2,fontFamily:"'DM Mono',monospace",marginBottom:4,textTransform:"uppercase" }}>✦ Enhanced</div>
                  <div style={{ color:"#cbd5e1",fontSize:11,lineHeight:1.7 }}>{enhPrompt}</div>
                </div>
              )}
            </Glass>

            {/* Character reference */}
            <Glass style={{ padding:13 }}>
              <label style={{ color:"#64748b",fontSize:10,letterSpacing:1.5,textTransform:"uppercase",
                fontFamily:"'DM Mono',monospace",display:"block",marginBottom:8 }}>Character Reference</label>
              <input value={charRef} onChange={e=>setCharRef(e.target.value)}
                placeholder="e.g. tall, dark hair, red jacket..."
                style={{ width:"100%",background:"rgba(0,0,0,0.25)",border:"1px solid rgba(255,255,255,0.07)",
                  borderRadius:10,color:"#e2e8f0",fontSize:12,padding:"8px 11px",
                  boxSizing:"border-box",outline:"none",fontFamily:"inherit" }}
                onFocus={e=>e.target.style.borderColor="rgba(167,139,250,0.4)"}
                onBlur={e=>e.target.style.borderColor="rgba(255,255,255,0.07)"}
              />
            </Glass>

            {/* ← NEW: Image Reference Upload */}
            <RefImagePanel refs={refImages} onAdd={addRef} onRemove={remRef} />

            {/* Aspect ratio */}
            <Glass style={{ padding:13 }}>
              <label style={{ color:"#64748b",fontSize:10,letterSpacing:1.5,textTransform:"uppercase",
                fontFamily:"'DM Mono',monospace",display:"block",marginBottom:10 }}>Aspect Ratio</label>
              <div style={{ display:"flex",gap:7 }}>
                {ASPECT_RATIOS.map(ar=>(
                  <button key={ar.label} onClick={()=>setRatio(ar.label)} style={{
                    flex:1,padding:"8px 0",borderRadius:10,border:"none",cursor:"pointer",
                    background: ratio===ar.label ? "rgba(167,139,250,0.15)" : "rgba(255,255,255,0.04)",
                    boxShadow: ratio===ar.label ? "inset 0 0 0 1px rgba(167,139,250,0.4)" : "inset 0 0 0 1px rgba(255,255,255,0.07)",
                    color: ratio===ar.label ? "#a78bfa" : "#64748b",
                    display:"flex",flexDirection:"column",alignItems:"center",gap:3,transition:"all .2s",
                  }}>
                    <span style={{ fontSize:16 }}>{ar.icon}</span>
                    <span style={{ fontSize:10,fontFamily:"'DM Mono',monospace",fontWeight:600 }}>{ar.label}</span>
                    <span style={{ fontSize:8,opacity:.6 }}>{ar.desc}</span>
                  </button>
                ))}
              </div>
            </Glass>

            {/* Style modifiers */}
            <Glass style={{ padding:13 }}>
              <label style={{ color:"#64748b",fontSize:10,letterSpacing:1.5,textTransform:"uppercase",
                fontFamily:"'DM Mono',monospace",display:"block",marginBottom:10 }}>Style Modifiers</label>
              <div style={{ display:"flex",flexWrap:"wrap",gap:6 }}>
                {STYLE_MODIFIERS[mode].map(mod=>(
                  <button key={mod} onClick={()=>toggleMod(mod)} style={{
                    padding:"5px 10px",borderRadius:999,border:"none",cursor:"pointer",fontSize:11,fontWeight:500,
                    background: activeMods.includes(mod) ? "rgba(244,114,182,0.15)" : "rgba(255,255,255,0.05)",
                    boxShadow: activeMods.includes(mod) ? "inset 0 0 0 1px rgba(244,114,182,0.4)" : "inset 0 0 0 1px rgba(255,255,255,0.08)",
                    color: activeMods.includes(mod) ? "#f472b6" : "#64748b",transition:"all .15s",
                  }}>{mod}</button>
                ))}
              </div>
            </Glass>

            {/* Video-only controls */}
            {mode==="video" && <>
              <Glass style={{ padding:13 }}>
                <RangeSlider label="Motion Strength" value={motionStr} onChange={setMotionStr} min={1} max={10} />
              </Glass>
              <Glass style={{ padding:13 }}>
                <label style={{ color:"#64748b",fontSize:10,letterSpacing:1.5,textTransform:"uppercase",
                  fontFamily:"'DM Mono',monospace",display:"block",marginBottom:10 }}>Camera Movement</label>
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:6 }}>
                  {CAMERA_PRESETS.map(cam=>(
                    <button key={cam} onClick={()=>setCamera(cam)} style={{
                      padding:"8px 0",borderRadius:9,border:"none",cursor:"pointer",fontSize:11,fontWeight:600,
                      background: camera===cam ? "rgba(56,189,248,0.12)" : "rgba(255,255,255,0.04)",
                      boxShadow: camera===cam ? "inset 0 0 0 1px rgba(56,189,248,0.35)" : "inset 0 0 0 1px rgba(255,255,255,0.07)",
                      color: camera===cam ? "#38bdf8" : "#64748b",transition:"all .2s",
                    }}>
                      {cam==="Pan"?"↔ Pan":cam==="Tilt"?"↕ Tilt":cam==="Zoom"?"⊕ Zoom":"⤴ Crane"}
                    </button>
                  ))}
                </div>
              </Glass>
            </>}

            {/* Generate */}
            <button onClick={status==="done" ? reset : generate}
              disabled={status==="enhancing"||status==="generating"}
              style={{
                width:"100%",padding:"13px 0",borderRadius:13,border:"none",
                cursor: status==="enhancing"||status==="generating" ? "not-allowed" : "pointer",
                background: status==="enhancing"||status==="generating" ? "rgba(167,139,250,0.15)" :
                  status==="done" ? "rgba(16,185,129,0.2)" :
                  "linear-gradient(135deg,rgba(167,139,250,.7),rgba(244,114,182,.6))",
                color: status==="done" ? "#10b981" : "#fff",
                fontSize:13,fontWeight:700,letterSpacing:.5,
                boxShadow: status==="idle" ? "0 0 28px rgba(167,139,250,0.2)" : "none",transition:"all .3s",
              }}>
              {status==="enhancing" ? "✦ Enhancing Prompt..." :
               status==="generating" ? "⬡ Generating..." :
               status==="done" ? "✓ New Generation" :
               `${mode==="image"?"⬛":"▶"} Generate ${mode==="image"?"Image":"Video"}`}
            </button>
          </div>

          {/* ── RIGHT PANEL ── */}
          <div style={{ display:"flex", flexDirection:"column", overflow:"hidden" }}>

            {/* Preview area */}
            <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center",
              padding:28, position:"relative" }}>
              <div style={{
                width: ratio==="9:16" ? 250 : ratio==="1:1" ? 390 : "100%",
                maxWidth: ratio==="16:9" ? 680 : undefined, position:"relative",
              }}>
                <div style={{
                  position:"relative", paddingTop:ratioPad(ratio),
                  borderRadius:16, overflow:"hidden",
                  boxShadow:"0 0 80px rgba(167,139,250,0.1),0 40px 80px rgba(0,0,0,0.5)",
                  border:"1px solid rgba(255,255,255,0.08)",
                }}>
                  <div style={{ position:"absolute", inset:0 }}>

                    {/* ── IDLE ── */}
                    {status==="idle" && (
                      <div style={{ width:"100%",height:"100%",display:"flex",flexDirection:"column",
                        alignItems:"center",justifyContent:"center",
                        background:"radial-gradient(ellipse at center,rgba(167,139,250,0.07) 0%,transparent 70%)",gap:10 }}>
                        <div style={{ fontSize:30,opacity:.12 }}>{mode==="image"?"⬛":"▶"}</div>
                        <div style={{ color:"#1e293b",fontSize:11,fontFamily:"'DM Mono',monospace",letterSpacing:1.5 }}>PREVIEW WINDOW</div>
                        <div style={{ color:"#0f172a",fontSize:11 }}>Enter a concept to begin</div>
                      </div>
                    )}

                    {/* ── PROCESSING ── */}
                    {(status==="enhancing"||status==="generating") && (
                      <div style={{ width:"100%",height:"100%",
                        background:"linear-gradient(135deg,#0f172a,#1e0a3c)",
                        display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                        padding:26,boxSizing:"border-box",gap:16 }}>
                        <div style={{ position:"relative",width:64,height:64,display:"flex",alignItems:"center",justifyContent:"center" }}>
                          {[0,1,2].map(i=>(
                            <div key={i} style={{ position:"absolute",
                              width:64-i*16,height:64-i*16,borderRadius:"50%",
                              border:`1px solid rgba(167,139,250,${0.3-i*0.08})`,
                              animation:`spin ${1.5+i*0.5}s linear infinite` }} />
                          ))}
                          <div style={{ fontSize:16 }}>⬡</div>
                        </div>
                        <div style={{ width:"100%",maxWidth:230 }}>
                          <ProgressBar v={progress} />
                          <div style={{ textAlign:"center",color:"#64748b",fontSize:10,
                            fontFamily:"'DM Mono',monospace",marginTop:6 }}>{progress}% — {status}</div>
                        </div>
                        <div style={{ width:"100%",maxWidth:250,background:"rgba(0,0,0,0.3)",
                          borderRadius:8,padding:9,maxHeight:120,overflowY:"auto" }}>
                          {currentLogs.map((line,i)=>(
                            <div key={i} style={{ fontFamily:"'DM Mono',monospace",fontSize:9.5,lineHeight:1.8,
                              color: i===currentLogs.length-1 ? "#a78bfa" : "#334155" }}>{line}</div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ── DONE ── */}
                    {status==="done" && latestItem && (()=>{
                      const [c1,c2] = PALETTES[latestItem.palIdx % PALETTES.length];
                      const isSaved = savedIds.has(latestItem.id);
                      return (
                        <div style={{ width:"100%",height:"100%",position:"relative",overflow:"hidden",
                          background:`radial-gradient(ellipse at 30% 30%,${c1}55,transparent 60%),radial-gradient(ellipse at 70% 70%,${c2}44,transparent 60%),linear-gradient(135deg,#0f172a,#1e0a3c)` }}>
                          {/* Grid overlay */}
                          <div style={{ position:"absolute",inset:0,opacity:.04,
                            backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 40px,rgba(255,255,255,1) 40px,rgba(255,255,255,1) 41px),repeating-linear-gradient(90deg,transparent,transparent 40px,rgba(255,255,255,1) 40px,rgba(255,255,255,1) 41px)" }} />
                          {/* Noise */}
                          <div style={{ position:"absolute",inset:0,opacity:.03,
                            backgroundImage:"url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }} />
                          {/* Status badge */}
                          <div style={{ position:"absolute",top:10,right:10,
                            background:"rgba(16,185,129,0.2)",border:"1px solid rgba(16,185,129,0.4)",
                            borderRadius:6,padding:"3px 9px",color:"#10b981",
                            fontSize:9,fontFamily:"'DM Mono',monospace",letterSpacing:1 }}>✓ GENERATED</div>
                          {/* Saved indicator */}
                          {isSaved && <div style={{ position:"absolute",top:10,left:10,
                            background:"rgba(167,139,250,0.2)",border:"1px solid rgba(167,139,250,0.35)",
                            borderRadius:6,padding:"3px 9px",color:"#a78bfa",
                            fontSize:9,fontFamily:"'DM Mono',monospace" }}>★ SAVED</div>}
                          {/* Center */}
                          <div style={{ position:"absolute",inset:0,display:"flex",flexDirection:"column",
                            alignItems:"center",justifyContent:"center",gap:12 }}>
                            <div style={{ fontSize:24,opacity:.4 }}>{mode==="image"?"🖼":"🎬"}</div>
                            <div style={{ color:"#e2e8f0",fontSize:12,fontWeight:600,textAlign:"center",maxWidth:"75%",zIndex:1 }}>
                              {prompt.slice(0,42)}{prompt.length>42?"...":""}
                            </div>
                            {refImages.length>0 && (
                              <div style={{ display:"flex",gap:4,zIndex:1 }}>
                                {refImages.slice(0,3).map(r=>(
                                  <img key={r.id} src={r.src} alt="" style={{
                                    width:22,height:22,borderRadius:4,objectFit:"cover",
                                    border:"1px solid rgba(167,139,250,0.4)",opacity:.7,
                                  }} />
                                ))}
                                <div style={{ color:"#64748b",fontSize:9,fontFamily:"'DM Mono',monospace",alignSelf:"center",marginLeft:2 }}>
                                  refs applied
                                </div>
                              </div>
                            )}
                          </div>
                          {/* Action bar */}
                          <div style={{ position:"absolute",bottom:0,left:0,right:0,
                            background:"linear-gradient(transparent,rgba(0,0,0,0.8))",
                            padding:"30px 14px 14px",display:"flex",gap:7,justifyContent:"center" }}>
                            {/* VIEW */}
                            <button onClick={()=>setViewItem(latestItem)} style={{
                              padding:"7px 14px",borderRadius:8,border:"none",
                              background:"rgba(255,255,255,0.12)",color:"#f1f5f9",
                              fontSize:11,cursor:"pointer",fontWeight:600,letterSpacing:.3,
                            }}>👁 View</button>
                            {/* SAVE */}
                            <button onClick={()=>handleSave(latestItem.id)} style={{
                              padding:"7px 14px",borderRadius:8,border:"none",cursor:"pointer",fontSize:11,fontWeight:600,letterSpacing:.3,
                              background: isSaved ? "rgba(16,185,129,0.2)" : "rgba(167,139,250,0.18)",
                              color: isSaved ? "#10b981" : "#a78bfa",
                              boxShadow: isSaved ? "inset 0 0 0 1px rgba(16,185,129,0.35)" : "inset 0 0 0 1px rgba(167,139,250,0.3)",
                            }}>{isSaved ? "★ Saved" : "＋ Save"}</button>
                            {/* PAYLOAD */}
                            {payload && <button onClick={()=>setShowPayload(true)} style={{
                              padding:"7px 13px",borderRadius:8,border:"1px solid rgba(167,139,250,0.25)",
                              background:"rgba(167,139,250,0.08)",color:"#a78bfa",
                              fontSize:11,cursor:"pointer",fontFamily:"'DM Mono',monospace",
                            }}>⬡ Payload</button>}
                          </div>
                        </div>
                      );
                    })()}

                  </div>
                </div>
                {/* Ratio label */}
                <div style={{ position:"absolute",bottom:-22,left:"50%",transform:"translateX(-50%)",
                  color:"#1e293b",fontSize:9,fontFamily:"'DM Mono',monospace",letterSpacing:2,whiteSpace:"nowrap" }}>
                  {ratio} · {ratioRes(ratio)}
                </div>
              </div>
            </div>

            {/* Gallery strip */}
            <GalleryStrip gallery={gallery} savedIds={savedIds}
              onView={item=>setViewItem(item)} onSave={handleSave} />
          </div>
        </main>
      </div>

      {/* Modals */}
      {viewItem  && <MediaViewer item={viewItem} onClose={()=>setViewItem(null)}
        onSave={()=>handleSave(viewItem.id)} isSaved={savedIds.has(viewItem.id)} />}
      {showPayload && payload && <PayloadModal payload={payload} onClose={()=>setShowPayload(false)} />}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing:border-box; }
        ::-webkit-scrollbar { width:4px; height:4px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.1); border-radius:99px; }
        textarea, input[type=text], input[type=file] { caret-color:#a78bfa; }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>
    </div>
  );
}
