import { useEffect, useRef } from "react";

/**
 * Captura lecturas de pistola lectora (HID: tipeo rápido + Enter).
 * Ignora cuando el foco está en un input/textarea/select editable.
 */
export function useBarcodeScanner({ onScan, enabled = true }) {
  const bufferRef = useRef("");
  const lastKeyTimeRef = useRef(0);

  useEffect(() => {
    if (!enabled || !onScan) return;

    const handleKeyDown = (e) => {
      const tag = e.target?.tagName?.toLowerCase();
      const isEditable =
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        e.target?.isContentEditable;

      if (isEditable) return;

      const now = Date.now();
      if (now - lastKeyTimeRef.current > 100) {
        bufferRef.current = "";
      }
      lastKeyTimeRef.current = now;

      if (e.key === "Enter") {
        const code = bufferRef.current.trim();
        bufferRef.current = "";
        if (code) {
          e.preventDefault();
          onScan(code);
        }
        return;
      }

      if (e.key.length === 1 && /^\d$/.test(e.key)) {
        bufferRef.current += e.key;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, onScan]);
}
