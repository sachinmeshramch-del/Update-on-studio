import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const rootElement = document.getElementById("root")!;
rootElement.dataset.rendered = "true";
createRoot(rootElement).render(<App />);
