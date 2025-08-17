import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import { Canvas, useFrame, useThree, useLoader } from "@react-three/fiber";
import * as THREE from "three";

// ===== Theming + Layout =====
const CLOUD_ALT = 12;   // clouds stay above everything
const BOARD_ALT = 2.8;  // grounded boards' center height
const TITLE_ALT = 10;
const ARENA_HALF = 26;   // half-width of playable area (for clamping + walls)
// Resolves to "/world-of-samarth/<path>" in production, "/" in dev
// --- movement tolerances (prevents edge fall-through) ---
const EDGE_PAD = 0.12;         // how much to "inflate" walk AABBs in X/Z
const PROBE_FACTOR = 0.55;     // enlarges the feet probe (radius * factor)
const GROUND_SNAP = 0.25;      // snap-to-ground if this close while falling
const MAX_STEP = 0.45;         // optional: allow tiny step-down without falling
const MAX_UP_SNAP = 0.5;      // never snap UP to a surface >50cm above your feet (unless ladder grace)
const ROOF_GRACE_MS = 1200;   // how long after ladder toggle you’re allowed to snap onto the roof

const asset = (p: string) => `${import.meta.env.BASE_URL}${p.replace(/^\/+/, '')}`;
export type HouseDef = {
  id: string;
  x: number;
  z: number;
  doorWorld: THREE.Vector3;
  insideSpawn: THREE.Vector3;
  interiorLight: THREE.Vector3;
};
// --- Simple collision system (AABBs) ---
type AABB = { min: [number, number, number]; max: [number, number, number]; tag?: string;};

// Solids you cannot pass through (trunks, walls, box sides, arena walls)
let GLOBAL_BLOCKERS: AABB[] = [];
function setBlockers(aabbs: AABB[]) { GLOBAL_BLOCKERS = aabbs; }

// Flat tops you can stand on (box/roof tops only)
let GLOBAL_WALK_SURFACES: AABB[] = []; //idk
function setWalkSurfaces(aabbs: AABB[]) { GLOBAL_WALK_SURFACES = aabbs; }

// Ladders (unchanged)
let GLOBAL_CLIMB_VOLUMES: AABB[] = [];
function setClimbVolumes(vols: AABB[]) { GLOBAL_CLIMB_VOLUMES = vols; }

let GLOBAL_INTERIOR_BLOCKERS: AABB[] = [];
function setInteriorBlockers(aabbs: AABB[]) { GLOBAL_INTERIOR_BLOCKERS = aabbs; }
function makeInteriorAABBs(
  house: { id: string; x: number; z: number },
  baseW = 8, baseD = 8, baseH = 4.4,
  thickness = 0.18, inset = 0.10
): AABB[] {
  const { id, x, z } = house;

  // North wall (back)
  const north: AABB = {
    min: [x - baseW/2 + inset, 0,        z - baseD/2 - thickness/2 + inset],
    max: [x + baseW/2 - inset, baseH,    z - baseD/2 + thickness/2 + inset],
    tag: `interior-${id}`,
  };
  // South wall (front) — leave a ~2.2m wide door gap centered
  const gap = 2.2;
  const southLeft: AABB = {
    min: [x - baseW/2 + inset, 0,        z + baseD/2 - thickness/2 - inset],
    max: [x - gap/2 - 0.05,    baseH,    z + baseD/2 + thickness/2 - inset],
    tag: `interior-${id}`,
  };
  const southRight: AABB = {
    min: [x + gap/2 + 0.05,    0,        z + baseD/2 - thickness/2 - inset],
    max: [x + baseW/2 - inset, baseH,    z + baseD/2 + thickness/2 - inset],
    tag: `interior-${id}`,
  };
  // West wall (left)
  const west: AABB = {
    min: [x - baseW/2 - thickness/2 + inset, 0,     z - baseD/2 + inset],
    max: [x - baseW/2 + thickness/2 + inset, baseH, z + baseD/2 - inset],
    tag: `interior-${id}`,
  };
  // East wall (right)
  const east: AABB = {
    min: [x + baseW/2 - thickness/2 - inset, 0,     z - baseD/2 + inset],
    max: [x + baseW/2 + thickness/2 - inset, baseH, z + baseD/2 - inset],
    tag: `interior-${id}`,
  };

  return [north, southLeft, southRight, west, east];
}
// ---- furniture layout relative to house center (x,z) ----
const DESK = { cx: -2.0, cz: -1.6, w: 1.5, d: 0.7, h: 0.6 }; // top≈0.6m
const BED  = { cx:  2.2, cz: -1.6, w: 2.0, d: 1.0, h: 0.6 }; // top≈0.6m

function makeDeskAABB(hx: number, hz: number): AABB {
  const { cx, cz, w, d, h } = DESK;
  const x = hx + cx, z = hz + cz;
  return { min: [x - w/2, 0, z - d/2], max: [x + w/2, h, z + d/2], tag: "interior-furniture" };
}

function makeBedAABB(hx: number, hz: number): AABB {
  const { cx, cz, w, d, h } = BED;
  const x = hx + cx, z = hz + cz;
  return { min: [x - w/2, 0, z - d/2], max: [x + w/2, h, z + d/2], tag: "interior-furniture" };
}

// Parkour layout shared by renderer + colliders
function getParkourDefs(){
  const defs: {x:number; z:number; w:number; d:number; h:number}[] = [];
  const w = 1.6, d = 1.6; // box footprint
  const R = 14;           // circle radius — outside the 4 boards ring
  const steps = 18;       // boxes aroundx
  const angleStep = w / R; // arc length ~ box width => edge-to-edge
  let h = 0.8;            // starting height
  for(let i=0;i<steps;i++){
    const a = i * angleStep;
    defs.push({ x: Math.cos(a)*R, z: Math.sin(a)*R, w, d, h });
    h += 0.35; // rise per step
  } //?? how is everything up to date
  return defs;
}

function getTopButtonPos(){
  const defs = getParkourDefs();
  const top = defs[defs.length-1];
  return new THREE.Vector3(top.x, top.h + 0.25, top.z);
}

// ---------------- Resume-driven board content ----------------
const WHITEBOARD_CONFIG = [
  {
    id: "board1",
    title: "Projects",
    sections: [
      {
        title: "Jetbot Autonomous Vehicle",
        url: "https://github.com/samarthVijay/Jetbot-Autonomous-Parking-and-Self-Driving",
        body:
          "<p><b>Why I built it:</b> I wanted a tiny car that could make decisions on its own without phoning home. Edge compute or bust.</p>\
           <p><b>Perception:</b> Collected hallway/outdoor footage with a CSI camera and built a training set (class balance + augmentations: random crop/flip/brightness). Trained CNNs in PyTorch/TensorFlow; exported to ONNX and optimized with TensorRT/torch2trt on a <b>Jetson Nano</b>. Post‑opt inference runs in the low‑tens of ms on 320×240 frames, which leaves enough CPU for control.</p>\
           <p><b>Control loop:</b> Capture → normalize → model → parse detections → <i>steering policy</i> (simple proportional navigation + collision gating). PWM motor driver for throttle/steer; soft‑start and clamped acceleration to keep the chassis stable. Implemented a parking routine that looks for a rectangular free‑space window and centers the robot between edges before braking.</p>\
           <p><b>Reliability:</b> watchdog resets on camera drops, bounded queues to avoid latency creep, and telemetry prints over UART for quick serial debugging.</p>"
      },
      {
        title: "Embedded LIDAR Project (Object Modeling)",
        url: "https://github.com/samarthVijay/Embedded-LIDAR-Project",
        body:
          "<p><b>Goal:</b> a low‑cost, from‑scratch 3D scanner to understand room geometry.</p>\
           <p><b>Hardware:</b> TI <b>MSP‑EXP432E401Y</b> MCU in C; Time‑of‑Flight sensor over <b>I²C</b> mounted on a small rotating arm (DC motor with gear reduction). Angle is tracked from a simple encoder; distance samples streamed over <b>UART</b>.</p>\
           <p><b>Pipeline:</b> MCU emits [angle, distance] at fixed intervals → Python/MATLAB consumes serial, converts polar → Cartesian, stitches revolutions into a 3D point cloud. Added debouncing + median filtering and a quick calibration pass to account for sensor offset.</p>\
           <p><b>Result:</b> live 3D visualization with basic surface coloring by range — surprisingly usable for mapping corners, tables, and walkways.</p>"
      },
      {
        title: "C++ Snake (Terminal UI, 2‑Player)",
        url: "https://github.com/samarthVijay/Snake-Game-Cpp",
        body:
          "<p><b>Design:</b> classic snake, but written as an <b>OOD</b> C++ project with clean separation — <code>Game</code>, <code>Board</code>, <code>Snake</code>, <code>Renderer</code>, <code>Input</code>. Terminal graphics (ANSI/ncurses‑style) render a pixel‑art feel right in the console.</p>\
           <p><b>Data structures:</b> the snake body uses a linked list / deque so head‑insert + tail‑pop are O(1). Food cells tracked with a hash set for O(1) collision checks; a queue drives event batching for smooth input.</p>\
           <p><b>Algorithms:</b> constant‑time collision checks, modular wrap/clip logic, and a fixed‑timestep loop using <code>std::chrono</code>. Two‑player mode runs independent snakes with deterministic updates so both stay in sync at the same tick rate.</p>\
           <p><b>Memory:</b> careful stack/heap usage, RAII for resource safety, and zero needless copies on hot paths. The point was to learn DS&A by building something I’d actually play.</p>"
      },
      {
        title: "Minecraft‑inspired Web World (this site)",
        body:
          "<p>I grew up playing Minecraft — this site is my little nod to that era. It’s built with <b>React + @react-three/fiber</b> and a bunch of hand‑rolled canvas textures. The world has pointer‑lock movement, jump physics, thick wooden banner signs, houses with gable roofs, and a scrollable modal that renders résumé content.</p>\
           <p>Under the hood: custom textures (planks/bricks/grass), simple voxel vibe, keyboard controls, and a thin state layer so opening a board unlocks the cursor and snaps back into pointer‑lock when you exit.</p>"
      }
    ],
    images: [
      asset('images/imagejetbot1.jpeg'),
      asset('images/imagejetbot3.gif'),
      asset('images/imagejetbot2.jpeg'),
      asset('images/imagelidar1.jpeg'),
      asset('images/imagesnake1.jpg'),
    ],
    image: "https://via.placeholder.com/400x300/4ade80/ffffff?text=Projects",
  },
  {
    id: "board2",
    title: "Experience",
    sections: [
      {
        title: "MAD Elevators — IoT/Embedded Developer",
        body:
          "<p>Shipped an escalator‑monitoring device that flags faults and ships logs to the cloud.</p>\
           <ul>\
             <li>Linux gateways in <b>Go/Python</b> talking to diagnostics over <b>UART/RS-485</b> and sensors on <b>I²C</b>.</li>\
             <li><b>Zero‑Touch Provisioning</b> using PowerShell/Plink/Bash — fresh devices enroll themselves, fetch certs/config, and come online with no keyboard time.</li>\
             <li>Integrated <b>MosaicONE</b> REST: telemetry uplink, remote logs, and firmware operations with proper back‑off and retry.</li>\
             <li>Pinned dependencies in containers and added safety interlocks so comms faults never stall escalator operation.</li>\
           </ul>"
      },
      {
        title: "Maple Leaf Foods — Automation Analyst",
        body:
          "<p>Focus: make internal workflows faster and more visible.</p>\
           <ul>\
             <li>Built Power Platform apps (with GenAI copilots) used across teams — estimated <b>~$700k</b> in annualized savings from time reclaimed.</li>\
             <li>Department‑wide bot that hits ITSM <b>REST</b> endpoints; configs via JSON; feedback loop to keep triage quality high.</li>\
             <li>Automated license provisioning with <b>Microsoft Graph</b> and PowerShell; added guardrails + audit trails.</li>\
             <li><b>Power BI</b> dashboards backed by SQL Server to surface usage, aging tickets, and process hotspots.</li>\
           </ul>"
      }
    ],
    images: [
      "https://via.placeholder.com/360x540/60a5fa/ffffff?text=Exp+1",
      "https://via.placeholder.com/360x540/3b82f6/ffffff?text=Exp+2",
      "https://via.placeholder.com/360x540/2563eb/ffffff?text=Exp+3"
    ],
    image: "https://via.placeholder.com/400x300/60a5fa/ffffff?text=Experience",
  },
  {
    id: "board3",
    title: "Skills",
    sections: [
      { title: "Embedded & Systems", body: "<ul><li>Jetson Nano, UART/RS‑485, I²C, SPI; Linux, Docker, Git, VS Code/CLion.</li><li>Debugging with logic analyzer/serial consoles; writing lean C/C++ for MCUs.</li></ul>" },
      { title: "ML & Computer Vision", body: "<ul><li>PyTorch, TensorFlow, TensorRT/torch2trt, ONNX; OpenCV + NumPy.</li><li>Data curation, augmentation, latency budgeting, and small‑model deployment at the edge.</li></ul>" },
      { title: "Cloud & Microsoft", body: "<ul><li>REST APIs, Microsoft Graph, Power Platform (Power Apps/Automate), SharePoint, Power BI.</li><li>SQL Server modeling and report tuning.</li></ul>" },
      { title: "Web", body: "<ul><li>React, TypeScript/JavaScript, Tailwind, shadcn/ui.</li></ul>" }
    ],
    images: [
      "https://via.placeholder.com/360x540/fbbf24/ffffff?text=Skill+1",
      "https://via.placeholder.com/360x540/f59e0b/ffffff?text=Skill+2",
      "https://via.placeholder.com/360x540/d97706/ffffff?text=Skill+3"
    ],
    image: "https://via.placeholder.com/400x300/fbbf24/ffffff?text=Skills",
  },
  {
    id: "board4",
    title: "About + Contact",
    sections: [
      { title: "About me", body: "<p>I’m Samarth — a Computer Engineering student at McMaster who likes building practical things that move bits <i>and</i> atoms. I gravitate to embedded ML and real‑time systems where constraints make the problem interesting.</p>" },
      { title: "How I work", body: "<ul><li>Bias for working prototypes early; iterate with measurements.</li><li>Prefer readable, testable code over clever one‑liners.</li><li>Automate the boring parts (scripts, dashboards, bots) so people can focus on the work that matters.</li></ul>" },
      { title: "Contact", body: "<p><a href=\"mailto:samarthvijay714@gmail.com\" target=\"_blank\" rel=\"noopener noreferrer\">Email</a> · <a href=\"https://www.linkedin.com/in/samarth-vijay714/\" target=\"_blank\" rel=\"noopener noreferrer\">LinkedIn</a> · <a href=\"https://github.com/samarthVijay\" target=\"_blank\" rel=\"noopener noreferrer\">GitHub</a></p>" }
    ],
    images: [
      asset('images/imageme1.jpeg'),
      asset('images/imageme2.jpeg'),
      asset('images/imageme3.jpeg'),
    ],
    image: "https://via.placeholder.com/400x300/f87171/ffffff?text=Contact",
  },
];
function BackgroundMusic({
  lightSrc = "audio/bg.mp3",
  darkSrc  = "audio/night.mp3",
  darkMode,
  maxVolume = 0.6,
  fadeMs = 900,
}: {
  lightSrc?: string;
  darkSrc?: string;
  darkMode: boolean;
  maxVolume?: number;
  fadeMs?: number;
}) {
  const lightRef   = useRef<HTMLAudioElement | null>(null);
  const darkRef    = useRef<HTMLAudioElement | null>(null);
  const startedRef = useRef(false);
  const mutedRef   = useRef(false);

  // create audio elements once
  useEffect(() => {
    const mk = (path: string) => {
      const url = `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;
      const a = new Audio(url);
      a.loop = true;
      a.preload = "auto";
      (a as any).playsInline = true;
      a.volume = 0;
      return a;
    };
    lightRef.current = mk(lightSrc);
    darkRef.current  = mk(darkSrc);

    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "m") {
        mutedRef.current = !mutedRef.current;
        if (lightRef.current) lightRef.current.muted = mutedRef.current;
        if (darkRef.current)  darkRef.current.muted  = mutedRef.current;
      }
    };
    window.addEventListener("keydown", onKey);

    // start on first click (autoplay policy)
    const start = async () => {
      if (startedRef.current) return;
      try {
        // start both so switching is instant; keep inactive at 0 volume
        await lightRef.current?.play();
        await darkRef.current?.play();
        startedRef.current = true;
        // fade in the correct one initially
        const active = darkMode ? darkRef.current : lightRef.current;
        fadeTo(active!, maxVolume, fadeMs);
      } catch {
        startedRef.current = false;
      }
      if (startedRef.current) {
        window.removeEventListener("click", start, true);
      }
    };
    window.addEventListener("click", start, true);

    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", start, true);
      lightRef.current?.pause();
      darkRef.current?.pause();
      if (lightRef.current) lightRef.current.src = "";
      if (darkRef.current)  darkRef.current.src  = "";
      lightRef.current = null;
      darkRef.current  = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightSrc, darkSrc]);

  // crossfade on theme change
  useEffect(() => {
    if (!startedRef.current) return;
    const on  = darkMode ? darkRef.current  : lightRef.current;
    const off = darkMode ? lightRef.current : darkRef.current;
    if (!on || !off) return;

    // ensure both are playing (in case user reloaded mid-gesture)
    on.play().catch(()=>{});
    off.play().catch(()=>{});

    fadeTo(on,  maxVolume, fadeMs);
    fadeTo(off, 0,         fadeMs);
  }, [darkMode, maxVolume, fadeMs]);

  return null;
}

function fadeTo(a: HTMLAudioElement, target: number, ms: number) {
  const steps = Math.max(1, Math.floor(ms / 50));
  const start = a.volume;
  const delta = target - start;
  let i = 0;
  const id = window.setInterval(() => {
    i++;
    const t = i / steps;
    a.volume = clamp01(start + delta * easeInOutQuad(t));
    if (i >= steps) {
      a.volume = clamp01(target);
      if (target === 0) a.currentTime = a.currentTime; // keep playing silently
      window.clearInterval(id);
    }
  }, 50);
}
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeInOutQuad = (t: number) => (t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2)/2);


export default function App() {
  const [prompt, setPrompt] = useState<string | null>(null);
  const [activeBoard, setActiveBoard] = useState<string | null>(null);
  const [rgbBorder, setRgbBorder] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const topBtnPos = useMemo(()=>getTopButtonPos(),[]);
  const [insideHouseId, setInsideHouseId] = useState<string | null>(null);
  const [exhibit, setExhibit] = useState<{img: string; caption: string} | null>(null);
  const [houseDefs, setHouseDefs] = useState<HouseDef[]>([]);
  const skyGradient = darkMode
  ? "linear-gradient(#0b1220, #1a237e)"   // night: deep navy → indigo
  : "linear-gradient(#87ceeb, #1e90ff)"; // day: light blue → sky blue

  useEffect(() => {
    const anyModal = !!activeBoard;
    if (anyModal && document.pointerLockElement) document.exitPointerLock();
    document.body.style.cursor = anyModal ? "auto" : "none";
    return () => { if (!anyModal) document.body.style.cursor = "none"; };
  }, [activeBoard]);
  useEffect(() => {
    if (!insideHouseId) {
      setInteriorBlockers([]);
      return;
    }
    const h = houseDefs.find(hh => hh.id === insideHouseId);
    if (!h) { setInteriorBlockers([]); return; }

    setInteriorBlockers([
      ...makeInteriorAABBs(h),
        makeBedAABB(h.x, h.z),
        makeDeskAABB(h.x, h.z)
    ]);
  }, [insideHouseId, houseDefs]);
  
  // Global toggle event for the RGB border animation
  useEffect(()=>{
    const onToggle = () => setRgbBorder(v=>!v);
    window.addEventListener('toggle-rgb-border', onToggle as any);
    return () => window.removeEventListener('toggle-rgb-border', onToggle as any);
  },[]);
  // Global toggle for dark mode
  useEffect(() => {
    const onToggle = () => setDarkMode(v => !v);
    window.addEventListener('toggle-dark-mode', onToggle as any);
    return () => window.removeEventListener('toggle-dark-mode', onToggle as any);
}, []);
  const closeAndRelock = () => {
    setActiveBoard(null);
    setTimeout(() => window.dispatchEvent(new CustomEvent("relock-pointer")), 0);
  };

  return (
    
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden" }}>
      {/* Sky gradient */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", background: skyGradient }} />

      {!activeBoard && (
        <div style={{ position: "fixed", top: 10, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,0.5)", color: "#fff", padding: "8px 12px", borderRadius: 10, zIndex: 10, fontSize: 14 }}>
          Click to lock the mouse · WASD move · Space jump · F to toggle ladder climb · Press <b>E</b> near the golden button · ESC to close · Click M to mute/unmute
        </div>
      )}
      <BackgroundMusic
        lightSrc="audio/bg.mp3"
        darkSrc="audio/night.mp3"  
        darkMode={darkMode}
        maxVolume={0.6}
      />
      {prompt && (
        <div
          style={{
            position: "fixed",
            left: "50%",
            bottom: 24,
            transform: "translateX(-50%)",
            background: "rgba(30,41,59,0.85)", // slate-800 with alpha
            color: "#fff",
            padding: "10px 16px",
            borderRadius: 10,
            zIndex: 20,
            fontFamily: "monospace",
            fontWeight: 800,
            letterSpacing: 1,
            border: "3px solid #111827",
          }}
        >
          {prompt}
        </div>
      )}
      <Canvas camera={{ fov: 70, position: [0, 1.6, 6] }} onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[8, 20, 10]} intensity={1} />

        <World
          darkMode={darkMode}
          enabled={!activeBoard}
          setPrompt={setPrompt}
          onDefs={setHouseDefs}   // NEW
        />
        {houseDefs.length > 0 && (
          <HouseInteriors
            enabled={!activeBoard}
            houseDefs={houseDefs}
            setPrompt={setPrompt}
            setExhibit={setExhibit}
            insideId={insideHouseId}
          />
        )}
        <GroundedWhiteboards setActiveBoard={setActiveBoard} darkMode={darkMode} setPrompt={setPrompt}/>
        <ThickSkySign text="WELCOME TO MY WORLD" rgbActive={rgbBorder} darkMode={darkMode} />

        <MouseLookControls enabled={!activeBoard} initialYaw={0} initialPitch={-0.1} />
        <MovementControls enabled={!activeBoard} speed={3.5} insideHouseId={insideHouseId}/>
        <Crosshair enabled={!activeBoard} />
        <InteractAtPoint
          target={topBtnPos}
          enabled={!activeBoard}
          keyName="e"
          range={2.0}
          label={darkMode ? "Press E to switch to Day" : "Press E to switch to Night"}
          onTrigger={() => {
            window.dispatchEvent(new CustomEvent("toggle-rgb-border"));
            window.dispatchEvent(new CustomEvent("spin-banner"));
            window.dispatchEvent(new CustomEvent("toggle-dark-mode"));
          }}
          setPrompt={setPrompt}
        />
        {houseDefs.length > 0 && (
          <DoorPrompts //test comment
            enabled={!activeBoard}
            houseDefs={houseDefs}
            setPrompt={setPrompt}
            setInside={setInsideHouseId}
            insideId={insideHouseId}
          />
        )}

        <LadderPrompts enabled={!activeBoard} setPrompt={setPrompt} />
      </Canvas>
      {exhibit && (
        <ImageModal
          img={exhibit.img}
          caption={exhibit.caption}
          darkMode={darkMode}
          onClose={()=>setExhibit(null)}
        />
      )}
      {activeBoard && (
        <WhiteboardModal config={WHITEBOARD_CONFIG.find((b) => b.id === activeBoard)!} onClose={closeAndRelock} darkMode={darkMode} />
      )}
    </div>
  );
}

/* ---------- Pure proximity + keybind (E) — no DOM inside <Canvas> ---------- */
function InteractAtPoint({
  target,
  enabled,
  keyName = "e",
  range = 2.0,
  label,
  onTrigger,
  setPrompt,
  }: {
    target: THREE.Vector3;
    enabled: boolean;
    keyName?: string;         // "e", "f", etc (case-insensitive)
    range?: number;           // meters
    label: string;            // HUD text to show
    onTrigger: () => void;
    setPrompt: (s: string | null) => void;
  }) {
    const { camera } = useThree();
    const inRange = useRef(false);

    // key handler
    useEffect(() => {
      function onKey(e: KeyboardEvent) {
        if (!enabled) return;
        if (!inRange.current) return;
        if (e.key.toLowerCase() === keyName.toLowerCase()) onTrigger();
      }
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [enabled, keyName, onTrigger]);

    // distance + prompt
    useFrame(() => {
      if (!enabled) {
        if (inRange.current) { inRange.current = false; setPrompt(null); }
        return;
      }
      const dx = camera.position.x - target.x;
      const dz = camera.position.z - target.z;
      const d  = Math.hypot(dx, dz);
      const nowInRange = d < range;
      if (nowInRange !== inRange.current) {
        inRange.current = nowInRange;
        setPrompt(nowInRange ? label : null);
      }
    });
  return null;
}

/* ---------- Whiteboard Modal (Minecraft-themed, scrollable + ESC) ---------- */
function ImageModal({
  img, caption, onClose, darkMode
}: { img: string; caption: string; onClose: ()=>void; darkMode:boolean }) {
  const paper = darkMode ? "#0b1220" : "#ffffff";
  const frame = darkMode ? "#0b1220" : "#0f172a";
  const ink   = darkMode ? "#e5e7eb" : "#111827";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div onMouseDown={(e)=>{ if(e.target===e.currentTarget) onClose(); }}
         style={{position:"fixed",inset:0,display:"flex",alignItems:"center",justifyContent:"center",
                 background:"rgba(0,0,0,0.85)", zIndex:40, padding:"2rem"}}>
      <div onMouseDown={(e)=>e.stopPropagation()}
           style={{width:"80vw",maxWidth:900, background:paper, border:`6px solid ${frame}`, boxShadow:"0 10px 40px rgba(0,0,0,0.6)"}}>
        <img src={img} alt="exhibit" style={{display:"block", width:"100%", height:"auto"}} />
        <div style={{padding:"1rem", color:ink, fontFamily:"monospace"}}>{caption}</div>
        <div style={{padding:"0 1rem 1rem", color:ink, opacity:0.8}}>Press ESC to close</div>
      </div>
    </div>
  );
}

function WhiteboardModal({
  config,
  onClose,
  darkMode,
}: {
  config: (typeof WHITEBOARD_CONFIG)[0];
  onClose: () => void;
  darkMode: boolean;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" || e.key.toLowerCase() === "q") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // pixel frame + tile (kept as-is)
  const pixelBorder = (thick = 6) => ({
    boxShadow: `0 0 0 ${thick}px #111827, 0 0 0 ${thick * 2}px #6b7280, 0 0 0 ${thick * 3}px #111827` as string,
  });
  const pixelTile = {
    backgroundImage:
      "repeating-linear-gradient(45deg, #9b6b43 0 16px, #8d5e37 16px 32px, #a7744d 32px 48px)",
    imageRendering: "pixelated" as const,
  };
  const grassStrip = {
    background: "linear-gradient(#16a34a, #16a34a)",
    height: 24,
    width: "100%",
    borderBottom: "6px solid #14532d",
  } as const;

  // theme helpers
  const paper = darkMode ? "#0b1220" : "#ffffff";   // main reading surface
  const ink   = darkMode ? "#e5e7eb" : "#111827";   // body text color
  const frame = darkMode ? "#0b1220" : "#0f172a";   // borders/frames
  const panel = darkMode ? "#131a2a" : "#fefefe";   // title panel bg

  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 30,
        background: "rgba(0,0,0,0.85)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "2rem",
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "92vw",
          height: "92vh",
          background: darkMode ? "#0f172a" : "#d6c2a5",
          borderRadius: 0,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          ...pixelBorder(6),
          ...pixelTile,
        }}
      >
        <div style={grassStrip} />

        {/* EXIT */}
        <button
          onClick={onClose}
          title="ESC also closes"
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            padding: "10px 18px",
            background: "#22c55e",
            color: "#0b2e13",
            border: "4px solid #14532d",
            cursor: "pointer",
            fontFamily: "monospace",
            fontWeight: 900,
            letterSpacing: 1,
            textTransform: "uppercase",
            imageRendering: "pixelated",
            ...pixelBorder(2),
          }}
        >
          EXIT
        </button>

        <div style={{ display: "flex", gap: "1.5rem", padding: "1rem", flex: 1, overflow: "hidden" }}>
          {/* LEFT: title + scrollable content */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
            {/* Title bar (BLACK text in dark mode) */}
            <div
              style={{
                background: panel,
                padding: "0.75rem 1rem",
                border: `4px solid ${frame}`,
                fontFamily: "monospace",
                fontWeight: 900,
                fontSize: "1.8rem",
                letterSpacing: 1,
                color: darkMode ? "#ffffff" : "#0f172a", // ← black at night
                ...pixelBorder(2),
              }}
            >
              {config.title.toUpperCase()}
            </div>

            {/* Content panel */}
            <div
              style={{
                marginTop: "1rem",
                background: paper,
                padding: "1rem",
                border: `4px solid ${frame}`,
                fontFamily: "monospace",
                color: ink,
                lineHeight: 1.7,
                flex: 1,
                overflow: "auto",
                ...pixelBorder(2),
              }}
            >
              {Array.isArray((config as any).sections) ? (
                (config as any).sections.map((sec: any, i: number) => (
                  <div key={i} style={{ marginBottom: "1.1rem" }}>
                    <div
                      style={{
                        fontSize: "1.35rem",
                        fontWeight: 900,
                        marginBottom: 6,
                        color: ink,
                      }}
                    >
                      {sec.url ? (
                        <a
                          href={sec.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: darkMode ? "#93c5fd" : "#0f172a",
                            textDecoration: "underline",
                          }}
                        >
                          {sec.title}
                        </a>
                      ) : (
                        sec.title
                      )}
                    </div>

                    <div
                      style={{ fontSize: "1.05rem", color: ink }}
                      dangerouslySetInnerHTML={{ __html: sec.body }}
                    />
                  </div>
                ))
              ) : (
                <div style={{ fontSize: "1.05rem", color: ink }}>
                  No content yet. Add <code>sections</code> to this board to populate it.
                </div>
              )}

              <div style={{ height: 24 }} />
              <p style={{ color: ink }}>
                Tip: Press <b>ESC</b> or <b>Q</b> to close. Everything here scrolls.
              </p>
            </div>
          </div>

          {/* RIGHT: image column */}
          <div
            style={{
              width: 420,
              display: "flex",
              flexDirection: "column",
              alignItems: "stretch",
              gap: 12,
              minWidth: 0,
              overflow: "auto",
            }}
          >
            {(
              (config as any).images ??
              ((config as any).image ? [(config as any).image] : [])
            ).map((src: string, idx: number) => (
              <div
                key={idx}
                style={{
                  width: "100%",
                  border: `4px solid ${frame}`,
                  background: paper,
                  boxShadow:
                    "0 0 0 6px #111827, 0 0 0 12px #6b7280, 0 0 0 18px #111827",
                }}
              >
                <img
                  src={src}
                  alt={`${config.title} ${idx + 1}`}
                  style={{
                    width: "100%",
                    height: 360,
                    objectFit: "cover",
                    imageRendering: "pixelated",
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Crosshair ---------- */
function Crosshair({ enabled = true }: { enabled?: boolean }) {
  const { camera } = useThree();
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!enabled || !meshRef.current) return;
    const v = new THREE.Vector3(0, 0, -0.7).applyQuaternion(camera.quaternion).add(camera.position);
    meshRef.current.position.copy(v);
    meshRef.current.quaternion.copy(camera.quaternion);
  });
  if (!enabled) return null;
  return (
    <mesh ref={meshRef}>
      <circleGeometry args={[0.005, 16]} />
      <meshBasicMaterial color={0x111111} />
    </mesh>
  );
}

/* ---------- Pointer‑lock mouse look ---------- */
function MouseLookControls({ enabled, initialYaw = 0, initialPitch = -0.1 }: { enabled: boolean; initialYaw?: number; initialPitch?: number; }) {
  const { camera, gl } = useThree();
  const yaw = useRef(initialYaw); const pitch = useRef(initialPitch); const locked = useRef(false);
  useEffect(() => {
    const canvas = gl.domElement;
    const relock = () => { if (enabled && document.pointerLockElement !== canvas) canvas.requestPointerLock(); };
    const onRelockEvent = () => relock();
    function onClick() { if (enabled && document.pointerLockElement !== canvas) canvas.requestPointerLock(); }
    function onLockChange() { locked.current = document.pointerLockElement === canvas; }
    function onMouseMove(e: MouseEvent) { if (!locked.current || !enabled) return; const s = 0.0025; yaw.current -= e.movementX * s; pitch.current -= e.movementY * s; const max = Math.PI/2 - 0.05; pitch.current = Math.max(-max, Math.min(max, pitch.current)); }
    canvas.addEventListener("click", onClick); document.addEventListener("pointerlockchange", onLockChange); window.addEventListener("mousemove", onMouseMove); window.addEventListener("relock-pointer", onRelockEvent as any);
    return () => { canvas.removeEventListener("click", onClick); document.removeEventListener("pointerlockchange", onLockChange); window.removeEventListener("mousemove", onMouseMove); window.removeEventListener("relock-pointer", onRelockEvent as any); };
  }, [enabled, gl]);
  useFrame(() => { const q = new THREE.Quaternion(); q.setFromEuler(new THREE.Euler(pitch.current, yaw.current, 0, "YXZ")); camera.quaternion.copy(q); });
  return null;
}

/* ---------- Movement (WASD + JUMP + Ladder toggle F + Sprint) ---------- */
function MovementControls({
  enabled,
  speed = 3.5,
  sprint = 1.9, // hold Shift to sprint
  insideHouseId,
}: { enabled: boolean; speed?: number; sprint?: number; insideHouseId?: string | null}) {
  const { camera } = useThree();
  const keys = useRef<{ [k: string]: boolean }>({});
  const velocity = useRef(new THREE.Vector3());
  const vY = useRef(0);
  const last = useRef(performance.now());

  const baseEye = 1.6;   // camera eye above “feet”
  const gravity = 20;
  const jumpSpeed = 7.5;
  const climbSpeed = 3.0;
  const radius = 0.4;    // player radius

  const climbing = useRef(false);
  const climbVolRef = useRef<AABB | null>(null);
  useEffect(() => {
    function onTeleport(e: any) {
      const { x, y, z } = (e as CustomEvent).detail || {};
      if (typeof x === "number" && typeof y === "number" && typeof z === "number") {
        camera.position.set(x, y, z);
        vY.current = 0; // stop vertical velocity on teleport
      }
    }
    window.addEventListener("teleport-to", onTeleport as any);
    return () => window.removeEventListener("teleport-to", onTeleport as any);
  }, [camera]);
  // Keys + ladder toggle (F)
  const lastLadderToggle = useRef(0); 
  useEffect(() => {
    function down(e: KeyboardEvent) {
      const k = e.key.toLowerCase();
      keys.current[k] = true;
      keys.current[e.code] = true;

      if (k === "f" && climbVolRef.current) {
        // toggle climbing if inside ladder volume
        climbing.current = !climbing.current;
        lastLadderToggle.current = performance.now();
        const a = climbVolRef.current;
        const cx = (a.min[0] + a.max[0]) / 2;
        const cz = (a.min[2] + a.max[2]) / 2;
        camera.position.x = cx;
        camera.position.z = cz;
      }
    }
    function up(e: KeyboardEvent) {
      keys.current[e.key.toLowerCase()] = false;
      keys.current[e.code] = false;
    }
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [camera]);

  const isDown = (name: string) =>
    !!(keys.current[name] || keys.current[name.toLowerCase()]);

  // Horizontal collision against BLOCKERS using the player's current feet..head span
  function collidesXYAt(x: number, z: number) {
    const yMin = (camera.position.y - baseEye) + 0.02; // feet
    const yMax = camera.position.y - 0.02;             // head
    const all = [...GLOBAL_BLOCKERS, ...GLOBAL_INTERIOR_BLOCKERS];
    for (const a of all) {
      if (insideHouseId && a.tag === insideHouseId) continue;
      if (
        x >= a.min[0] - radius && x <= a.max[0] + radius &&
        z >= a.min[2] - radius && z <= a.max[2] + radius
      ) {
        if (yMax > a.min[1] + 1e-3 && yMin < a.max[1] - 1e-3) {
          return true; // vertical spans overlap -> blocked
        }
      }
    }
    return false;
  }
  function groundAtLimited(
    x: number,
    z: number,
    footY: number,
    allowHighSnap: boolean
  ) {
    const walkList = GLOBAL_WALK_SURFACES;
    const probe = Math.max(0, radius * PROBE_FACTOR);
    let best = 0;
  
    for (const a of walkList) {
      const minX = a.min[0] - EDGE_PAD - probe;
      const maxX = a.max[0] + EDGE_PAD + probe;
      const minZ = a.min[2] - EDGE_PAD - probe;
      const maxZ = a.max[2] + EDGE_PAD + probe;
      if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) {
        const top = a.max[1];
        // Only consider tops not far ABOVE current feet unless grace is active
        if (allowHighSnap || top <= footY + MAX_UP_SNAP) {
          best = Math.max(best, top);
        }
      }
    }
    return best;
  }
  
  // Ground probe ONLY from WALKABLES (thin, slightly inset caps for tops/roofs)

  function inClimbVol(x: number, z: number): AABB | null {
    for (const a of GLOBAL_CLIMB_VOLUMES) {
      if (x >= a.min[0] && x <= a.max[0] && z >= a.min[2] && z <= a.max[2]) return a;
    }
    return null;
  }

  useFrame(() => {
    const now = performance.now();
    const dt = (now - last.current) / 1000;
    last.current = now;
    if (!enabled) return;

    // Desired horizontal move (+ sprint)
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    forward.y = 0; forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    const sprintMul = (isDown("ShiftLeft") || isDown("ShiftRight") || isDown("shift")) ? sprint : 1;

    let wish = new THREE.Vector3();
    if (isDown("w")) wish.add(forward);
    if (isDown("s")) wish.sub(forward);
    if (isDown("a")) wish.sub(right);
    if (isDown("d")) wish.add(right);
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed * sprintMul);

    // Smooth accel
    velocity.current.lerp(wish, 0.18);

    // Try XY move with per-axis resolution
    const next = camera.position.clone().addScaledVector(velocity.current, dt);
    let nx = camera.position.x, nz = camera.position.z;

    if (!collidesXYAt(next.x, next.z)) {
      nx = next.x; nz = next.z;
    } else {
      if (!collidesXYAt(next.x, camera.position.z)) nx = next.x;
      if (!collidesXYAt(camera.position.x, next.z)) nz = next.z;
    }
    camera.position.x = nx;
    camera.position.z = nz;

    // Ladder state
    const hereClimb = inClimbVol(camera.position.x, camera.position.z);
    climbVolRef.current = hereClimb;
    if (!hereClimb) climbing.current = false;

    // Vertical motion
    if (climbing.current && hereClimb) {
      let y = camera.position.y;
      if (isDown("w")) y += climbSpeed * dt;
      if (isDown("s")) y -= climbSpeed * dt;
      const minY = hereClimb.min[1] + baseEye;
      const maxY = hereClimb.max[1] + baseEye + 0.2;
      camera.position.y = Math.max(minY, Math.min(maxY, y));
      vY.current = 0;
    } else {
      const now = performance.now();
      const allowHighSnap = (now - lastLadderToggle.current) < ROOF_GRACE_MS;

      // Compute ground under current X/Z with limited upward snap
      const footY = camera.position.y - baseEye;
      const gY = groundAtLimited(camera.position.x, camera.position.z, footY, allowHighSnap);
      const minY = gY + baseEye;
    
      // gravity
      vY.current -= gravity * dt;
      camera.position.y += vY.current * dt;
    
      // --- sticky landing / edge-proof snap ---
      if (vY.current <= 0) { // only when descending or resting
        const dist = camera.position.y - minY;
    
        // Snap cleanly if we're close enough to the top surface
        if (dist <= GROUND_SNAP) {
          camera.position.y = minY;
          vY.current = 0;
        } else {
          // Optional small step-down allowance (prevents "hovering" at ledge)
          if (dist > 0 && dist < MAX_STEP) {
            camera.position.y = minY;
            vY.current = 0;
          }
        }
      }
    
      // grounded check AFTER potential snap
      const onGround = Math.abs(camera.position.y - minY) < 0.005 || camera.position.y < minY;
      if (onGround) {
        camera.position.y = minY;
        vY.current = 0;
      }
    
      // jump (Space) — only if grounded
      if ((isDown(" ") || isDown("Space")) && onGround) {
        vY.current = jumpSpeed * (sprintMul > 1 ? 1.05 : 1);
      }
    }
    

    // Clamp inside arena
    const H = ARENA_HALF;
    camera.position.x = Math.max(-H, Math.min(H, camera.position.x));
    camera.position.z = Math.max(-H, Math.min(H, camera.position.z));
  });

  return null;
}


/* ---------- World ---------- */
function World({ darkMode,enabled,setPrompt, onDefs,}: { darkMode: boolean;enabled:boolean;setPrompt: (s: string | null) => void; onDefs: (defs: HouseDef[]) => void;}) {
  type FullHouseDef = HouseDef & {
    baseW: number;
    baseH: number;
    baseD: number;
    roofT: number;
    ld: number;
    ladderX: number;
    ladderZ: number;
  };
  const groundTex = useMemo(() => makeVoxelGroundTexture(darkMode), [darkMode]);
  const houseDefs = useMemo<FullHouseDef[]>(() => {
    const raw = [
      { id: "house-0", x: -16, z: -12 },
      { id: "house-1", x:  16, z: -10 },
      { id: "house-2", x: -14, z:  14 },
      { id: "house-3", x:  14, z:  14 },
    ];
    const baseW=8, baseH=4.4, baseD=8, roofT=0.4, ld=0.5;
  
    return raw.map(h => {
      const doorWorld     = new THREE.Vector3(h.x, 0,   h.z + baseD/2 + 0.1);
      const insideSpawn   = new THREE.Vector3(h.x, 1.6, h.z + baseD/2 - 2.0);
      const interiorLight = new THREE.Vector3(h.x, baseH*0.6, h.z);
      const ladderX       = h.x + baseW*0.35;
      const ladderZ       = h.z + baseD/2 + ld/2 + 0.02;
  
      return { ...h, baseW, baseH, baseD, roofT, ld, ladderX, ladderZ, doorWorld, insideSpawn, interiorLight };
    });
  }, []);  
  useEffect(() => {
    onDefs(
      houseDefs.map(h => ({
        id: h.id,
        x: h.x,
        z: h.z,
        doorWorld: h.doorWorld,
        insideSpawn: h.insideSpawn,
        interiorLight: h.interiorLight,
      }))
    );
  }, [onDefs, houseDefs]);

  useEffect(() => () => { groundTex.dispose?.(); }, [groundTex]);
  useEffect(() => {
    const blockers: AABB[] = [];
    const walk: AABB[] = [];
    const climb: AABB[] = [];
   
    // --- Trees (blockers only) ---
    const fixedTrees: [number, number][] = [[-3,-6],[6,-3],[-6,5],[4,-8]];
    const ringR = 20; const ringN = 18;
    const ringTrees: [number, number][] = Array.from({length: ringN}, (_,i)=>[
      Math.cos((i/ringN)*Math.PI*2)*ringR,
      Math.sin((i/ringN)*Math.PI*2)*ringR
    ]);
    const allTrees = [...fixedTrees, ...ringTrees];
    allTrees.forEach(([x,z])=>{
      const w=0.6, d=0.6, h=2.0;
      blockers.push({ min:[x-w/2, 0, z-d/2], max:[x+w/2, h, z+d/2] });
    });
  
    // --- Houses: walls = blockers, roof slab = walkable ---
    houseDefs.forEach(h => {
      const { x, z, id, baseW, baseH, baseD, roofT, ld, ladderX, ladderZ } = h;

      // tag the shell
      blockers.push({ min:[x-baseW/2, 0, z-baseD/2], max:[x+baseW/2, baseH, z+baseD/2], tag: id });

      // thin walkable roof
      const over=0.6, inset=0.1;
      walk.push({
        min: [x-(baseW+over)/2 + inset, baseH,        z-(baseD+over)/2 + inset],
        max: [x+(baseW+over)/2 - inset, baseH + 0.12, z+(baseD+over)/2 - inset],
      });

      // ladder volume
      const lh = baseH + roofT;
      climb.push({ min:[ladderX-0.8/2, 0, ladderZ-ld/2], max:[ladderX+0.8/2, lh, ladderZ+ld/2] });
    });

  
    // --- Parkour boxes: sides = blockers, top = walkable ---
    getParkourDefs().forEach(b=>{
      // solid column blocks horizontally
      blockers.push({ min:[b.x-b.w/2, 0, b.z-b.d/2], max:[b.x+b.w/2, b.h, b.z+b.d/2] });
  
      const overhang = 0.06; // tweak 0.04–0.1 depending on feel
      walk.push({
      min: [b.x - b.w/2 - overhang, b.h - 0.02,       b.z - b.d/2 - overhang],
      max: [b.x + b.w/2 + overhang, b.h + 0.20,       b.z + b.d/2 + overhang]
});
    });
  
    // --- Arena walls: blockers only ---
    const H = ARENA_HALF, wallH = 10, thick = 0.6, span = H*2+2;
    blockers.push({ min:[ H+thick/2- thick/2, 0, -span/2], max:[ H+thick/2+ thick/2, wallH,  span/2] });
    blockers.push({ min:[-H-thick/2- thick/2,0, -span/2], max:[-H-thick/2+ thick/2, wallH,  span/2] });
    blockers.push({ min:[-span/2, 0,  H+thick/2- thick/2], max:[ span/2, wallH,  H+thick/2+ thick/2] });
    blockers.push({ min:[-span/2, 0, -H-thick/2- thick/2], max:[ span/2, wallH, -H-thick/2+ thick/2] });
  
    setBlockers(blockers);
    setWalkSurfaces(walk);
    setClimbVolumes(climb);
  }, []);

  return (
    <group>
      <mesh rotation={[-Math.PI/2,0,0]} position={[0,0,0]}>
        <planeGeometry args={[300,300]} />
        <meshBasicMaterial map={groundTex} color={darkMode ? "#bcdcbc" : "#ffffff"} />
      </mesh>
      <Trees darkMode={darkMode} houseDefs={houseDefs}/>
      <Houses darkMode={darkMode} defs={houseDefs} />
      <ParkourBoxes />
      <CloudField darkMode={darkMode}/>
      <LadderPrompts enabled={enabled} setPrompt={setPrompt} />
      <ArenaWalls />
      {darkMode && houseDefs.map(h => (
        <pointLight
          key={h.id}
          position={(h as any).interiorLight}
          intensity={0.9}
          distance={10}
          color={"#ffd27a"}
        />
      ))}
    </group>
    
  );
}

function Trees({
  darkMode,
  houseDefs,
}: {
  darkMode: boolean;
  houseDefs: { id: string; x: number; z: number }[];
}) {
  // house footprint (match House): 8×8 with a little padding
  const baseW = 8, baseD = 8, pad = 1.2;

  const isInsideAnyHouse = (tx: number, tz: number) => {
    for (const h of houseDefs) {
      const withinX = Math.abs(tx - h.x) <= baseW / 2 + pad;
      const withinZ = Math.abs(tz - h.z) <= baseD / 2 + pad;
      if (withinX && withinZ) return true;
    }
    return false;
  };

  const trees: JSX.Element[] = [];
  const fixed: [number, number][] = [[-3,-6],[6,-3],[-6,5],[4,-8]];
  const radius = 20;
  const ring: [number, number][] = Array.from({ length: 18 }, (_, i) => {
    const a = (i / 18) * Math.PI * 2;
    return [Math.cos(a) * radius, Math.sin(a) * radius];
  });

  [...fixed, ...ring].forEach(([x, z], i) => {
    if (isInsideAnyHouse(x, z)) return; // 👈 skip if inside a house footprint
    trees.push(<Tree key={`tree-${i}`} position={[x, 0, z]} darkMode={darkMode} />);
  });

  return <group>{trees}</group>;
}


function Tree({ position = [0,0,0] as [number,number,number], darkMode }: { position:[number,number,number], darkMode:boolean }) {
  const trunk = "#8b5a2b";
  const leaf1 = darkMode ? "#013220" : "#2fad4e"; // darker in night
  const leaf2 = darkMode ? "#022d1c" : "#27a046";

  return (
    <group position={position}>
      <mesh position={[0,1,0]}>
        <boxGeometry args={[0.6,2,0.6]} />
        <meshBasicMaterial color={trunk} />
      </mesh>
      <mesh position={[0,2.4,0]}>
        <boxGeometry args={[2,1.2,2]} />
        <meshBasicMaterial color={leaf1} />
      </mesh>
      <mesh position={[0,3.3,0]}>
        <boxGeometry args={[1.4,1,1.4]} />
        <meshBasicMaterial color={leaf2} />
      </mesh>
    </group>
  );
}


function Houses({
  darkMode,
  defs,
}: {
  darkMode: boolean;
  defs: { id: string; x: number; z: number }[];
}) {
  return (
    <group>
      {defs.map((h) => (
        <House key={h.id} position={[h.x, 0, h.z]} darkMode={darkMode} />
      ))}
    </group>
  );
}
function House({
  position = [0,0,0] as [number,number,number],
  darkMode,
}: {
  position: [number,number,number];
  darkMode: boolean;
}) {
  const plank = useMemo(()=>makePlankTexture(),[]);
  const brick = useMemo(()=>makeBrickTexture(),[]);
  const baseW=8, baseH=4.4, baseD=8;
  const centerY = baseH/2;
  const ridgeY = baseH;

  return (
    <group position={position}>
      {/* base */}
      <mesh position={[0,centerY,0]}>
        <boxGeometry args={[baseW,baseH,baseD]} />
        <meshBasicMaterial map={brick} />
      </mesh>

      {/* door + window (window glows at night) */}
      <mesh position={[0,1.2,baseD/2+0.01]}>
        <planeGeometry args={[1.8,2.4]} />
        <meshBasicMaterial map={plank} />
      </mesh>
      <mesh position={[baseW/3.1,2.6,baseD/2+0.01]}>
        <planeGeometry args={[1.4,1.0]} />
        <meshBasicMaterial color={darkMode ? "#ffe599" : "#a3e7ff"} />
      </mesh>

      {/* flat roof slab for walkable top */}
      <mesh position={[0, ridgeY + 0.2, 0]}>
        <boxGeometry args={[baseW+0.6, 0.4, baseD+0.6]} />
        <meshBasicMaterial map={plank} />
      </mesh>

      {/* ladder on front face */}
      <group position={[baseW*0.35, 1.6, baseD/2 + 0.02]}>
        <mesh position={[-0.35, 0.0, 0]}>
          <boxGeometry args={[0.12, 3.0, 0.06]} />
          <meshBasicMaterial map={plank} />
        </mesh>
        <mesh position={[ 0.35, 0.0, 0]}>
          <boxGeometry args={[0.12, 3.0, 0.06]} />
          <meshBasicMaterial map={plank} />
        </mesh>
        {Array.from({length:7}).map((_,i)=> (
          <mesh key={i} position={[0, -1.4 + i*(3.0/6), 0]}>
            <boxGeometry args={[0.7, 0.08, 0.06]} />
            <meshBasicMaterial map={plank} />
          </mesh>
        ))}
      </group>
    </group>
  );
}


function ParkourBoxes(){
  const plank = useMemo(()=>makePlankTexture(),[]);
  const defs = useMemo(()=>getParkourDefs(),[]);
  const top = defs[defs.length-1];

  // pulsing ring to show interactivity (no DOM)
  const ringRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ringRef.current) return;
    const s = 1 + Math.sin(clock.getElapsedTime() * 3) * 0.08;
    ringRef.current.scale.set(s, 1, s);
  });

  return (
    <group>
      {defs.map((b,i)=> (
        <mesh key={i} position={[b.x, b.h/2, b.z]}>
          <boxGeometry args={[b.w, b.h, b.d]} />
          <meshBasicMaterial map={plank} />
        </mesh>
      ))}
      {top && (
        <group position={[top.x, top.h + 0.25, top.z]}>
          <mesh>
            <cylinderGeometry args={[0.45,0.45,0.2,20]} />
            <meshBasicMaterial color="#f59e0b" />
          </mesh>
          <mesh ref={ringRef} position={[0,0.02,0]}>
            <torusGeometry args={[0.65, 0.05, 10, 40]} />
            <meshBasicMaterial color="#fde68a" />
          </mesh>
        </group>
      )}
    </group>
  );
}

function Cloud({ position=[0,0,0] as [number,number,number], darkMode }: { position:[number,number,number]; darkMode:boolean }){
  const cloud = darkMode ? "#d1d5db" : "#ffffff"; // grey at night
  return (
    <group position={position}>
      {[[0,0,0],[1.2,0.3,0.4],[-1,0.2,-0.4],[0.2,-0.1,0.9]].map((o,i)=>(
        <mesh key={i} position={[o[0],o[1],o[2]]}>
          <boxGeometry args={[2,1,1]} />
          <meshBasicMaterial color={cloud} />
        </mesh>
      ))}
    </group>
  );
}


function CloudField({ darkMode }: { darkMode: boolean }){
  const groups: JSX.Element[] = [];
  const ringRadius = 14, ringCount=12;
  for(let i=0;i<ringCount;i++){ 
    const ang=(i/ringCount)*Math.PI*2; 
    groups.push(<Cloud key={"ring"+i} position={[Math.cos(ang)*ringRadius, CLOUD_ALT, Math.sin(ang)*ringRadius]} darkMode={darkMode} />); 
  }
  const grid=[-2,-1,0,1,2];
  grid.forEach(gx=>grid.forEach(gz=>{
    if(gx===0&&gz===0) return; 
    const x=gx*10+(gx%2===0?2:-2); 
    const z=gz*12+(gz%2===0?-2:2); 
    const y=CLOUD_ALT+(((gx+gz+5)%3)-1); 
    groups.push(<Cloud key={`grid-${gx}-${gz}`} position={[x,y,z]} darkMode={darkMode} />);
  }));
  return <group>{groups}</group>;
}
function LadderPrompts({enabled,setPrompt}: {enabled: boolean;setPrompt: (s: string | null) => void;}) {
  // These must match your Houses layout:
  const houses: [number, number][] = [[-16,-12],[16,-10],[-14,14],[14,14]];
  const baseW = 8, baseD = 8;
  const ld = 0.5;

  return (
    <group>
      {houses.map(([x,z], i) => {
        // this mirrors where you built the climb AABB:
        const lx = x + baseW * 0.35;
        const lz = z + baseD/2 + ld/2 + 0.02;
        return (
          <InteractAtPoint
          key={`ladder-${i}`}
          target={new THREE.Vector3(lx, 1.4, lz)}     // ✅ correct prop
          enabled={enabled}                      // or just `true` if you prefer
          range={1.8}
          keyName="f"                                 // ✅ correct prop
          label="Press F to climb ladder"
          onTrigger={() => {}}
          setPrompt={setPrompt}            
          />
        );
      })}
    </group>
  );
}
function DoorPrompts({
  enabled, houseDefs, setPrompt, setInside, insideId,
}: {
  enabled: boolean;
  houseDefs: {id:string; doorWorld: THREE.Vector3; insideSpawn: THREE.Vector3}[];
  setPrompt: (s: string | null) => void;
  setInside: (id: string | null) => void;
  insideId: string | null;
}) {
  return (
    <group>
      {houseDefs.map(h => {
        if (!h.doorWorld || !h.insideSpawn) return null; // safety
        return (
          <InteractAtPoint
            key={`door-${h.id}`}
            target={new THREE.Vector3(h.doorWorld.x, 1.4, h.doorWorld.z)}            // ✅ real Vector3, ready on first render
            enabled={enabled}
            keyName="q"
            range={2.6}
            label={insideId === h.id ? "Press Q to Exit" : "Press Q to Enter"}
            onTrigger={() => {
              const goingIn = insideId !== h.id;
              if (goingIn) {
                setInside(h.id);
                window.dispatchEvent(new CustomEvent("teleport-to", {
                  detail: { x: h.insideSpawn.x, y: h.insideSpawn.y, z: h.insideSpawn.z }
                }));
              } else {
                setInside(null);
                const out = h.doorWorld.clone(); out.y = 1.6; out.z += 0.6;
                window.dispatchEvent(new CustomEvent("teleport-to", {
                  detail: { x: out.x, y: out.y, z: out.z }
                }));
              }
            }}
            setPrompt={setPrompt}
          />
        );
      })}
    </group>
  );
}

/* Tall perimeter walls to keep players in-bounds */
function ArenaWalls(){
  const brick = useMemo(()=>makeBrickTexture(),[]);
  const H = ARENA_HALF; const wallH = 10; const thick=0.6; const span = H*2+2;
  return (
    <group>
      {/* +X wall */}
      <mesh position={[ H+thick/2, wallH/2, 0 ]}>
        <boxGeometry args={[thick, wallH, span]} />
        <meshBasicMaterial map={brick} />
      </mesh>
      {/* -X wall */}
      <mesh position={[ -H-thick/2, wallH/2, 0 ]}>
        <boxGeometry args={[thick, wallH, span]} />
        <meshBasicMaterial map={brick} />
      </mesh>
      {/* +Z wall */}
      <mesh position={[ 0, wallH/2, H+thick/2 ]}>
        <boxGeometry args={[span, wallH, thick]} />
        <meshBasicMaterial map={brick} />
      </mesh>
      {/* -Z wall */}
      <mesh position={[ 0, wallH/2, -H-thick/2 ]}>
        <boxGeometry args={[span, wallH, thick]} />
        <meshBasicMaterial map={brick} />
      </mesh>
    </group>
  );
}
function InteriorShell({
  x, z,
  baseW = 8,
  baseD = 8,
  baseH = 4.4,
  inset = 0.08,
}: {
  x: number; z: number;
  baseW?: number; baseD?: number; baseH?: number; inset?: number;
}) {
  // reuse your existing brick texture so the inside matches
  const brickTex = useMemo(() => makeBrickTexture(), []);
  const floorTex = useMemo(() => makeFloorWoodTexture(), []);
  // FLOOR (slightly lifted so it doesn’t z-fight with outside ground)
  return (
    <group>
      <mesh position={[x, 0.01, z]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[baseW - 0.2, baseD - 0.2]} />
        <meshBasicMaterial map={floorTex} />
      </mesh>


      {/* BACK WALL (inside face toward the room) */}
      <mesh position={[x, baseH / 2, z - (baseD / 2 - inset)]} rotation={[0, 0, 0]}>
        <planeGeometry args={[baseW - 2 * inset, baseH]} />
        <meshBasicMaterial map={brickTex} side={THREE.FrontSide} />
      </mesh>

      {/* FRONT WALL — leave a "door" hole (~2.2 m wide) by composing two planes */}
      <group position={[x, baseH / 2, z + (baseD / 2 - inset)]} rotation={[0, Math.PI, 0]}>
        {/* left chunk */}
        <mesh position={[-(baseW/2 - inset)/2 - 1.1, 0, 0]}>
          <planeGeometry args={[ (baseW - 2*inset) - 2.2, baseH ]} />
          <meshBasicMaterial map={brickTex} />
        </mesh>
        {/* right chunk */}
        <mesh position={[ (baseW/2 - inset)/2 + 1.1, 0, 0]}>
          <planeGeometry args={[ (baseW - 2*inset) - 2.2, baseH ]} />
          <meshBasicMaterial map={brickTex} />
        </mesh>
      </group>

      {/* LEFT WALL */}
      <mesh position={[x - (baseW / 2 - inset), baseH / 2, z]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[baseD - 2 * inset, baseH]} />
        <meshBasicMaterial map={brickTex} />
      </mesh>

      {/* RIGHT WALL */}
      <mesh position={[x + (baseW / 2 - inset), baseH / 2, z]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[baseD - 2 * inset, baseH]} />
        <meshBasicMaterial map={brickTex} />
      </mesh>

      {/* CEILING (optional) */}
      <mesh position={[x, baseH - 0.02, z]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[baseW - 2 * inset, baseD - 2 * inset]} />
        <meshBasicMaterial color={0x505050} />
      </mesh>
    </group>
  );
}
function DeskAndLamp({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      {/* ---- Desk: body + top ---- */}
      {/* body (0.5 high) => top at 0.5 */}
      <mesh position={[DESK.cx, 0.25, DESK.cz]}>
        <boxGeometry args={[DESK.w, 0.5, DESK.d]} />
        <meshBasicMaterial color="#654321" />
      </mesh>
      {/* top slab (0.1 high), sits on body => center at 0.55 */}
      <mesh position={[DESK.cx, 0.55, DESK.cz]}>
        <boxGeometry args={[DESK.w, 0.1, DESK.d]} />
        <meshBasicMaterial color="#8B5A2B" />
      </mesh>

      {/* ---- Lamp (grounded on desk top) ---- */}
      {/* stand: 0.4 high => center 0.55 + 0.2 = 0.75 */}
      <mesh position={[DESK.cx, 0.75, DESK.cz]}>
        <cylinderGeometry args={[0.05, 0.05, 0.4, 12]} />
        <meshBasicMaterial color="gray" />
      </mesh>
      {/* shade: 0.3 high; base sits at stand top (0.95) => center 1.10 */}
      <mesh position={[DESK.cx, 1.10, DESK.cz]}>
        <coneGeometry args={[0.25, 0.3, 16]} />
        <meshStandardMaterial emissive="yellow" color="white" />
      </mesh>
      <pointLight position={[DESK.cx, 1.10, DESK.cz]} intensity={0.6} distance={5} />

      {/* ---- Bed along right wall ---- */}
      {/* frame: 0.4 high => center 0.2 */}
      <mesh position={[BED.cx, 0.2, BED.cz]}>
        <boxGeometry args={[BED.w, 0.4, BED.d]} />
        <meshBasicMaterial color="#5b3b2a" />
      </mesh>
      {/* mattress: 0.2 high; sits on frame => center 0.5 */}
      <mesh position={[BED.cx, 0.5, BED.cz]}>
        <boxGeometry args={[BED.w * 0.98, 0.2, BED.d * 0.96]} />
        <meshBasicMaterial color="#dfe7f1" />
      </mesh>
      {/* pillow */}
      <mesh position={[BED.cx + BED.w/2 - 0.35, 0.62, BED.cz]}>
        <boxGeometry args={[0.6, 0.12, 0.35]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      {/* blanket */}
      <mesh position={[BED.cx - 0.2, 0.58, BED.cz]}>
        <boxGeometry args={[BED.w*0.7, 0.06, BED.d*0.95]} />
        <meshBasicMaterial color="#3b82f6" />
      </mesh>
    </group>
  );
}



function HouseInteriors({
  enabled,
  houseDefs,
  setPrompt,
  setExhibit,
  insideId,
}: {
  enabled: boolean;
  houseDefs: { id: string; x: number; z: number }[];
  setPrompt: (s: string | null) => void;
  setExhibit: (v: { img: string; caption: string } | null) => void;
  insideId: string | null;
}) {
  const frameTex = useMemo(() => makePlankTexture(), []);
  const baseW = 8, baseD = 8, baseH = 4.4;

  const exhibits = [
    { id: "house-0", img: "images/imageme1.jpeg",    caption: "Me, IRL." },
    { id: "house-1", img: "images/imagejetbot1.jpeg", caption: "Jetbot build." },
    { id: "house-2", img: "images/imagelidar1.jpeg",  caption: "LIDAR project." },
    { id: "house-3", img: "images/imagesnake1.jpg",   caption: "C++ Snake." },
  ];

  return (
    <group>
      {houseDefs.map((h, i) => {
        const active = insideId === h.id;                 // only draw interior of current house
        const ex = exhibits[i % exhibits.length];

        // picture on the BACK wall, slightly off the wall
        const picCenter = new THREE.Vector3(h.x, 2.0, h.z - (baseD / 2 - 0.10));
        const picLookPos = picCenter.clone().add(new THREE.Vector3(0, 0, 0.8));

        return (
          <group key={`interior-${h.id}`}>
            {/* Interior shell only when inside THIS house */}
            {active && <InteriorShell x={h.x} z={h.z} baseW={baseW} baseD={baseD} baseH={baseH} />}
            <InteriorPicture
              img={ex.img}
              frameTex={frameTex}
              position={[picCenter.x, picCenter.y, picCenter.z]}
            />

            {/* Interact to view image (only when inside this house) */}
            <InteractAtPoint
              target={picLookPos}
              enabled={enabled && active}
              keyName="e"
              range={2.2}
              label={"Press E to view"}
              onTrigger={() => setExhibit({ img: asset(ex.img), caption: ex.caption })}
              setPrompt={setPrompt}
            />
            {active && <DeskAndLamp x={h.x} z={h.z} />}
          </group>
        );
      })}
    </group>
  );
}

function InteriorPicture({
  img, frameTex, position
}: {
  img: string;
  frameTex: THREE.Texture;
  position: [number, number, number];
}) {
  const tex = useLoader(THREE.TextureLoader, asset(img));
  return (
    <group position={position}>
      <mesh position={[0, 0, 0.02]}>
        <boxGeometry args={[2.6, 1.9, 0.08]} />
        <meshBasicMaterial map={frameTex} />
      </mesh>
      <mesh>
        <planeGeometry args={[2.3, 1.6]} />
        <meshBasicMaterial map={tex} />
      </mesh>
    </group>
  );
}

/* ---------- Grounded Whiteboards (with poles) ---------- */
function GroundedWhiteboards({
  setActiveBoard,
  darkMode,
  setPrompt,
}: {
  setActiveBoard: (id: string) => void;
  darkMode: boolean;
  setPrompt: (s: string | null) => void;
}) {
  const squareSize = 9.5;
  const positions: [number, number, number][] = [
    [ squareSize, BOARD_ALT, 0],
    [ 0,          BOARD_ALT,-squareSize],
    [-squareSize, BOARD_ALT, 0],
    [ 0,          BOARD_ALT, squareSize],
  ];
  const rotations: [number, number, number][] = [
    [0, -Math.PI / 2, 0],
    [0,  0,           0],
    [0,  Math.PI / 2, 0],
    [0,  Math.PI,     0],
  ];

  return (
    <group>
      {WHITEBOARD_CONFIG.map((cfg, i) => {
        const pos = positions[i];
        const rot = rotations[i];

        // compute a point ~1.4m in front of the board (world space)
        const forward = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(0, rot[1], 0));
        const interactPos = new THREE.Vector3(pos[0], pos[1], pos[2])
          .add(forward.clone().multiplyScalar(1.4));
        interactPos.y = pos[1]; // keep prompt at board height

        return (
          <group key={cfg.id}>
            <GroundedBoard
              position={pos}
              rotation={rot}
              config={cfg}
              darkMode={darkMode}
            />

            <InteractAtPoint
              target={interactPos}
              enabled={true}
              range={2.2}
              label={`Press E to open ${cfg.title}`}
              onTrigger={() => setActiveBoard(cfg.id)}
              setPrompt={setPrompt}
            />
          </group>
        );
      })}
    </group>
  );
}

function GroundedBoard({ position, rotation, config, darkMode}: { position:[number,number,number]; rotation:[number,number,number]; config:(typeof WHITEBOARD_CONFIG)[0]; darkMode: boolean; }){
  const plank = useMemo(()=>makePlankTexture(),[]);
  const banner = useMemo(() => makeCenterBannerTextureThemed(config.title, darkMode), [config.title, darkMode]);
  const W=7.5, H=3.4, D=0.6; // wood core size
  const poleHeight = position[1]-0.1;
  return (
    <group position={position} rotation={rotation}>
      {/* wood core */}
      <mesh>
        <boxGeometry args={[W, H, D]} />
        <meshBasicMaterial map={plank} />
      </mesh>
      {/* clickable front banner */}
      <mesh position={[0,0,D/2+0.01]}>
        <planeGeometry args={[W*0.97, H*0.95]} />
        <meshBasicMaterial key={darkMode ? "dark" : "light"} map={banner} />
      </mesh>
      {/* large invisible hit area */}
      <mesh position={[0,0,D/2+0.2]}>
        <planeGeometry args={[W*1.2,H*1.2]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
      {/* poles + feet */}
      <mesh position={[ W*0.33,-poleHeight/2,0]}><boxGeometry args={[0.15,poleHeight,0.15]} /><meshBasicMaterial color="#334155" /></mesh>
      <mesh position={[-W*0.33,-poleHeight/2,0]}><boxGeometry args={[0.15,poleHeight,0.15]} /><meshBasicMaterial color="#334155" /></mesh>
      <mesh position={[ W*0.33,-poleHeight,0]}><boxGeometry args={[0.8,0.25,1.3]} /><meshBasicMaterial color="#111827" /></mesh>
      <mesh position={[-W*0.33,-poleHeight,0]}><boxGeometry args={[0.8,0.25,1.3]} /><meshBasicMaterial color="#111827" /></mesh>
    </group>
  );
}

/* ---------- Optimized + Reliable ThickSkySign ---------- */
function ThickSkySign({
  text,
  rgbActive,
  darkMode,
}: {
  text: string;
  rgbActive: boolean;
  darkMode: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const texRef = useRef<THREE.CanvasTexture | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const phaseRef = useRef(0);

  // --- one-shot spin state ---
  const spinning = useRef(false);
  const spinStart = useRef(0);
  const spinDuration = useRef(1200); // ms
  const baseRotation = useRef(0);

  // spin trigger
  useEffect(() => {
    const startSpin = () => {
      if (!groupRef.current) return;
      spinning.current = true;
      spinStart.current = performance.now();
      baseRotation.current =
        ((groupRef.current.rotation.y % (Math.PI * 2)) + Math.PI * 2) %
        (Math.PI * 2);
    };
    window.addEventListener("spin-banner", startSpin as any);
    return () => window.removeEventListener("spin-banner", startSpin as any);
  }, []);

  // init canvas + texture once
  if (!canvasRef.current) {
    const canvas = document.createElement("canvas");
    canvas.width = 2048;
    canvas.height = 900;
    canvasRef.current = canvas;
    ctxRef.current = canvas.getContext("2d");
    texRef.current = new THREE.CanvasTexture(canvas);
    texRef.current.anisotropy = 8;
    texRef.current.needsUpdate = true;
  }

  // draw routine
  const drawBanner = (phase: number) => {
    const canvas = canvasRef.current!;
    const ctx = ctxRef.current!;

    // background wood
    ctx.fillStyle = "#7b4f28";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // noise speckles
    for (let i = 0; i < 500; i++) {
      ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.2})`;
      ctx.fillRect(
        Math.random() * canvas.width,
        Math.random() * canvas.height,
        10,
        10
      );
    }

    // top green band
    if (darkMode) {
      ctx.fillStyle = "#1d3b2a";
      ctx.fillRect(0, 0, canvas.width, canvas.height * 0.25);
      ctx.fillStyle = "#245a38";
      ctx.fillRect(0, 0, canvas.width, canvas.height * 0.18);
    } else {
      ctx.fillStyle = "#2e7d32";
      ctx.fillRect(0, 0, canvas.width, canvas.height * 0.25);
      ctx.fillStyle = "#4caf50";
      ctx.fillRect(0, 0, canvas.width, canvas.height * 0.18);
    }

    // frame
    ctx.lineWidth = 40;
    ctx.strokeStyle = darkMode ? "#0b1220" : "#0f172a";
    ctx.strokeRect(0, 0, canvas.width, canvas.height);

    // RGB border
    if (rgbActive) {
      const seg = 32;
      const perim = 2 * (canvas.width + canvas.height);
      for (let p = 0; p < perim; p += seg) {
        const hue = ((p / perim) * 360 + phase * 180) % 360;
        ctx.strokeStyle = `hsl(${hue},100%,60%)`;
        ctx.lineWidth = 60;

        let s = p,
          e = Math.min(p + seg, perim);
        const drawEdge = (x1: number, y1: number, x2: number, y2: number) => {
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        };

        while (s < e) {
          let x1 = 0,
            y1 = 0,
            x2 = 0,
            y2 = 0;
          let left = e - s;

          if (s < canvas.width) {
            const d1 = Math.min(left, canvas.width - s);
            x1 = s;
            y1 = 0;
            x2 = s + d1;
            y2 = 0;
            drawEdge(x1, y1, x2, y2);
            s += d1;
            continue;
          }
          if (s < canvas.width + canvas.height) {
            const k = s - canvas.width;
            const d1 = Math.min(left, canvas.height - k);
            x1 = canvas.width;
            y1 = k;
            x2 = canvas.width;
            y2 = k + d1;
            drawEdge(x1, y1, x2, y2);
            s += d1;
            continue;
          }
          if (s < canvas.width * 2 + canvas.height) {
            const k = s - (canvas.width + canvas.height);
            const d1 = Math.min(left, canvas.width - k);
            x1 = canvas.width - k;
            y1 = canvas.height;
            x2 = canvas.width - (k + d1);
            y2 = canvas.height;
            drawEdge(x1, y1, x2, y2);
            s += d1;
            continue;
          }
          {
            const k = s - (canvas.width * 2 + canvas.height);
            const d1 = Math.min(left, canvas.height - k);
            x1 = 0;
            y1 = canvas.height - k;
            x2 = 0;
            y2 = canvas.height - (k + d1);
            drawEdge(x1, y1, x2, y2);
            s += d1;
            continue;
          }
        }
      }
    }

    // text
    ctx.fillStyle = darkMode ? "#000000" : "#ffffff";
    ctx.font = "900 150px 'Press Start 2P', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text.toUpperCase(), canvas.width / 2, canvas.height / 2 + 10);

    texRef.current!.needsUpdate = true;
  };

  // animate
  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();

    // float
    groupRef.current.position.y = TITLE_ALT + Math.sin(t * 0.35) * 0.12;

    // RGB border animation
    if (rgbActive) {
      phaseRef.current += 0.01;
      drawBanner(phaseRef.current);
    }

    // spin
    if (spinning.current) {
      const now = performance.now();
      const u = Math.min((now - spinStart.current) / spinDuration.current, 1);
      const eased = 1 - Math.pow(1 - u, 3);
      groupRef.current.rotation.y =
        baseRotation.current + eased * (Math.PI * 2);
      if (u >= 1) {
        spinning.current = false;
        groupRef.current.rotation.y = baseRotation.current + Math.PI * 2;
      }
    }
  });

  // initial draw
  useEffect(() => {
    drawBanner(phaseRef.current);
  }, [text, rgbActive, darkMode]);

  return (
    <group ref={groupRef} position={[0, TITLE_ALT, 0]}>
      <mesh>
        <boxGeometry args={[12, 4.5, 0.7]} />
        <meshBasicMaterial map={makePlankTexture()} />
      </mesh>

      {/* front face */}
      <mesh position={[0, 0, 0.36]}>
        <planeGeometry args={[11.8, 4.3]} />
        <meshBasicMaterial
          key={darkMode ? "dark" : "light"}
          map={texRef.current!}
        />
      </mesh>

      {/* back face */}
      <mesh position={[0, 0, -0.36]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[11.8, 4.3]} />
        <meshBasicMaterial
          key={darkMode ? "dark" : "light"}
          map={texRef.current!}
        />
      </mesh>
    </group>
  );
}


/* ---------- Texture Helpers ---------- */
function makeFloorWoodTexture(){
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 1024;
  const ctx = c.getContext("2d")!;

  // Base wood
  ctx.fillStyle = "#a07443";
  ctx.fillRect(0, 0, c.width, c.height);

  // Long planks across the X axis
  const rows = 14;
  for (let r = 0; r < rows; r++) {
    const y = (r * c.height) / rows;
    ctx.fillStyle = r % 2 ? "#8a6236" : "#b8834f";
    ctx.fillRect(0, y, c.width, c.height / rows - 2);

    // subtle grain lines
    ctx.strokeStyle = "rgba(0,0,0,0.08)";
    ctx.lineWidth = 2;
    for (let k = 0; k < 5; k++) {
      ctx.beginPath();
      ctx.moveTo(0, y + (k + 1) * (c.height / rows) / 6);
      ctx.lineTo(c.width, y + (k + 1) * (c.height / rows) / 6);
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2.5, 2.5); // tweak tiling
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

function makeCenterBannerTextureThemed(text: string, darkMode: boolean){
  const canvas = document.createElement('canvas'); canvas.width = 2048; canvas.height = 900;
  const ctx = canvas.getContext('2d')!;

  // wood base (same)
  ctx.fillStyle = "#7b4f28"; ctx.fillRect(0,0,canvas.width,canvas.height);
  for (let i=0;i<500;i++){ ctx.fillStyle = `rgba(0,0,0,${Math.random()*0.2})`;
    ctx.fillRect(Math.random()*canvas.width, Math.random()*canvas.height, 10,10);
  }

  // top band — darker in dark mode
  if (darkMode){
    ctx.fillStyle="#1d3b2a"; ctx.fillRect(0,0,canvas.width,canvas.height*0.25);
    ctx.fillStyle="#245a38"; ctx.fillRect(0,0,canvas.width,canvas.height*0.18);
  } else {
    ctx.fillStyle="#2e7d32"; ctx.fillRect(0,0,canvas.width,canvas.height*0.25);
    ctx.fillStyle="#4caf50"; ctx.fillRect(0,0,canvas.width,canvas.height*0.18);
  }

  // frame
  ctx.lineWidth = 40;
  ctx.strokeStyle = darkMode ? "#0b1220" : "#0f172a";
  ctx.strokeRect(0,0,canvas.width,canvas.height);

  // text
  ctx.fillStyle = darkMode ? "#000000" : "#ffffff";
  ctx.font = "900 200px 'Press Start 2P', monospace";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text.toUpperCase(), canvas.width/2, canvas.height/2+10);

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 8; texture.needsUpdate = true;
  return texture;
}

function makeVoxelGroundTexture(darkMode = false){
  const size=256; 
  const c=document.createElement("canvas"); 
  c.width=size; c.height=size; 
  const ctx=c.getContext("2d")!;

  const base = darkMode ? "#204d2c" : "#4caf50";
  const speckMin = darkMode ? "rgba(5,30,15," : "rgba(20,100,40,";
  
  ctx.fillStyle=base; 
  ctx.fillRect(0,0,size,size);

  for(let i=0;i<1200;i++){ 
    ctx.fillStyle=`${speckMin}${0.6+Math.random()*0.4})`; 
    const x=Math.random()*size; 
    const y=Math.random()*size; 
    ctx.fillRect(x,y,1+Math.random()*2,1+Math.random()*2); 
  }

  const tex=new THREE.CanvasTexture(c); 
  tex.wrapS=tex.wrapT=THREE.RepeatWrapping; 
  tex.repeat.set(40,40); 
  tex.anisotropy=8; 
  tex.needsUpdate=true; 
  return tex;
}


function makePlankTexture(){
  const c=document.createElement("canvas"); c.width=512; c.height=512; const ctx=c.getContext("2d")!;
  ctx.fillStyle="#a07443"; ctx.fillRect(0,0,512,512);
  for(let i=0;i<12;i++){ const y=i*(512/12); ctx.fillStyle=i%2?"#8a6236":"#b8834f"; ctx.fillRect(0,y,512,512/12); }
  ctx.strokeStyle="#5c3b22"; ctx.lineWidth=8; for(let i=0;i<=8;i++){ const x=i*(512/8); ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,512); ctx.stroke(); }
  const tex=new THREE.CanvasTexture(c); tex.wrapS=tex.wrapT=THREE.RepeatWrapping; tex.repeat.set(1,1); tex.anisotropy=8; tex.needsUpdate=true; return tex;
}

function makeBrickTexture(){
  const c=document.createElement("canvas"); c.width=512; c.height=512; const ctx=c.getContext("2d")!;
  ctx.fillStyle="#b4553d"; ctx.fillRect(0,0,512,512);
  const rows=12, cols=16; ctx.fillStyle="#8c3f2c"; for(let r=0;r<rows;r++){ for(let col=0;col<cols;col++){ const off=(r%2)*16; ctx.fillRect(col*32+off, r*32, 26,26); }}
  const tex=new THREE.CanvasTexture(c); tex.wrapS=tex.wrapT=THREE.RepeatWrapping; tex.repeat.set(1,1); tex.anisotropy=8; tex.needsUpdate=true; return tex;
}
