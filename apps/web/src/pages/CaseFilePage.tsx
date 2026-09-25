import { FileText } from "pixelarticons/react/FileText.js";
import { usePageTitle } from "./pageTitle";
import { Placeholder } from "./Placeholder";

export function CaseFilePage() {
  usePageTitle("Case File", <FileText />);
  return <Placeholder item="T5.5" />;
}
