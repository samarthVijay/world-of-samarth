

export function TitleScreen({
  onContinue,
  onLiteMode,
}: {
  onContinue: () => void;
  onLiteMode: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#1e1e1e",
        color: "#fff",
        display: "flex",
        flexDirection: "column",
        gap: "2rem",
        justifyContent: "center",
        alignItems: "center",
        fontFamily: "'Press Start 2P', monospace",
        zIndex: 9999,
        textAlign: "center",
        padding: "2rem",
      }}
    >
      <h1 style={{ fontSize: "5rem", color: "#4caf50", margin: 0 }}>WORLD OF SAM</h1>
      <div
        style={{
          maxWidth: 720,
          border: "4px solid #ff4444",
          background: "#000",
          padding: "1rem 1.25rem",
          fontSize: "0.9rem",
          lineHeight: 1.6,
          textAlign: "left",
        }}
      >
        <strong>WARNING:</strong> Best with <span style={{ color: "#ffeb3b" }}>Hardware Acceleration</span>. If choppy, try <em>Lite Mode</em>.
      </div>
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <button
          onClick={onContinue}
          style={{
            padding: "1rem 2rem",
            fontFamily: "'Press Start 2P', monospace",
            fontSize: "1rem",
            background: "#4caf50",
            border: "4px solid #2e7d32",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          CONTINUE
        </button>
        <button
          onClick={onLiteMode}
          style={{
            padding: "1rem 2rem",
            fontFamily: "'Press Start 2P', monospace",
            fontSize: "1rem",
            background: "#3b82f6",
            border: "4px solid #1d4ed8",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          PLAY LITE MODE
        </button>
      </div>
    </div>
  );
}

export function ImageModal({
  img,
  caption,
  onClose,
  darkMode,
}: {
  img: string;
  caption: string;
  onClose: () => void;
  darkMode: boolean;
}) {
  const frame = darkMode ? "#1d3b2a" : "#2e7d32";
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxHeight: "90vh",
          maxWidth: "90vw",
          border: `6px solid ${frame}`,
          background: darkMode ? "#0f172a" : "#ffffff",
          color: darkMode ? "#ffffff" : "#0f172a",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "1rem",
          padding: "1.25rem",
          boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
          fontFamily: "monospace",
          fontWeight: 900,
        }}
      >
        <img
          src={img}
          alt={caption}
          style={{
            maxHeight: "70vh",
            maxWidth: "80vw",
            objectFit: "contain",
            border: "4px solid #111827",
          }}
        />
        <div style={{ fontSize: "1.2rem", letterSpacing: 1 }}>{caption}</div>
        <button
          onClick={onClose}
          style={{
            padding: "8px 16px",
            background: "#22c55e",
            color: "#0b2e13",
            border: "3px solid #14532d",
            cursor: "pointer",
            fontFamily: "monospace",
            fontWeight: 900,
          }}
        >
          CLOSE (ESC / Q)
        </button>
      </div>
    </div>
  );
}
