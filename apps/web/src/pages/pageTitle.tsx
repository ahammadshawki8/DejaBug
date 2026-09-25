import { createContext, useContext, useEffect, type ReactNode } from "react";
import { RibbonTitle } from "../components/game/RibbonTitle";

// Each page sets the ribbon title shown in the shell's top bar.

export interface PageTitleState {
  text: string;
  node?: ReactNode;
}

export const PageTitleContext = createContext<(t: PageTitleState) => void>(() => undefined);

export function usePageTitle(text: string, icon?: ReactNode): void {
  const set = useContext(PageTitleContext);
  useEffect(() => {
    set({ text, node: <RibbonTitle icon={icon}>{text}</RibbonTitle> });
    document.title = `${text} | DejaBug`;
    // The icon element is recreated on every render; the title text is the stable identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [set, text]);
}
