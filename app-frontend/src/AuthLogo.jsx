// Logo + nome do Precifica, no mesmo padrão visual do cabeçalho do sistema
// (App.jsx: ícone de 44px + texto em stone-800) — usado em todas as telas
// de autenticação (login, cadastro, compra, etc) pra não ficar só um texto
// solto, diferente do resto do app.
export default function AuthLogo() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", gap: 10, marginBottom: 4 }}>
      <img src="/icons/logo-header.png" alt="Precifica" style={{ width: 44, height: 44, flexShrink: 0 }} />
      <span style={{ fontSize: 20, fontWeight: 600, color: "#292524", letterSpacing: "-0.02em" }}>Precifica</span>
    </div>
  );
}
