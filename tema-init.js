// Applica il tema salvato (o quello di sistema) prima del rendering, così non
// c'è "flash" di tema chiaro all'avvio. Esternalizzato dallo <script> inline di
// index.html per poter applicare una Content-Security-Policy senza 'unsafe-inline'.
(function () {
  try {
    var t = localStorage.getItem("dieta-nutrizionista-tema");
    if (t !== "chiaro" && t !== "notte") {
      t = (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "notte" : "chiaro";
    }
    if (t === "notte") document.documentElement.classList.add("tema-notte");
  } catch (e) {}
})();
