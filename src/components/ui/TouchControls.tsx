import React, { useEffect, useRef } from "react";
import { IS_TOUCH } from "../../constants";

type Vec2 = { x: number; y: number };

function tc_fire(name: string, detail?: any) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}
function tc_keyDown(key: string) {
  window.dispatchEvent(new KeyboardEvent("keydown", { key } as KeyboardEventInit));
}
function tc_keyUp(key: string) {
  window.dispatchEvent(new KeyboardEvent("keyup", { key } as KeyboardEventInit));
}

export function TouchControls({ enabled }: { enabled: boolean }) {
  if (!IS_TOUCH || !enabled) return null;
  return (
    <div style={tc_wrap}>
      <TC_LeftStick />
      <TC_RightLookPad />
      <TC_ActionBar />
    </div>
  );
}

function TC_LeftStick() {
  const padRef = useRef<HTMLDivElement | null>(null);
  const center = useRef<Vec2>({ x: 0, y: 0 });
  const activeId = useRef<number | null>(null);

  const onStart = (e: TouchEvent) => {
    if (!padRef.current || activeId.current !== null) return;
    const t = e.changedTouches[0];
    activeId.current = t.identifier;
    const r = padRef.current.getBoundingClientRect();
    center.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    e.preventDefault();
  };
  const onMove = (e: TouchEvent) => {
    if (activeId.current === null) return;
    const t = [...e.changedTouches].find((tt) => tt.identifier === activeId.current);
    if (!t) return;
    const dx = t.clientX - center.current.x,
      dy = t.clientY - center.current.y;
    const radius = 60;
    let x = dx / radius,
      y = -dy / radius;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    tc_fire("mobile-joystick", { x, y });
    e.preventDefault();
  };
  const onEnd = (e: TouchEvent) => {
    if (activeId.current === null) return;
    const ended = [...e.changedTouches].some((tt) => tt.identifier === activeId.current);
    if (!ended) return;
    activeId.current = null;
    tc_fire("mobile-joystick", { x: 0, y: 0 });
    e.preventDefault();
  };

  useEffect(() => {
    const el = padRef.current!;
    const add = (n: keyof HTMLElementEventMap, f: any) => el.addEventListener(n, f, { passive: false });
    const rm = (n: keyof HTMLElementEventMap, f: any) => el.removeEventListener(n, f as any);
    add("touchstart", onStart);
    add("touchmove", onMove);
    add("touchend", onEnd);
    add("touchcancel", onEnd);
    return () => {
      rm("touchstart", onStart);
      rm("touchmove", onMove);
      rm("touchend", onEnd);
      rm("touchcancel", onEnd);
    };
  }, []);

  return (
    <div ref={padRef} style={tc_leftPad}>
      <div style={tc_ring} />
      <div style={{ ...tc_ring, width: 70, height: 70, opacity: 0.3 }} />
      <div style={{ ...tc_ring, width: 40, height: 40, opacity: 0.5 }} />
    </div>
  );
}

function TC_RightLookPad() {
  const padRef = useRef<HTMLDivElement | null>(null);
  const last = useRef<Vec2 | null>(null);
  const activeId = useRef<number | null>(null);

  const onStart = (e: TouchEvent) => {
    if (activeId.current !== null) return;
    const t = e.changedTouches[0];
    activeId.current = t.identifier;
    last.current = { x: t.clientX, y: t.clientY };
    e.preventDefault();
  };
  const onMove = (e: TouchEvent) => {
    if (activeId.current === null) return;
    const t = [...e.changedTouches].find((tt) => tt.identifier === activeId.current);
    if (!t || !last.current) return;
    const dx = t.clientX - last.current.x,
      dy = t.clientY - last.current.y;
    last.current = { x: t.clientX, y: t.clientY };
    tc_fire("mobile-look", { dx, dy });
    e.preventDefault();
  };
  const onEnd = (e: TouchEvent) => {
    if (activeId.current === null) return;
    const ended = [...e.changedTouches].some((tt) => tt.identifier === activeId.current);
    if (!ended) return;
    activeId.current = null;
    last.current = null;
    e.preventDefault();
  };

  useEffect(() => {
    const el = padRef.current!;
    const add = (n: keyof HTMLElementEventMap, f: any) => el.addEventListener(n, f, { passive: false });
    const rm = (n: keyof HTMLElementEventMap, f: any) => el.removeEventListener(n, f as any);
    add("touchstart", onStart);
    add("touchmove", onMove);
    add("touchend", onEnd);
    add("touchcancel", onEnd);
    return () => rm("touchstart", onStart);
  }, []);

  return <div ref={padRef} style={tc_rightPad} />;
}

function TC_ActionBar() {
  return (
    <div style={tc_bar}>
      <button
        style={tc_btn}
        onTouchStart={(e) => {
          e.preventDefault();
          tc_keyDown(" ");
        }}
        onTouchEnd={(e) => {
          e.preventDefault();
          tc_keyUp(" ");
        }}
      >
        Jump
      </button>

      <button
        style={tc_btn}
        onTouchStart={(e) => {
          e.preventDefault();
          tc_keyDown("e");
          setTimeout(() => tc_keyUp("e"), 80);
        }}
      >
        Interact
      </button>

      <button
        style={tc_btn}
        onTouchStart={(e) => {
          e.preventDefault();
          tc_keyDown("q");
          setTimeout(() => tc_keyUp("q"), 80);
        }}
      >
        Enter/Exit
      </button>
    </div>
  );
}

export function MobileMuteButton() {
  if (!IS_TOUCH) return null;
  return (
    <button
      onTouchStart={(e) => {
        e.preventDefault();
        tc_keyDown("m");
        setTimeout(() => tc_keyUp("m"), 60);
      }}
      style={{
        position: "fixed",
        top: 10,
        left: 10,
        zIndex: 26,
        fontFamily: "monospace",
        fontWeight: 900,
        padding: "8px 10px",
        background: "rgba(30,41,59,0.9)",
        color: "#fff",
        border: "3px solid #111827",
        borderRadius: 10,
        pointerEvents: "auto",
      }}
    >
      Mute
    </button>
  );
}

const tc_wrap: React.CSSProperties = { position: "fixed", inset: 0, pointerEvents: "none", zIndex: 25 };
const tc_leftPad: React.CSSProperties = {
  position: "absolute",
  left: 12,
  bottom: 12,
  width: 120,
  height: 120,
  borderRadius: 90,
  background: "rgba(15,23,42,0.25)",
  border: "2px solid rgba(148,163,184,0.5)",
  pointerEvents: "auto",
  touchAction: "none",
};
const tc_rightPad: React.CSSProperties = {
  position: "absolute",
  right: 12,
  bottom: 12,
  width: 160,
  height: 160,
  borderRadius: 12,
  background: "rgba(15,23,42,0.18)",
  border: "2px solid rgba(148,163,184,0.4)",
  pointerEvents: "auto",
  touchAction: "none",
};
const tc_bar: React.CSSProperties = {
  position: "absolute",
  bottom: 28,
  left: "50%",
  transform: "translateX(-50%)",
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  pointerEvents: "auto",
  alignItems: "center",
  justifyContent: "center",
};
const tc_btn: React.CSSProperties = {
  fontFamily: "monospace",
  fontWeight: 900,
  padding: "10px 12px",
  background: "rgba(34,197,94,0.9)",
  border: "3px solid #14532d",
  color: "#0b2e13",
  borderRadius: 10,
  touchAction: "none",
};
const tc_ring: React.CSSProperties = {
  position: "absolute",
  left: "50%",
  top: "50%",
  width: 96,
  height: 96,
  marginLeft: -48,
  marginTop: -48,
  border: "2px dashed rgba(226,232,240,0.5)",
  borderRadius: 80,
};
