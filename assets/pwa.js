// Registra il service worker e porta in vista la voce attiva del menu.
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
addEventListener("load", () => setTimeout(() => { const a = document.querySelector("nav a.on"); if (a && a.scrollIntoView) a.scrollIntoView({ inline: "center", block: "nearest" }); }, 50));
