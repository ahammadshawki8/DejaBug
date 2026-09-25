// Shared contracts between the engine and the web app (PROJECT.md Section 5).

export type Difficulty = 1 | 2 | 3;

/** A fix-like commit that passed the miner's filters (T1.2). */
export interface Candidate {
  fixSha: string;
  parentSha: string;
  subject: string;
  date: string; // ISO 8601
  prNumber?: number;
  sourceFiles: string[];
  testFiles: string[];
  packages: string[]; // go test package args: "." for the repo root, "./sub/dir" otherwise
  tests: string[]; // test function names added or changed by the fix
}

/** Output of `dejabug mine` (cases/<repo>/candidates.json), input of `dejabug certify`. */
export interface CandidatesFile {
  repo: string;
  generatedAt: string;
  scannedCommits: number;
  fixLikeCommits: number;
  candidates: Candidate[];
}

export type CertificationStatus =
  | "certified"
  | "rejected:build"
  | "rejected:no-fail"
  | "rejected:flaky"
  | "rejected:no-pass"
  | "rejected:timeout";

/** Result of certifying one candidate (T2.1). */
export interface Certification {
  fixSha: string;
  status: CertificationStatus;
  failRuns: number;
  passRuns: number;
  failOutput: string;
  passOutput: string;
  durationMs: number;
}

export interface Brief {
  codename: string;
  symptoms: string;
  evidence: string;
  hints: [string, string, string];
  difficulty: Difficulty;
  precinct: string;
  lesson: string;
  tags: string[];
}

export interface OriginalEffort {
  daysOpen?: number;
  comments?: number;
  reviewRounds?: number;
  mergedAt: string;
}

/** A certified, briefed training case (cases/<repo>/<id>.json). */
export interface Case {
  id: string; // short sha of the fix commit
  repo: string; // e.g. "IBM/sarama"
  fixSha: string;
  parentSha: string;
  prNumber?: number;
  status: "certified";
  tests: string[];
  packages: string[];
  certification: Omit<Certification, "fixSha" | "status">;
  brief: Brief;
  original: OriginalEffort;
  bugAgeDays: number;
  parSeconds: number;
  fixDiff: string; // revealed only in the debrief
}

/** Case as served before reveal: the fix diff is withheld. */
export type PublicCase = Omit<Case, "fixDiff">;

export interface Funnel {
  repo: string;
  fixLikeCommits: number;
  candidates: number;
  byStatus: Record<CertificationStatus, number>;
  generatedAt: string;
}

/** Progress events emitted by the forge pipeline and streamed over SSE (T2.2, T4.3). */
export type ForgeStage = "mine" | "certify" | "brief";

export type ForgeEvent =
  | { type: "stage"; worker: number; fixSha: string; stage: ForgeStage; detail?: string }
  | { type: "run"; worker: number; fixSha: string; phase: "fail" | "pass"; attempt: number; ok: boolean }
  | { type: "result"; worker: number; fixSha: string; status: CertificationStatus }
  | { type: "funnel"; funnel: Funnel }
  | { type: "done" };
