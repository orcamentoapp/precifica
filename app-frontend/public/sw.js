// Service worker mínimo. Ele não faz cache nem funciona offline de propósito
// (o Precifica precisa de rede pra falar com a API/banco de qualquer jeito)
// — ele existe só porque o Chrome/Android exige um service worker registrado
// pra considerar o site "instalável" como app. Se um dia quisermos suporte
// offline de verdade, é aqui que entra a lógica de cache.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Deixa passar direto pra rede — sem cache.
});
