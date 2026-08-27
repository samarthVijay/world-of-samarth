import { useEffect, useRef } from "react";
import { IS_TOUCH } from "../constants";

export function BackgroundMusic({
  lightSrc = "audio/bg.mp3",
  darkSrc = "audio/night.mp3",
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
  const lightRef = useRef<HTMLAudioElement | null>(null);
  const darkRef = useRef<HTMLAudioElement | null>(null);
  const startedRef = useRef(false);
  const mutedRef = useRef(false);

  function fadeTo(a: HTMLAudioElement, target: number, ms: number, onZeroPause = false) {
    const steps = Math.max(1, Math.floor(ms / 50));
    const start = a.volume;
    const delta = target - start;
    let i = 0;
    const id = window.setInterval(() => {
      i++;
      const t = i / steps;
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      a.volume = Math.max(0, Math.min(1, start + delta * eased));
      if (i >= steps) {
        a.volume = Math.max(0, Math.min(1, target));
        window.clearInterval(id);
        if (onZeroPause && a.volume <= 0.001) {
          try {
            a.pause();
          } catch {}
        }
      }
    }, 50);
  }

  useEffect(() => {
    const mk = (path: string) => {
      const url = `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;
      const a = new Audio(url);
      a.loop = true;
      a.preload = "auto";
      (a as any).playsInline = true;
      a.volume = 0;
      a.muted = mutedRef.current;
      return a;
    };
    lightRef.current = mk(lightSrc);
    darkRef.current = mk(darkSrc);

    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "m") {
        mutedRef.current = !mutedRef.current;
        if (lightRef.current) lightRef.current.muted = mutedRef.current;
        if (darkRef.current) darkRef.current.muted = mutedRef.current;
      }
    };
    window.addEventListener("keydown", onKey);

    const start = async () => {
      if (startedRef.current) return;
      try {
        if (IS_TOUCH) {
          const on = darkMode ? darkRef.current! : lightRef.current!;
          await on.play();
          fadeTo(on, maxVolume, fadeMs);
        } else {
          await lightRef.current?.play();
          await darkRef.current?.play();
          if (darkMode) {
            fadeTo(darkRef.current!, maxVolume, fadeMs);
            fadeTo(lightRef.current!, 0, fadeMs);
          } else {
            fadeTo(lightRef.current!, maxVolume, fadeMs);
            fadeTo(darkRef.current!, 0, fadeMs);
          }
        }
        startedRef.current = true;
      } catch {
        startedRef.current = false;
      }
      if (startedRef.current) window.removeEventListener("click", start, true);
    };
    window.addEventListener("click", start, true);

    return () => {
      window.removeEventListener("click", start, true);
      window.removeEventListener("keydown", onKey);
      lightRef.current?.pause();
      darkRef.current?.pause();
      if (lightRef.current) lightRef.current.src = "";
      if (darkRef.current) darkRef.current.src = "";
      lightRef.current = null;
      darkRef.current = null;
    };
  }, [lightSrc, darkSrc, darkMode, fadeMs, maxVolume]);

  useEffect(() => {
    if (!startedRef.current) return;
    const on = darkMode ? darkRef.current : lightRef.current;
    const off = darkMode ? lightRef.current : darkRef.current;
    if (!on || !off) return;

    on.play().catch(() => {});
    if (IS_TOUCH) {
      fadeTo(on, maxVolume, fadeMs);
      fadeTo(off, 0, fadeMs, true);
    } else {
      fadeTo(on, maxVolume, fadeMs);
      fadeTo(off, 0, fadeMs);
    }
  }, [darkMode, fadeMs, maxVolume]);

  return null;
}
