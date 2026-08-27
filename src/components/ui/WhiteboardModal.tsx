import { useEffect, useRef, useState } from "react";
import type { WhiteboardConfig } from "../../types";

export function WhiteboardModal({
  config,
  onClose,
  darkMode,
}: {
  config: WhiteboardConfig;
  onClose: () => void;
  darkMode: boolean;
}) {
  const [tab, setTab] = useState<"info" | "gallery">("info");
  const [index, setIndex] = useState(0);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key.toLowerCase() === "q") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const images = (config as any).images || [];

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const w = el.clientWidth || 1;
    const i = Math.round(el.scrollLeft / w);
    setIndex(Math.max(0, Math.min(images.length - 1, i)));
  };

  const frame = darkMode ? "#1d3b2a" : "#2e7d32";
  const paper = darkMode ? "#0d1526" : "#ffffff";
  const ink = darkMode ? "#e2e8f0" : "#1e293b";
  const panelBlue = "#16233b";
  const panelLight = "#f8fafc";

  const pixelBorder = (shadow = 4) => ({
    boxShadow: `0 ${shadow}px 0 #111827`,
  });

  const pixelTile: React.CSSProperties = {
    backgroundImage: darkMode
      ? "radial-gradient(#1e293b 1px, transparent 1px)"
      : "radial-gradient(#e2e8f0 1px, transparent 1px)",
    backgroundSize: "12px 12px",
  };

  const GalleryDots = () => (
    <div
      style={{
        display: "flex",
        gap: 6,
        justifyContent: "center",
        alignItems: "center",
        padding: "8px 0",
      }}
    >
      {images.map((_: any, i: number) => (
        <span
          key={i}
          style={{
            width: index === i ? 12 : 8,
            height: index === i ? 12 : 8,
            background: index === i ? (darkMode ? "#60a5fa" : "#2563eb") : "#94a3b8",
            border: "2px solid #111827",
            display: "inline-block",
          }}
        />
      ))}
    </div>
  );

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
    >
      {/* DESKTOP UI */}
      {!isMobile && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: "min(1280px, 94vw)",
            height: "min(860px, 90vh)",
            background: paper,
            border: `6px solid ${frame}`,
            display: "flex",
            flexDirection: "column",
            boxShadow:
              "0 0 0 4px #111827, 0 16px 36px rgba(0,0,0,0.6), inset 0 0 0 3px rgba(255,255,255,0.08)",
            ...pixelTile,
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "0.75rem 1.25rem",
              background: "linear-gradient(#16a34a, #16a34a)",
              borderBottom: `6px solid #14532d`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              ...pixelBorder(0),
            }}
          >
            <div
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: "1.2rem",
                color: "#ffffff",
                letterSpacing: 2,
                textShadow: "2px 2px 0 #14532d",
              }}
            >
              {config.title.toUpperCase()}
            </div>
            <button
              onClick={onClose}
              style={{
                padding: "8px 16px",
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
          </div>

          <div
            style={{
              display: "flex",
              gap: "1.5rem",
              padding: "1rem",
              flex: 1,
              overflow: "hidden",
            }}
          >
            {/* LEFT: text */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
              <div
                style={{
                  background: darkMode ? "#18243a" : "#fefefe",
                  padding: "0.75rem 1rem",
                  border: `4px solid ${frame}`,
                  fontFamily: "monospace",
                  fontWeight: 900,
                  fontSize: "1.6rem",
                  letterSpacing: 1,
                  color: darkMode ? "#ffffff" : "#0f172a",
                  ...pixelBorder(2),
                }}
              >
                {config.title.toUpperCase()}
              </div>
              <div
                style={{
                  marginTop: "1rem",
                  background: darkMode ? panelBlue : panelLight,
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
                {(config as any).sections?.map((sec: any, i: number) => (
                  <div key={i} style={{ marginBottom: "1.1rem" }}>
                    <div style={{ fontSize: "1.25rem", fontWeight: 900, marginBottom: 6, color: ink }}>
                      {sec.url ? (
                        <a
                          href={sec.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: darkMode ? "#93c5fd" : "#0f172a", textDecoration: "underline" }}
                        >
                          {sec.title}
                        </a>
                      ) : (
                        sec.title
                      )}
                    </div>
                    <div style={{ fontSize: "1.05rem", color: ink }} dangerouslySetInnerHTML={{ __html: sec.body }} />
                  </div>
                ))}
                <div style={{ height: 24 }} />
                <p style={{ color: ink }}>Tip: Press <b>ESC</b> or <b>Q</b> to close. Everything here scrolls.</p>
              </div>
            </div>

            {/* RIGHT: images */}
            <div
              style={{
                width: 420,
                display: "flex",
                flexDirection: "column",
                gap: 12,
                minWidth: 0,
                overflow: "auto",
              }}
            >
              {images.map((src: string, idx: number) => (
                <div
                  key={idx}
                  style={{
                    width: "100%",
                    border: `4px solid ${frame}`,
                    background: "#ffffff",
                    boxShadow:
                      "0 0 0 6px #111827, 0 0 0 12px #6b7280, 0 0 0 18px #111827",
                  }}
                >
                  <img
                    src={src}
                    alt={`${config.title} ${idx + 1}`}
                    style={{ width: "100%", height: 360, objectFit: "cover", imageRendering: "pixelated", filter: "none" }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MOBILE: tabbed + swipeable */}
      {isMobile && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            inset: 0,
            background: paper,
            display: "flex",
            flexDirection: "column",
            ...pixelTile,
          }}
        >
          {/* sticky header */}
          <div
            style={{
              position: "sticky",
              top: 0,
              zIndex: 2,
              padding: "10px 12px",
              borderBottom: `6px solid #14532d`,
              background: "linear-gradient(#16a34a, #16a34a)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              ...pixelBorder(0),
            }}
          >
            <div
              style={{
                marginLeft: 8,
                padding: "6px 10px",
                border: `4px solid ${frame}`,
                background: darkMode ? "#18243a" : "#fefefe",
                fontFamily: "monospace",
                fontWeight: 900,
                color: darkMode ? "#ffffff" : "#0f172a",
                ...pixelBorder(2),
              }}
            >
              {config.title.toUpperCase()}
            </div>
            <button
              onClick={onClose}
              style={{
                marginRight: 8,
                padding: "8px 14px",
                background: "#22c55e",
                color: "#0b2e13",
                border: "4px solid #14532d",
                fontFamily: "monospace",
                fontWeight: 900,
                ...pixelBorder(2),
              }}
              aria-label="Close"
            >
              EXIT
            </button>
          </div>

          {/* tabs */}
          <div
            role="tablist"
            aria-label="Content tabs"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
              padding: "10px",
            }}
          >
            {(["info", "gallery"] as const).map((t) => {
              const selected = tab === t;
              return (
                <button
                  key={t}
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setTab(t)}
                  style={{
                    padding: "10px 12px",
                    border: `4px solid ${frame}`,
                    fontFamily: "monospace",
                    fontWeight: 900,
                    letterSpacing: 1,
                    background: selected
                      ? (darkMode ? "#18243a" : "#fefefe")
                      : (darkMode ? "#0f172a" : "#e2e8f0"),
                    color: selected ? (darkMode ? "#ffffff" : "#0f172a") : ink,
                    ...pixelBorder(2),
                  }}
                >
                  {t.toUpperCase()}
                </button>
              );
            })}
          </div>

          {/* tab content */}
          <div style={{ flex: 1, overflow: "hidden" }}>
            {tab === "info" && (
              <div
                role="tabpanel"
                aria-labelledby="INFO"
                style={{
                  height: "100%",
                  overflow: "auto",
                  padding: "10px",
                }}
              >
                <div
                  style={{
                    background: darkMode ? panelBlue : panelLight,
                    padding: "12px",
                    border: `4px solid ${frame}`,
                    fontFamily: "monospace",
                    color: ink,
                    lineHeight: 1.6,
                    ...pixelBorder(2),
                  }}
                >
                  {(config as any).sections?.map((sec: any, i: number) => (
                    <div key={i} style={{ marginBottom: "1rem" }}>
                      <div style={{ fontSize: "1.1rem", fontWeight: 900, marginBottom: 4 }}>
                        {sec.url ? (
                          <a
                            href={sec.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: darkMode ? "#93c5fd" : "#0f172a", textDecoration: "underline" }}
                          >
                            {sec.title}
                          </a>
                        ) : (
                          sec.title
                        )}
                      </div>
                      <div style={{ fontSize: "1rem" }} dangerouslySetInnerHTML={{ __html: sec.body }} />
                    </div>
                  ))}
                  <p style={{ opacity: 0.85, marginTop: 12 }}>
                    Tip: You can switch tabs anytime. ESC / Q to close.
                  </p>
                </div>
              </div>
            )}

            {tab === "gallery" && (
              <div
                role="tabpanel"
                aria-labelledby="GALLERY"
                style={{
                  height: "100%",
                  display: "grid",
                  gridTemplateRows: "1fr auto",
                }}
              >
                <div
                  ref={scrollerRef}
                  onScroll={onScroll}
                  style={{
                    overflowX: "auto",
                    overflowY: "hidden",
                    scrollSnapType: "x mandatory",
                    display: "grid",
                    gridAutoFlow: "column",
                    gridAutoColumns: "100%",
                    gap: 12,
                    padding: "10px",
                    WebkitOverflowScrolling: "touch",
                    touchAction: "pan-x pan-y",
                  }}
                >
                  {images.map((src: string, i: number) => (
                    <div
                      key={i}
                      style={{
                        scrollSnapAlign: "start",
                        display: "grid",
                        alignContent: "start",
                        border: `4px solid ${frame}`,
                        background: "#ffffff",
                        ...pixelBorder(2),
                      }}
                    >
                      <img
                        src={src}
                        alt={`${config.title} ${i + 1}`}
                        style={{
                          width: "100%",
                          height: "calc(100vh - 220px)",
                          objectFit: "cover",
                          imageRendering: "pixelated",
                          filter: "none",
                        }}
                      />
                    </div>
                  ))}
                </div>

                <div style={{ padding: "0 10px 12px" }}>
                  <GalleryDots />
                  <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                    <button
                      onClick={() =>
                        scrollerRef.current?.scrollBy({
                          left: -Math.max(1, scrollerRef.current.clientWidth),
                          behavior: "smooth",
                        })
                      }
                      style={{
                        padding: "8px 14px",
                        background: "#e5e7eb",
                        border: `4px solid ${frame}`,
                        fontFamily: "monospace",
                        fontWeight: 900,
                        ...pixelBorder(2),
                      }}
                      aria-label="Previous image"
                    >
                      ◀
                    </button>
                    <button
                      onClick={() =>
                        scrollerRef.current?.scrollBy({
                          left: Math.max(1, scrollerRef.current.clientWidth),
                          behavior: "smooth",
                        })
                      }
                      style={{
                        padding: "8px 14px",
                        background: "#e5e7eb",
                        border: `4px solid ${frame}`,
                        fontFamily: "monospace",
                        fontWeight: 900,
                        ...pixelBorder(2),
                      }}
                      aria-label="Next image"
                    >
                      ▶
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
