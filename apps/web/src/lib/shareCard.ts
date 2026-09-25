// "Case Closed" share card (PROJECT.md T6.3): drawn on a canvas with the game's fonts and colors,
// downloaded as a PNG. No network, no personal data: codename, repo, times and XP only.

export interface ShareCardData {
  codename: string;
  repo: string;
  seconds: number;
  hints: number;
  xp: number;
  originalDays?: number;
  rank: string;
}

const C = {
  ink: "#0B1426",
  navy: "#14223F",
  line: "#05080F",
  manila: "#E8D49B",
  paper: "#F7F1E1",
  stamp: "#D7263D",
  amber: "#FFB627",
  muted: "#8A93A6",
};

function mmss(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

export async function renderShareCard(d: ShareCardData): Promise<Blob> {
  await document.fonts.ready;
  const W = 1200;
  const H = 630;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");

  ctx.fillStyle = C.ink;
  ctx.fillRect(0, 0, W, H);

  // Manila folder with a hard shadow.
  ctx.fillStyle = C.line;
  ctx.fillRect(72, 82, 1060, 480);
  ctx.fillStyle = C.manila;
  ctx.fillRect(60, 70, 1060, 480);
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 6;
  ctx.strokeRect(60, 70, 1060, 480);

  ctx.fillStyle = C.line;
  ctx.font = '22px "Silkscreen"';
  ctx.fillText(`DEJABUG / ${d.repo.toUpperCase()}`, 100, 125);

  ctx.font = '56px "Silkscreen"';
  const titleLines = wrap(ctx, d.codename.toUpperCase(), 700).slice(0, 2);
  titleLines.forEach((l, i) => ctx.fillText(l, 100, 200 + i * 66));

  const stats: [string, string][] = [
    ["TIME", mmss(d.seconds)],
    ["HINTS", String(d.hints)],
    ["XP", `+${d.xp}`],
    ["ORIGINAL TEAM", d.originalDays === undefined ? "n/a" : `${d.originalDays.toFixed(1)} DAYS`],
  ];
  stats.forEach(([label, value], i) => {
    const x = 100 + i * 250;
    ctx.fillStyle = C.line;
    ctx.font = '18px "Silkscreen"';
    ctx.fillText(label, x, 400);
    ctx.font = '600 44px "IBM Plex Mono"';
    ctx.fillText(value, x, 452);
  });

  ctx.font = '20px "IBM Plex Sans"';
  ctx.fillStyle = C.navy;
  ctx.fillText(
    `Rank: ${d.rank}. A real bug, certified: the test failed before the fix and passes after it.`,
    100,
    510,
  );

  // The CASE CLOSED stamp, tilted.
  ctx.save();
  ctx.translate(900, 215);
  ctx.rotate((-12 * Math.PI) / 180);
  ctx.strokeStyle = C.stamp;
  ctx.fillStyle = C.stamp;
  ctx.lineWidth = 8;
  ctx.strokeRect(-190, -60, 380, 120);
  ctx.lineWidth = 3;
  ctx.strokeRect(-178, -48, 356, 96);
  ctx.font = '44px "Silkscreen"';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("CASE CLOSED", 0, 4);
  ctx.restore();

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("could not encode PNG"))), "image/png"),
  );
}

export async function downloadShareCard(d: ShareCardData): Promise<void> {
  const blob = await renderShareCard(d);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `dejabug-${d.codename.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
