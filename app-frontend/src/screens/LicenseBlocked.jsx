import { clearToken } from "../api";
import { screenStyle, cardStyle, buttonStyle } from "../authStyles";

const REASON_MESSAGES = {
  expired: "Sua licença expirou. Entre em contato pra renovar o acesso.",
  revoked: "O acesso dessa licença foi revogado. Entre em contato com o suporte.",
  inactive: "Sua licença ainda não está ativa.",
  no_license: "Não encontramos nenhuma licença associada à sua conta. Entre em contato com o suporte.",
};

export default function LicenseBlocked({ reason, onLogout }) {
  return (
    <div style={screenStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#0f766e" }}>Precifica</div>
        <p style={{ fontSize: 13, color: "#78716c", margin: "10px 0 20px", lineHeight: 1.5 }}>
          {REASON_MESSAGES[reason] || "Sua licença precisa de atenção."}
        </p>
        <button
          type="button"
          onClick={() => {
            clearToken();
            onLogout();
          }}
          style={buttonStyle}
        >
          Sair
        </button>
      </div>
    </div>
  );
}
