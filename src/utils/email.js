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

// E-mail dedicado do início do teste grátis — MUITO mais importante que o
// e-mail de compra normal, porque é ele que avisa a pessoa das regras reais
// da cobrança (quando o cartão vai ser cobrado de verdade, e como cancelar
// antes disso). Ainda inclui a chave de licença (continua sendo necessária
// pra criar a conta), mas o conteúdo principal é sobre o prazo do trial.
async function sendTrialStartedEmail(to, licenseCode, appUrl, trialEndLabel, monthlyPriceLabel) {
  const baseUrl = appUrl || "";
  const activationLink = baseUrl
    ? `${baseUrl}/?ativar=${encodeURIComponent(licenseCode)}&email=${encodeURIComponent(to)}`
    : "";

  return sendEmail({
    to,
    subject: "Seu teste grátis começou!",
    text:
      `Seu período de 7 dias gratuitos no Precifica já está ativo e vai até ${trialEndLabel}.\n\n` +
      `Sobre sua assinatura: valor atual R$ 0,00. Próxima cobrança: R$ ${monthlyPriceLabel} automaticamente em ${trialEndLabel}, caso não cancele.\n\n` +
      `Cancelamento: acesse "Configurações" > "Gerenciar Assinatura" e clique em cancelar assinatura. Faça isso pelo menos 24 horas antes de ${trialEndLabel} pra evitar a cobrança.\n\n` +
      `Sua chave de licença (pra criar sua conta): ${licenseCode}` +
      (activationLink ? `\n\nAtive direto por aqui: ${activationLink}` : ""),
    html: `
      <div style="font-family: sans-serif; max-width: 460px; margin: 0 auto;">
        <h2 style="color:#0f766e;">Precifica</h2>
        <p>Seja bem-vindo(a)! Seu período de <strong>7 dias gratuitos</strong> já está ativo e vai até <strong>${trialEndLabel}</strong>.</p>

        <div style="background:#f5f5f4; border-radius: 10px; padding: 16px; margin: 20px 0;">
          <p style="margin: 0 0 8px; font-weight: 600; color:#292524;">Sobre a sua assinatura</p>
          <p style="margin: 0; font-size: 14px; color:#57534e;">Valor atual: <strong>R$ 0,00</strong></p>
          <p style="margin: 4px 0 0; font-size: 14px; color:#57534e;">Próxima cobrança: <strong>R$ ${monthlyPriceLabel}</strong> automaticamente em <strong>${trialEndLabel}</strong>, caso não cancele.</p>
        </div>

        <div style="background:#fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 16px; margin: 20px 0;">
          <p style="margin: 0 0 8px; font-weight: 600; color:#92400e;">Cancelamento</p>
          <p style="margin: 0; font-size: 14px; color:#78350f;">
            Você tem total flexibilidade. Se não quiser continuar, acesse "Configurações" &gt; "Gerenciar Assinatura"
            e clique em cancelar assinatura. Faça isso pelo menos 24 horas antes de ${trialEndLabel} pra evitar a
            cobrança.
          </p>
        </div>

        <p style="margin: 20px 0 4px;">Sua chave de licença, pra criar sua conta:</p>
        <p style="font-size: 22px; font-weight: 700; letter-spacing: 2px; color:#292524; font-family: monospace; margin: 0 0 16px;">${licenseCode}</p>
        ${
          activationLink
            ? `<p style="margin: 0 0 24px;">
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
  sendTrialStartedEmail,
  sendLicenseRenewedEmail,
  isSmtpConfigured,
  isBrevoConfigured,
};
