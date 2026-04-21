import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"

import { ErrorBoundary } from "@/components/error-boundary"
import "./index.css"
import App from "./App.tsx"

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </ErrorBoundary>
)
