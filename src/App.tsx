import { useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import type { HouseDef } from "./types";
import { IS_TOUCH, getTopButtonPos, setInteriorBlockers, makeInteriorAABBs, makeBedAABB, makeDeskAABB } from "./constants";
import { WHITEBOARD_CONFIG } from "./constants/boards";
import { TitleScreen, ImageModal } from "./components/ui/Modals";
import { WhiteboardModal } from "./components/ui/WhiteboardModal";
import { TouchControls, MobileMuteButton } from "./components/ui/TouchControls";
import { BackgroundMusic } from "./components/BackgroundMusic";
import { Crosshair, MouseLookControls, MovementControls, InteractAtPoint } from "./components/controls/Controls";
import { World, GroundedWhiteboards, ThickSkySign, HouseInteriors, DoorPrompts } from "./components/world/WorldComponents";

export default function App() {
  const [started, setStarted] = useState(false);
  const [lowSpec, setLowSpec] = useState(false);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [activeBoard, setActiveBoard] = useState<string | null>(null);
  const [rgbBorder, setRgbBorder] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [insideHouseId, setInsideHouseId] = useState<string | null>(null);
  const [exhibit, setExhibit] = useState<{ img: string; caption: string } | null>(null);
  const [houseDefs, setHouseDefs] = useState<HouseDef[]>([]);
  const topBtnPos = useMemo(() => getTopButtonPos(), []);
  const skyGradient = darkMode ? "linear-gradient(#0b1220, #111827)" : "linear-gradient(#87ceeb, #1e90ff)";

  useEffect(() => {
    const anyModal = !!activeBoard;
    if (anyModal && document.pointerLockElement) document.exitPointerLock();
    document.body.style.cursor = anyModal ? "auto" : "none";
    return () => {
      if (!anyModal) document.body.style.cursor = "none";
    };
  }, [activeBoard]);

  useEffect(() => {
    if (!insideHouseId) {
      setInteriorBlockers([]);
      return;
    }
    const h = houseDefs.find((hh) => hh.id === insideHouseId);
    if (!h) {
      setInteriorBlockers([]);
      return;
    }
    setInteriorBlockers([...makeInteriorAABBs(h), makeBedAABB(h.x, h.z), makeDeskAABB(h.x, h.z)]);
  }, [insideHouseId, houseDefs]);

  useEffect(() => {
    const onToggle = () => setRgbBorder((v) => !v);
    window.addEventListener("toggle-rgb-border", onToggle as any);
    return () => window.removeEventListener("toggle-rgb-border", onToggle as any);
  }, []);

  useEffect(() => {
    const onToggle = () => setDarkMode((v) => !v);
    window.addEventListener("toggle-dark-mode", onToggle as any);
    return () => window.removeEventListener("toggle-dark-mode", onToggle as any);
  }, []);

  const closeAndRelock = () => {
    setActiveBoard(null);
    setTimeout(() => window.dispatchEvent(new CustomEvent("relock-pointer")), 0);
  };

  if (!started) {
    return (
      <TitleScreen
        onContinue={() => {
          setLowSpec(IS_TOUCH ? true : false);
          setStarted(true);
        }}
        onLiteMode={() => {
          setLowSpec(true);
          setStarted(true);
        }}
      />
    );
  }

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden" }}>
      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", background: skyGradient }} />

      {!activeBoard && !IS_TOUCH && (
        <div
          style={{
            position: "fixed",
            top: 10,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(0,0,0,0.5)",
            color: "#fff",
            padding: "8px 12px",
            borderRadius: 10,
            zIndex: 10,
            fontSize: 14,
          }}
        >
          Click to lock · WASD · Space jump · F ladder · E gold button · Q enter/exit · Shift sprint · M mute
        </div>
      )}
      {!activeBoard && IS_TOUCH && (
        <div
          style={{
            position: "fixed",
            top: 10,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(0,0,0,0.45)",
            color: "#fff",
            padding: "6px 10px",
            borderRadius: 10,
            zIndex: 10,
            fontSize: 12,
          }}
        >
          Left pad: move (push further = run) · Right pad: look · Buttons: Jump / Interact / Enter-Exit
        </div>
      )}

      <BackgroundMusic lightSrc="audio/bg.mp3" darkSrc="audio/night.mp3" darkMode={darkMode} maxVolume={0.6} />

      {prompt && (
        <div
          style={{
            position: "fixed",
            left: "50%",
            top: 10,
            transform: "translateX(-50%)",
            background: "rgba(30,41,59,0.85)",
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

      <Canvas
        camera={{ fov: IS_TOUCH ? 78 : 70, position: [0, 1.6, 6] }}
        dpr={lowSpec || IS_TOUCH ? [1, 1] : [1, 1.5]}
        gl={{
          antialias: !(lowSpec || IS_TOUCH),
          powerPreference: lowSpec || IS_TOUCH ? "low-power" : "high-performance",
          alpha: true,
          stencil: false,
          preserveDrawingBuffer: false,
        }}
        onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
      >
        <ambientLight intensity={lowSpec ? 0.6 : 0.7} />
        <directionalLight position={[8, 20, 10]} intensity={lowSpec ? 0.8 : 1} />

        <World
          darkMode={darkMode}
          enabled={!activeBoard}
          setPrompt={setPrompt}
          onDefs={setHouseDefs}
          lowSpec={lowSpec}
          insideHouseId={insideHouseId}
        />

        <GroundedWhiteboards setActiveBoard={setActiveBoard} darkMode={darkMode} setPrompt={setPrompt} />

        <ThickSkySign text="WELCOME TO MY WORLD" rgbActive={rgbBorder} darkMode={darkMode} />

        <MouseLookControls enabled={!activeBoard} initialYaw={0} initialPitch={-0.1} />
        <MovementControls enabled={!activeBoard} speed={3.5} insideHouseId={insideHouseId} />
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
          <HouseInteriors
            enabled={!activeBoard}
            houseDefs={houseDefs}
            setPrompt={setPrompt}
            setExhibit={setExhibit}
            insideId={insideHouseId}
            darkMode={darkMode}
          />
        )}
        {houseDefs.length > 0 && (
          <DoorPrompts
            enabled={!activeBoard}
            houseDefs={houseDefs}
            setPrompt={setPrompt}
            setInside={setInsideHouseId}
            insideId={insideHouseId}
          />
        )}
      </Canvas>

      {!activeBoard && <TouchControls enabled={!activeBoard} />}

      {IS_TOUCH && <MobileMuteButton />}

      {exhibit && <ImageModal img={exhibit.img} caption={exhibit.caption} darkMode={darkMode} onClose={() => setExhibit(null)} />}
      {activeBoard && (
        <WhiteboardModal config={WHITEBOARD_CONFIG.find((b) => b.id === activeBoard)!} onClose={closeAndRelock} darkMode={darkMode} />
      )}
    </div>
  );
}
