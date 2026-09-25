import { PixelArt, type Palette } from "./PixelArt";

// Custom pixel sprites (PROJECT.md 6A.5). 16x16 grids. k = outline, other letters per palette.

const K = "var(--color-line)";
const AMBER = "var(--color-amber)";
const STAMP = "var(--color-stamp)";
const PAPER = "var(--color-paper)";
const MANILA = "var(--color-manila)";
const NAVY = "var(--color-navy-2)";
const PASS = "var(--color-pass)";
const MUTED = "var(--color-muted)";

const base: Palette = { k: K, a: AMBER, r: STAMP, p: PAPER, m: MANILA, n: NAVY, g: PASS, u: MUTED };

// ---------------------------------------------------------------- props

export const PIN = [
  "....kkkk....",
  "...krrrrk...",
  "..krrpprrk..",
  "..krrrrrrk..",
  "..krrrrrrk..",
  "...krrrrk...",
  "....kkkk....",
  ".....kk.....",
  ".....kk.....",
  ".....k......",
];

export function CorkPin({ size = 22 }: { size?: number }) {
  return <PixelArt grid={PIN} palette={base} size={size} />;
}

export const CLIP = [
  "..kkkkk.",
  ".kuuuuuk",
  ".ku...uk",
  ".ku.k.uk",
  ".ku.k.uk",
  ".ku.k.uk",
  ".ku.k.uk",
  ".ku.k.uk",
  ".ku...uk",
  "..kuuuk.",
  "...kkk..",
];

export function PaperClip({ size = 28 }: { size?: number }) {
  return <PixelArt grid={CLIP} palette={base} size={size} />;
}

export const MAGNIFIER = [
  "...kkkk.....",
  "..kppppk....",
  ".kppaappk...",
  ".kpappppk...",
  ".kppppppk...",
  "..kppppk....",
  "...kkkkkk...",
  ".......kkk..",
  "........kkk.",
  ".........kk.",
];

export function DifficultyPip({ on, size = 18 }: { on: boolean; size?: number }) {
  return (
    <PixelArt
      grid={MAGNIFIER}
      palette={on ? base : { ...base, p: "transparent", a: "transparent", k: MUTED }}
      size={size}
      title={on ? "difficulty point" : undefined}
    />
  );
}

// ---------------------------------------------------------------- ranks

export type RankId = "rookie" | "detective" | "inspector" | "chief" | "commissioner";

const RANK_GRIDS: Record<RankId, string[]> = {
  rookie: [
    "................",
    "....kkkkkkkk....",
    "...kmmmmmmmmk...",
    "..kmmmmmmmmmmk..",
    "..kmmmmmmmmmmk..",
    "..kmmkmmmmkmmk..",
    "..kmmmkmmkmmmk..",
    "..kmmmmkkmmmmk..",
    "..kmmmmmmmmmmk..",
    "..kmmmmmmmmmmk..",
    "...kmmmmmmmmk...",
    "....kmmmmmmk....",
    ".....kmmmmk.....",
    "......kmmk......",
    ".......kk.......",
    "................",
  ],
  detective: [
    "................",
    "....kkkkkkkk....",
    "...knnnnnnnnk...",
    "..knnnnnnnnnnk..",
    "..knnnkkkknnnk..",
    "..knnkppppknnk..",
    "..knnkpaapknnk..",
    "..knnkppppknnk..",
    "..knnnkkkkknnk..",
    "..knnnnnnnkknk..",
    "...knnnnnnnkkk..",
    "....knnnnnnk....",
    ".....knnnnk.....",
    "......knnk......",
    ".......kk.......",
    "................",
  ],
  inspector: [
    ".......kk.......",
    "......kaak......",
    ".....kaaaak.....",
    "..kkkkkaakkkkk..",
    "..knnnnkknnnnk..",
    "..knnnnnnnnnnk..",
    "..knakknnkkank..",
    "..knnaakkaannk..",
    "..knakknnkkank..",
    "..knnaakkaannk..",
    "...knnnnnnnnk...",
    "....knnnnnnk....",
    ".....knnnnk.....",
    "......knnk......",
    ".......kk.......",
    "................",
  ],
  chief: [
    "..kk........kk..",
    ".kaak......kaak.",
    "..kk.kkkkkk.kk..",
    "....krrrrrrk....",
    "...krrrrrrrrk...",
    "..krrkaarrkaark.",
    "..krrkaarrkaark.",
    "..krrrrrrrrrrk..",
    "..krrraaaarrrk..",
    "..krrrrrrrrrrk..",
    "...krrrrrrrrk...",
    "....krrrrrrk....",
    ".....krrrrk.....",
    "......krrk......",
    ".......kk.......",
    "................",
  ],
  commissioner: [
    "................",
    "..k...kk...k....",
    ".kak.kaak.kak...",
    ".kaakaaaakaak...",
    ".kaaaaaaaaaak...",
    ".kaaraaraaraak..",
    ".kaaaaaaaaaak...",
    ".kkkkkkkkkkkk...",
    "..knnnnnnnnk....",
    "..knnaaaannk....",
    "..knaakkaank....",
    "..knnaaaannk....",
    "...knnnnnnk.....",
    "....knnnnk......",
    ".....kkkk.......",
    "................",
  ],
};

export function RankInsignia({ rank, size = 48 }: { rank: RankId; size?: number }) {
  return <PixelArt grid={RANK_GRIDS[rank]} palette={base} size={size} title={`${rank} insignia`} />;
}

// ---------------------------------------------------------------- badges

export type BadgeId =
  | "cold-case-closed"
  | "clean-hands"
  | "beat-the-clock"
  | "race-hunter"
  | "protocol-whisperer"
  | "precinct-master"
  | "faster-than-original";

const BADGE_GRIDS: Record<BadgeId, string[]> = {
  "cold-case-closed": [
    "................",
    "..kkkkk.........",
    ".kmmmmmkkkkkkkk.",
    ".kmmmmmmmmmmmmk.",
    ".kmmmmmmmmmmmmk.",
    ".kmmmmmmmmmgmmk.",
    ".kmmmmmmmmggmmk.",
    ".kmmgmmmmggmmmk.",
    ".kmmggmmggmmmmk.",
    ".kmmmggggmmmmmk.",
    ".kmmmmggmmmmmmk.",
    ".kmmmmmmmmmmmmk.",
    ".kkkkkkkkkkkkkk.",
    "................",
    "................",
    "................",
  ],
  "clean-hands": [
    "......kk........",
    "....kkppkkk.....",
    "...kppkppkpk....",
    "...kppkppkpkk...",
    "...kppkppkpkpk..",
    "...kppppppppppk.",
    "...kpppppppppk..",
    "...kppppppppk...",
    "....kpppppppk...",
    ".....kppppppk...",
    "......kkkkkk....",
    ".aa..........aa.",
    "aaaa........aaaa",
    ".aa..........aa.",
    "................",
    "................",
  ],
  "beat-the-clock": [
    ".....kkkkkk.....",
    "...kkppppppkk...",
    "..kpppppkppppk..",
    ".kppppppkpppppk.",
    ".kppppppkpppppk.",
    "kppppppkkppppppk",
    "kpppppkkkkkkpppk",
    "kppppppppppppppk",
    "kppppppppppppppk",
    ".kppppppppppppk.",
    ".kppppppppppppk.",
    "..kppppppppppk..",
    "...kkppppppkk...",
    ".....kkkkkk.....",
    "....aa....aa....",
    "................",
  ],
  "race-hunter": [
    "........kkk.....",
    ".......kaak.....",
    "......kaak......",
    ".....kaak.......",
    "....kaakkkkk....",
    "...kaaaaaaak....",
    "..kkkkkaaak.....",
    "......kaak......",
    ".....kaak.......",
    "....kaak........",
    "...kaak.........",
    "...kak..........",
    "...kk...........",
    "................",
    "................",
    "................",
  ],
  "protocol-whisperer": [
    "................",
    ".kkkkkkkkkkkkkk.",
    ".kpkppppppppkpk.",
    ".kppkppppppkppk.",
    ".kpppkppppkpppk.",
    ".kppppkkkkppppk.",
    ".kppppppppppppk.",
    ".kppppppppppppk.",
    ".kkkkkkkkkkkkkk.",
    "................",
    "..nkn.nnk.knn...",
    "..knk.kkn.nkk...",
    "................",
    "................",
    "................",
    "................",
  ],
  "precinct-master": [
    ".......kk.......",
    "......kaak......",
    "..kkkkkaakkkkk..",
    "..kaaaaaaaaaak..",
    "...kaaaaaaaak...",
    "....kaaaaaak....",
    "....kaakkaak....",
    "...kaak..kaak...",
    "...kkk....kkk...",
    "................",
    ".kkkkkkkkkkkkkk.",
    ".knnnnnnnnnnnnk.",
    ".knpnnpnnpnnpnk.",
    ".knnnnnnnnnnnnk.",
    ".kkkkkkkkkkkkkk.",
    "................",
  ],
  "faster-than-original": [
    "..........kkk...",
    ".........kppk...",
    "........kpppk...",
    ".......kpprpk...",
    "......kpprrpk...",
    ".....kpppppk....",
    "..kkkpppppk.....",
    ".kaakpppkk......",
    "..kkppppk.......",
    "...kppkkk.......",
    "..kaak..........",
    ".kaak...........",
    ".kak............",
    ".kk.............",
    "................",
    "................",
  ],
};

export function BadgeArt({
  badge,
  locked = false,
  size = 40,
}: {
  badge: BadgeId;
  locked?: boolean;
  size?: number;
}) {
  const palette = locked
    ? Object.fromEntries(Object.keys(base).map((k) => [k, k === "k" ? MUTED : "transparent"]))
    : base;
  return <PixelArt grid={BADGE_GRIDS[badge]} palette={palette} size={size} />;
}
