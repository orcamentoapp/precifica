const express = require("express");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");
const { sendEmail } = require("../utils/email");

const router = express.Router();
const SUPPORT_EMAIL = "suporte@verterelabs.com";

// Usuário logado manda uma mensagem de contato/suporte, que vai por e-mail
// pra equipe do Precifica — com o "responder para" já apontando pro e-mail
// dele, pra facilitar responder direto.
router.post("/contact", requireAuth, async (req, res) => {
  const { subject, message } = req.body || {};
  if (!message || !message.trim()) {
    return res.status(400).json({ error: "Escreva uma mensagem" });
  }

  try {
    const { rows } = await pool.query("SELECT email, name, clinic_name FROM users WHERE id = $1", [req.user.sub]);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

    const finalSubject =
      subject && subject.trim() ? `[Precifica] ${subject.trim()}` : `[Precifica] Mensagem de ${user.email}`;

    await sendEmail({
      to: SUPPORT_EMAIL,
      subject: finalSubject,
      text: `De: ${user.name || user.email} (${user.email})\nClínica: ${user.clinic_name || "—"}\n\n${message.trim()}`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color:#0f766e;">Precifica — Nova mensagem de contato</h2>
          <p><strong>De:</strong> ${user.name || user.email} (${user.email})</p>
          <p><strong>Clínica:</strong> ${user.clinic_name || "—"}</p>
          <hr style="border:none;border-top:1px solid #e7e5e4;margin:16px 0;" />
          <p style="white-space: pre-wrap;">${message.trim()}</p>
        </div>
      `,
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Erro ao enviar mensagem de contato:", err);
    res.status(500).json({ error: "Não foi possível enviar sua mensagem agora. Tente novamente em instantes." });
  }
});

module.exports = router;
