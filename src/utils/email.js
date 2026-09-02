const nodemailer = require("nodemailer");

function isBrevoConfigured() {
  return Boolean(process.env.BREVO_API_KEY);
}

function isSmtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

function getFromEmail() {
  return process.env.EMAIL_FROM || process.env.SMTP_FROM || "suporte@verterelabs.com";
}

function getFromName() {
  return process.env.EMAIL_FROM_NAME || "Precifica";
}

async function sendViaBrevo({ to, subject, html, text }) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "api-key": process.env.BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { name: getFromName(), email: getFromEmail() },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
  });

  if (!res.ok) {
    let detail = "";
    try {
      const data = await res.json();
      detail = data.message || JSON.stringify(data);
    } catch (e) {
      detail = await res.text();
    }
    throw new Error(`Brevo respondeu ${res.status}: ${detail}`);
  }

  return { delivered: true, mode: "brevo" };
}

// Envia um e-mail. Ordem de prioridade: API da Brevo (se BREVO_API_KEY estiver
// configurada) → SMTP genérico (se SMTP_HOST/USER/PASS estiverem configurados)
// → mostrar no console (fallback pra não travar o fluxo enquanto nada estiver
// configurado, e pra dar pra testar sem depender de provedor nenhum).
async function sendEmail({ to, subject, html, text }) {
  if (isBrevoConfigured()) {
    return sendViaBrevo({ to, subject, html, text });
  }

  if (isSmtpConfigured()) {
    const transporter = getTransporter();
    await transporter.sendMail({
      from: `"${getFromName()}" <${getFromEmail()}>`,
      to,
      subject,
      html,
      text,
    });
    return { delivered: true, mode: "smtp" };
  }

  console.log("\n===== E-MAIL (nenhum provedor configurado, mostrando no console) =====");
  console.log("Para:", to);
  console.log("Assunto:", subject);
  console.log(text || html);
  console.log("=========================================================================\n");
  return { delivered: false, mode: "console" };
}

async function sendVerificationEmail(to, code) {
  return sendEmail({
    to,
    subject: "Confirme seu e-mail — Precifica",
    text: `Seu código de confirmação é: ${code}\n\nEle expira em 15 minutos.`,
    html: `
      <div style="font-family: sans-serif; max-width: 420px; margin: 0 auto;">
        <h2 style="color:#0f766e;">Precifica</h2>
        <p>Seu código de confirmação é:</p>
        <p style="font-size: 28px; font-weight: 700; letter-spacing: 4px; color:#292524;">${code}</p>
        <p style="color:#78716c; font-size: 13px;">Esse código expira em 15 minutos.</p>
      </div>
    `,
  });
}

async function sendPasswordResetEmail(to, code) {
  return sendEmail({
    to,
    subject: "Redefinir senha — Precifica",
    text: `Seu código pra redefinir a senha é: ${code}\n\nEle expira em 30 minutos. Se você não pediu isso, ignore este e-mail.`,
    html: `
      <div style="font-family: sans-serif; max-width: 420px; margin: 0 auto;">
        <h2 style="color:#0f766e;">Precifica</h2>
        <p>Seu código pra redefinir a senha é:</p>
        <p style="font-size: 28px; font-weight: 700; letter-spacing: 4px; color:#292524;">${code}</p>
        <p style="color:#78716c; font-size: 13px;">Esse código expira em 30 minutos. Se você não pediu isso, ignore este e-mail.</p>
      </div>
    `,
  });
}

async function sendLicensePurchasedEmail(to, licenseCode, appUrl) {
  const baseUrl = appUrl || "";
  const activationLink = baseUrl
    ? `${baseUrl}/?ativar=${encodeURIComponent(licenseCode)}&email=${encodeURIComponent(to)}`
    : "";

  return sendEmail({
    to,
    subject: "Seu acesso ao Precifica está pronto",
    text: activationLink
      ? `Recebemos seu pagamento! Sua chave de licença é: ${licenseCode}\n\nClique aqui pra ativar direto (a chave já vem preenchida): ${activationLink}`
      : `Recebemos seu pagamento! Sua chave de licença é: ${licenseCode}\n\nAcesse o Precifica e clique em "Ativar licença" pra criar sua conta com esse código.`,
    html: `
      <div style="font-family: sans-serif; max-width: 420px; margin: 0 auto;">
        <h2 style="color:#0f766e;">Precifica</h2>
        <p>Recebemos seu pagamento! Aqui está sua chave de licença:</p>
        <p style="font-size: 22px; font-weight: 700; letter-spacing: 2px; color:#292524; font-family: monospace;">${licenseCode}</p>
        ${
          activationLink
            ? `<p style="margin: 24px 0;">
                 <a href="${activationLink}" style="background:#0f766e; color:#fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
                   Ativar minha conta
                 </a>
               </p>
               <p style="color:#a8a29e; font-size: 12px;">O link já leva pra tela de ativação com a chave preenchida. Se o botão não funcionar, copie: ${activationLink}</p>`
            : `<p>Acesse o Precifica e clique em "Ativar licença" pra criar sua conta com esse código.</p>`
        }
        <p style="color:#78716c; font-size: 13px;">Se não achar o e-mail depois, confira também a pasta de spam.</p>
      </div>
    `,
  });
}

async function sendLicenseRenewedEmail(to, expiresAtLabel) {
  return sendEmail({
    to,
    subject: "Sua assinatura do Precifica foi renovada",
    text: `Recebemos seu pagamento e sua licença foi renovada. Novo vencimento: ${expiresAtLabel}.`,
    html: `
      <div style="font-family: sans-serif; max-width: 420px; margin: 0 auto;">
        <h2 style="color:#0f766e;">Precifica</h2>
        <p>Recebemos seu pagamento e sua licença foi renovada automaticamente.</p>
        <p>Novo vencimento: <strong>${expiresAtLabel}</strong></p>
      </div>
    `,
  });
}

module.exports = {
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendLicensePurchasedEmail,
  sendLicenseRenewedEmail,
  isSmtpConfigured,
  isBrevoConfigured,
};
