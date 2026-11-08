import { render } from "preact";
import "../app/styles/tokens.css";
import "../app/styles/app.css";
import "./backoffice.css";
import { App } from "./app.tsx";

const root = document.getElementById("app");
if (root) render(<App />, root);
