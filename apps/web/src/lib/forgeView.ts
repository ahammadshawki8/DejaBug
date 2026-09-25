import type { ForgeEvent, Funnel } from "../api/client";
import type { LaneState } from "../components/game";

// Forge Console state: folds the SSE stream of ForgeEvents into lanes, locker, discard bin and log.

export interface ForgeView {
  lanes: LaneState[];
  locker: { sha: string; codename: string }[];
  discard: { sha: string; subject?: string; reason: string }[];
  log: string[];
  funnel?: Funnel;
  running: boolean;
}

const emptyLane = (): LaneState => ({ stage: "idle", failLights: [] });

export function initial(workers: number): ForgeView {
  return {
    lanes: Array.from({ length: workers }, emptyLane),
    locker: [],
    discard: [],
    log: [],
    running: false,
  };
}

export type Action = { type: "reset"; workers: number } | { type: "event"; e: ForgeEvent };

export function reduce(v: ForgeView, a: Action): ForgeView {
  if (a.type === "reset") return { ...initial(a.workers), running: true, funnel: v.funnel };
  const e = a.e;
  const lanes = [...v.lanes];
  const lane = (w: number) => {
    while (lanes.length <= w) lanes.push(emptyLane());
    return lanes[w] as LaneState;
  };
  const subjectOf = (sha: string) => v.lanes.find((l) => l.sha === sha)?.subject;
  switch (e.type) {
    case "stage": {
      const prev = lane(e.worker);
      const sameCase = prev.sha === e.fixSha;
      lanes[e.worker] = {
        sha: e.fixSha,
        subject: e.detail ?? (sameCase ? prev.subject : undefined),
        stage: e.stage,
        failLights: sameCase ? prev.failLights : [],
        passLight: sameCase ? prev.passLight : undefined,
        writing: e.stage === "brief",
      };
      return { ...v, lanes };
    }
    case "run": {
      const l = lane(e.worker);
      if (e.phase === "fail") {
        const failLights = [...l.failLights];
        failLights[e.attempt - 1] = e.ok;
        lanes[e.worker] = { ...l, failLights };
      } else lanes[e.worker] = { ...l, passLight: e.ok };
      return { ...v, lanes };
    }
    case "result": {
      if (e.status === "certified") return v; // the brief stage follows on some worker
      lanes[e.worker] = emptyLane();
      const reason = e.status.replace("rejected:", "");
      return {
        ...v,
        lanes,
        discard: [{ sha: e.fixSha, subject: subjectOf(e.fixSha), reason }, ...v.discard].slice(0, 30),
      };
    }
    case "briefed": {
      lanes[e.worker] = emptyLane();
      if (!e.ok) {
        return {
          ...v,
          lanes,
          discard: [{ sha: e.fixSha, subject: subjectOf(e.fixSha), reason: "brief" }, ...v.discard],
        };
      }
      return {
        ...v,
        lanes,
        locker: [{ sha: e.fixSha, codename: e.codename ?? e.fixSha.slice(0, 7) }, ...v.locker],
      };
    }
    case "log":
      return { ...v, log: [...v.log, e.message].slice(-60) };
    case "funnel":
      return { ...v, funnel: e.funnel };
    case "done":
      return { ...v, running: false, lanes: v.lanes.map(emptyLane) };
  }
}
