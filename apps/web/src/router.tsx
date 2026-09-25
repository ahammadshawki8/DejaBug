import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter } from "react-router-dom";
import { AppLayout } from "./pages/AppLayout";
import { CaseBoardPage } from "./pages/CaseBoardPage";
import { NotFoundPage } from "./pages/NotFoundPage";

// Routes (PROJECT.md 6A.6-6A.7). The board loads eagerly; heavier screens are split into chunks.

const CaseFilePage = lazy(() => import("./pages/CaseFilePage").then((m) => ({ default: m.CaseFilePage })));
const InvestigationPage = lazy(() =>
  import("./pages/InvestigationPage").then((m) => ({ default: m.InvestigationPage })),
);
const DebriefPage = lazy(() => import("./pages/DebriefPage").then((m) => ({ default: m.DebriefPage })));
const ForgePage = lazy(() => import("./pages/ForgePage").then((m) => ({ default: m.ForgePage })));
const ProgressPage = lazy(() => import("./pages/ProgressPage").then((m) => ({ default: m.ProgressPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const StyleguidePage = lazy(() =>
  import("./pages/StyleguidePage").then((m) => ({ default: m.StyleguidePage })),
);

/** Loading state while a screen's chunk arrives: a sheet of paper sliding in. */
function Page({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div
          className="mt-6 h-64 max-w-4xl animate-pulse rounded-[2px] border-[3px] border-line bg-manila/30"
          aria-label="Loading"
        />
      }
    >
      {children}
    </Suspense>
  );
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <CaseBoardPage /> },
      {
        path: "case/:id",
        element: (
          <Page>
            <CaseFilePage />
          </Page>
        ),
      },
      {
        path: "case/:id/investigate",
        element: (
          <Page>
            <InvestigationPage />
          </Page>
        ),
      },
      {
        path: "case/:id/debrief",
        element: (
          <Page>
            <DebriefPage />
          </Page>
        ),
      },
      {
        path: "investigate",
        element: (
          <Page>
            <InvestigationPage />
          </Page>
        ),
      },
      {
        path: "forge",
        element: (
          <Page>
            <ForgePage />
          </Page>
        ),
      },
      {
        path: "progress",
        element: (
          <Page>
            <ProgressPage />
          </Page>
        ),
      },
      {
        path: "settings",
        element: (
          <Page>
            <SettingsPage />
          </Page>
        ),
      },
      {
        path: "styleguide",
        element: (
          <Page>
            <StyleguidePage />
          </Page>
        ),
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
