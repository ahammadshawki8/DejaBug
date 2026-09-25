import { Search } from "pixelarticons/react/Search.js";
import { usePageTitle } from "./pageTitle";
import { Placeholder } from "./Placeholder";

export function InvestigationPage() {
  usePageTitle("Investigation", <Search />);
  return <Placeholder item="T5.6" />;
}
