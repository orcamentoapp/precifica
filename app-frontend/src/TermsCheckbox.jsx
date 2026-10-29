// Caixinha "Li e aceito os Termos de Uso e a Política de Privacidade" —
// obrigatória no cadastro e na compra (LGPD/CDC). O servidor também confere
// (não dá pra pular chamando a API direto) e guarda a data do aceite.
export default function TermsCheckbox({ checked, onChange, style }) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        fontSize: 12.5,
        color: "#57534e",
        lineHeight: 1.45,
        cursor: "pointer",
        margin: "4px 0 16px",
        ...style,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 15, height: 15, marginTop: 1, flexShrink: 0, cursor: "pointer" }}
        required
      />
      <span>
        Li e aceito os{" "}
        <a href="/termos.html" target="_blank" rel="noopener" style={{ color: "#0f766e", fontWeight: 600 }}>
          Termos de Uso
        </a>{" "}
        e a{" "}
        <a href="/privacidade.html" target="_blank" rel="noopener" style={{ color: "#0f766e", fontWeight: 600 }}>
          Política de Privacidade
        </a>
        .
      </span>
    </label>
  );
}
