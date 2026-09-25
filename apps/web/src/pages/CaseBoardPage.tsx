import { Folder } from "pixelarticons/react/Folder.js";
import { usePageTitle } from "./pageTitle";
import { Placeholder } from "./Placeholder";

export function CaseBoardPage() {
  usePageTitle("Case Board", <Folder />);
  return <Placeholder item="T5.4, IBM Bob" />;
}
