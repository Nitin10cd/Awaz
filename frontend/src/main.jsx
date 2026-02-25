import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./App.css";
import Layout from "./Layout.jsx";
import { PatientProvider } from "./context/PatientContext.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <PatientProvider>
      <BrowserRouter>
        <Layout />
      </BrowserRouter>
    </PatientProvider>
  </StrictMode>
);
