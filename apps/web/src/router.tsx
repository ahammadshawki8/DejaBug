import { createBrowserRouter } from "react-router-dom";
import { AppLayout } from "./pages/AppLayout";
import { CaseBoardPage } from "./pages/CaseBoardPage";
import { CaseFilePage } from "./pages/CaseFilePage";
import { DebriefPage } from "./pages/DebriefPage";
import { ForgePage } from "./pages/ForgePage";
import { InvestigationPage } from "./pages/InvestigationPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { ProgressPage } from "./pages/ProgressPage";
import { SettingsPage } from "./pages/SettingsPage";
import { StyleguidePage } from "./pages/StyleguidePage";

// Routes (PROJECT.md 6A.6-6A.7). Every screen renders inside the game shell (AppLayout).
export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <CaseBoardPage /> },
      { path: "case/:id", element: <CaseFilePage /> },
      { path: "case/:id/investigate", element: <InvestigationPage /> },
      { path: "case/:id/debrief", element: <DebriefPage /> },
      { path: "investigate", element: <InvestigationPage /> },
      { path: "forge", element: <ForgePage /> },
      { path: "progress", element: <ProgressPage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "styleguide", element: <StyleguidePage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
