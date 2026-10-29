// Pixel do Meta (Facebook/Instagram Ads) e Google Analytics 4 — carregados
// SÓ quando:
//   1) os IDs estão configurados no servidor (variáveis META_PIXEL_ID e/ou
//      GA_MEASUREMENT_ID no Railway — ver GET /api/public-config), e
//   2) a pessoa aceitou no aviso de cookies (LGPD). A escolha fica guardada
//      no navegador; "Recusar" nunca carrega nada.
// Sem IDs configurados, este arquivo não faz nada e não mostra aviso.
//
// Uso no resto do site/app: window.precificaTrack("NomeDoEvento", {dados}).
// Eventos usados hoje: CTAClick, Contact (WhatsApp), InitiateCheckout,
// StartTrial, Subscribe. Chamadas feitas antes de carregar ficam na fila.
(function () {
  var KEY = "precifica_cookie_consent"; // "yes" | "no"
  var queue = [];
  var ready = false;
  var cfg = null;

  window.precificaTrack = function (name, params) {
    if (ready) send(name, params || {});
    else queue.push([name, params || {}]);
  };

  function getChoice() {
    try {
      return localStorage.getItem(KEY);
    } catch (e) {
      return null;
    }
  }
  function setChoice(v) {
    try {
      localStorage.setItem(KEY, v);
    } catch (e) {}
  }

  // Nomes padrão de cada plataforma.
  var GA_NAMES = { InitiateCheckout: "begin_checkout", StartTrial: "sign_up", Subscribe: "purchase", Contact: "contact", CTAClick: "cta_click" };
  var META_STANDARD = { InitiateCheckout: 1, StartTrial: 1, Subscribe: 1, Contact: 1, Lead: 1 };

  function send(name, params) {
    try {
      if (cfg.metaPixelId && window.fbq) {
        if (META_STANDARD[name]) window.fbq("track", name, params);
        else window.fbq("trackCustom", name, params);
      }
      if (cfg.gaMeasurementId && window.gtag) window.gtag("event", GA_NAMES[name] || name, params);
    } catch (e) {}
  }

  function loadScript(src) {
    var s = document.createElement("script");
    s.async = true;
    s.src = src;
    document.head.appendChild(s);
  }

  function loadTrackers() {
    if (cfg.metaPixelId) {
      // Snippet oficial do Meta Pixel (versão em arquivo, pra respeitar a CSP).
      var n = (window.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      });
      if (!window._fbq) window._fbq = n;
      n.push = n;
      n.loaded = true;
      n.version = "2.0";
      n.queue = [];
      loadScript("https://connect.facebook.net/en_US/fbevents.js");
      window.fbq("init", cfg.metaPixelId);
      window.fbq("track", "PageView");
    }
    if (cfg.gaMeasurementId) {
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () {
        window.dataLayer.push(arguments);
      };
      window.gtag("js", new Date());
      window.gtag("config", cfg.gaMeasurementId, { anonymize_ip: true });
      loadScript("https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(cfg.gaMeasurementId));
    }
    ready = true;
    queue.splice(0).forEach(function (q) {
      send(q[0], q[1]);
    });
  }

  function showBanner() {
    var bar = document.createElement("div");
    bar.setAttribute("role", "dialog");
    bar.setAttribute("aria-label", "Aviso de cookies");
    bar.style.cssText =
      "position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;max-width:720px;margin:0 auto;background:#1c1917;color:#f5f5f4;border-radius:14px;padding:14px 16px;font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;box-shadow:0 18px 40px -12px rgba(0,0,0,.5);display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center;";
    var txt = document.createElement("div");
    txt.style.cssText = "flex:1 1 320px;";
    txt.innerHTML =
      'Usamos cookies de medição (Meta e Google) pra entender como as pessoas chegam até o Precifica. Você escolhe. <a href="/privacidade.html" style="color:#5eead4;">Política de Privacidade</a>';
    var btns = document.createElement("div");
    btns.style.cssText = "display:flex;gap:8px;";
    function mk(label, primary) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.style.cssText =
        "cursor:pointer;border-radius:8px;padding:8px 14px;font:600 13.5px inherit;font-family:inherit;" +
        (primary ? "background:#0f766e;color:#fff;border:none;" : "background:transparent;color:#e7e5e4;border:1px solid #57534e;");
      return b;
    }
    var no = mk("Recusar", false);
    var yes = mk("Aceitar", true);
    no.onclick = function () {
      setChoice("no");
      bar.remove();
    };
    yes.onclick = function () {
      setChoice("yes");
      bar.remove();
      loadTrackers();
    };
    btns.appendChild(no);
    btns.appendChild(yes);
    bar.appendChild(txt);
    bar.appendChild(btns);
    document.body.appendChild(bar);
  }

  function start() {
    fetch("/api/public-config")
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (c) {
        if (!c || (!c.metaPixelId && !c.gaMeasurementId)) return; // nada configurado
        cfg = c;
        var choice = getChoice();
        // Dentro do app (pessoa logada) não incomoda com aviso — só carrega
        // se ela já tinha aceitado antes, na página pública.
        var loggedIn = false;
        try {
          loggedIn = !!localStorage.getItem("precifica_token");
        } catch (e) {}
        if (loggedIn && choice !== "yes") return;
        if (choice === "yes") loadTrackers();
        else if (choice !== "no") showBanner();
      })
      .catch(function () {});
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
