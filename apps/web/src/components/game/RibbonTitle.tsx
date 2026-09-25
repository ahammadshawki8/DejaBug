import type { ReactNode } from "react";

// Page title as a stamp-red ribbon banner with an arrow tail (6A.1, 6A.6).

export function RibbonTitle({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <h1 className="relative inline-flex items-center">
      <span className="flex items-center gap-3 border-[3px] border-r-0 border-line bg-stamp py-2 pl-4 pr-3 font-display text-xl uppercase text-paper shadow-hard [&>svg]:size-6">
        {icon}
        {children}
      </span>
      {/* Arrow tail: a notched triangle drawn with clip-path, outlined by an offset copy. */}
      <span aria-hidden className="relative h-[52px] w-7 self-stretch">
        <span className="absolute inset-0 bg-line [clip-path:polygon(0_0,100%_50%,0_100%)]" />
        <span className="absolute inset-[3px_6px_3px_0] bg-stamp [clip-path:polygon(0_0,100%_50%,0_100%)]" />
      </span>
    </h1>
  );
}
