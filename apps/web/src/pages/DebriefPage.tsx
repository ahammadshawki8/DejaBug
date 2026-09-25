import { Trophy } from "pixelarticons/react/Trophy.js";
import { usePageTitle } from "./pageTitle";
import { Placeholder } from "./Placeholder";

export function DebriefPage() {
  usePageTitle("Debrief", <Trophy />);
  return <Placeholder item="T5.6" />;
}
