import { useRef } from "react";
import { inputStyle } from "./authStyles";

// Limpa qualquer coisa que não seja letra ou número, e deixa maiúsculo.
// Assim funciona tanto colando "XK7P-4G2M-QW9T-3RN8" quanto "xk7p4g2mqw9t3rn8".
function cleanChars(str) {
  return (str || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export default function LicenseCodeInput({ value, onChange }) {
  // value é um array de 4 strings, ex: ["XK7P", "4G2M", "QW9T", "3RN8"]
  const refs = [useRef(null), useRef(null), useRef(null), useRef(null)];

  function updateGroup(index, groupValue) {
    const next = [...value];
    next[index] = groupValue;
    onChange(next);
  }

  function handleChange(index, raw) {
    const cleaned = cleanChars(raw).slice(0, 4);
    updateGroup(index, cleaned);
    if (cleaned.length === 4 && index < 3) {
      refs[index + 1].current?.focus();
      refs[index + 1].current?.select();
    }
  }

  function handleKeyDown(index, e) {
    if (e.key === "Backspace" && !value[index] && index > 0) {
      refs[index - 1].current?.focus();
    }
  }

  function handlePaste(e) {
    e.preventDefault();
    const pasted = (e.clipboardData || window.clipboardData).getData("text");
    const cleaned = cleanChars(pasted);
    if (!cleaned) return;

    const groups = ["", "", "", ""];
    for (let i = 0; i < 4; i++) {
      groups[i] = cleaned.slice(i * 4, i * 4 + 4);
    }
    onChange(groups);

    let lastFilledIndex = 0;
    groups.forEach((g, i) => {
      if (g) lastFilledIndex = i;
    });
    const focusIndex = Math.min(lastFilledIndex + (groups[lastFilledIndex].length === 4 ? 1 : 0), 3);
    refs[focusIndex].current?.focus();
  }

  return (
    <div style={{ display: "flex", gap: 8 }}>
      {[0, 1, 2, 3].map((i) => (
        <input
          key={i}
          ref={refs[i]}
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          value={value[i] || ""}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          maxLength={4}
          style={{
            ...inputStyle,
            textAlign: "center",
            fontFamily: "'Courier New', monospace",
            fontSize: 16,
            letterSpacing: 1,
            padding: "10px 6px",
            width: "100%",
          }}
        />
      ))}
    </div>
  );
}
