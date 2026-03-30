import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { persistor, store } from "./core/store";
import { BrowserRouter } from "react-router";
import { CssBaseline, CircularProgress, Box } from "@mui/material";
import { AuthProvider } from "./app/providers/AuthProvider";
import { ThemeModeProvider } from "./app/providers/ThemeModeProvider";
import { AppRoutes } from "./app/routes/routes";
import "@/assets/i18n/i18n";
import "./index.css";
import { PersistGate } from "redux-persist/integration/react";

// Loading component
const LoadingFallback = () => (
  <Box
    display="flex"
    justifyContent="center"
    alignItems="center"
    minHeight="100vh"
    bgcolor="background.default"
  >
    <CircularProgress />
  </Box>
);

console.log("🚀 main.tsx carregado!");
console.log("📦 Store:", store);
console.log("💾 Persistor:", persistor);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Provider store={store}>
      <PersistGate loading={<LoadingFallback />} persistor={persistor}>
        <BrowserRouter>
          <ThemeModeProvider>
            <CssBaseline />
            <AuthProvider>
              <AppRoutes />
            </AuthProvider>
          </ThemeModeProvider>
        </BrowserRouter>
      </PersistGate>
    </Provider>
  </React.StrictMode>
);
