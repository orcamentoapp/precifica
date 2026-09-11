const BANNER_HEIGHT = 36;
// altura total = altura do banner + o espaço reservado pra status bar (notch/relógio)
const TOTAL_HEIGHT = `calc(${BANNER_HEIGHT}px + env(safe-area-inset-top, 0px))`;

export default function TrialBanner({ daysLeft }) {
  const days = Number(daysLeft);
  const label =
    days <= 0
      ? "Versão de Teste — expira hoje"
      : `Versão de Teste — expira em ${days} ${days === 1 ? "dia" : "dias"}`;

  return (
    <>
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: TOTAL_HEIGHT,
          paddingTop: "env(safe-area-inset-top, 0px)",
          zIndex: 9999,
          background: "#e11d48",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.01em",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
        }}
      >
        {label}
      </div>
      {/* espaçador pra empurrar o conteúdo do app pra baixo do banner fixo */}
      <div style={{ height: TOTAL_HEIGHT }} />
    </>
  );
}
