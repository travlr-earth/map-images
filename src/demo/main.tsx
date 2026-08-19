import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DemoApp } from "./DemoApp";
import "maplibre-gl/dist/maplibre-gl.css";
import "./demo.css";

const root = document.getElementById("demo-root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <DemoApp />
    </StrictMode>,
  );
}
