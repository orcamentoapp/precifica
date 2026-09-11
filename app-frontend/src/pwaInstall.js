import { useState, useEffect } from "react";

// O evento "beforeinstallprompt" pode disparar antes de qualquer componente
// React montar, então guardamos ele fora do React (módulo) e avisamos quem
// estiver escutando via essa lista simples de listeners.
let deferredPrompt = null;
let listeners = [];

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    listeners.forEach((fn) => fn());
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    listeners.forEach((fn) => fn());
  });
}

// true quando o app já está rodando instalado (modo standalone)
export function isRunningInstalled() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator?.standalone === true;
}

// true no Safari do iPhone/iPad — esse navegador nunca dispara
// beforeinstallprompt, o "instalar" lá é sempre manual (Compartilhar →
// Adicionar à Tela de Início).
export function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function useInstallPrompt() {
  const [available, setAvailable] = useState(!!deferredPrompt);

  useEffect(() => {
    const update = () => setAvailable(!!deferredPrompt);
    update();
    listeners.push(update);
    return () => {
      listeners = listeners.filter((fn) => fn !== update);
    };
  }, []);

  async function promptInstall() {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;
    setAvailable(false);
    return choice.outcome === "accepted";
  }

  return { available, promptInstall };
}
