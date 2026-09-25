import type { SVGProps } from "react";

// Pixel art from character grids (PROJECT.md 6A.5): each character is one pixel, "." is transparent,
// and the palette maps characters to CSS colors (use design tokens, e.g. "var(--color-amber)").

export type Palette = Record<string, string>;

export interface PixelArtProps extends Omit<SVGProps<SVGSVGElement>, "fill"> {
  grid: readonly string[];
  palette: Palette;
  size?: number | string;
  title?: string;
}

export function PixelArt({ grid, palette, size = 32, title, ...rest }: PixelArtProps) {
  const h = grid.length;
  const w = Math.max(...grid.map((r) => r.length));
  const rects: JSX.Element[] = [];
  grid.forEach((row, y) => {
    // Merge horizontal runs of the same color into one rect: fewer nodes, no hairline seams.
    let x = 0;
    while (x < row.length) {
      const ch = row[x] as string;
      let run = 1;
      while (x + run < row.length && row[x + run] === ch) run++;
      const fill = palette[ch];
      if (ch !== "." && fill)
        rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={run} height={1} fill={fill} />);
      x += run;
    }
  });
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {rects}
    </svg>
  );
}
