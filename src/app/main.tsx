import { render } from "preact";
import { App } from "./app.tsx";
import "./styles/tokens.css";
import "./styles/app.css";

const root = document.getElementById("app");
if (root) render(<App />, root);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {
    // Sans service worker, l'app fonctionne mais pas hors ligne.
  });
}
