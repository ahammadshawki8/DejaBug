import { useEffect, useMemo, useState } from "react";
import { Outlet } from "react-router-dom";
import { api, SHOWCASE } from "../api/client";
import { DispatchTicker, NavRail, ToastStack, TopBar, type EngineStatus } from "../components/game";
import { useLofi } from "../lib/useLofi";
import { useGame } from "../state/game";
import { useProfile } from "../state/profile";
import { useSettings } from "../state/settings";
import { PageTitleContext, type PageTitleState } from "./pageTitle";

// The game shell around every screen (6A.6).

export function AppLayout() {
  useLofi();
  const [engine, setEngine] = useState<EngineStatus>("offline");
  const [title, setTitle] = useState<PageTitleState>({ text: "DejaBug" });
  const repo = useSettings((s) => s.repo);
  const loadProfile = useProfile((s) => s.load);
  const { cases, loadCases, loadRepos } = useGame();

  useEffect(() => {
    let stop = false;
    const check = () =>
      api
        .health()
        .then(() => !stop && setEngine(SHOWCASE ? "showcase" : "connected"))
        .catch(() => !stop && setEngine("offline"));
    void check();
    const id = window.setInterval(check, 10_000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    void loadProfile();
    void loadRepos();
  }, [loadProfile, loadRepos]);

  useEffect(() => {
    void loadCases(repo);
  }, [repo, loadCases]);

  // Dispatch ticker: symptoms of open cases read like incoming reports.
  const dispatch = useMemo(
    () => cases.slice(0, 12).map((c) => `${c.brief.precinct.toUpperCase()}: ${c.brief.symptoms}`),
    [cases],
  );

  return (
    <PageTitleContext.Provider value={setTitle}>
      <div className="flex min-h-screen">
        <NavRail />
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Ticker and top bar stay pinned while the page scrolls. */}
          <div className="sticky top-0 z-30 border-b-[3px] border-line bg-ink">
            <DispatchTicker lines={dispatch} />
            <TopBar title={title.node ?? title.text} engine={engine} />
          </div>
          <main id="main" className="min-w-0 flex-1 overflow-x-clip px-6 pt-4 pb-12 sm:px-8">
            <Outlet />
          </main>
        </div>
      </div>
      <ToastStack />
    </PageTitleContext.Provider>
  );
}
