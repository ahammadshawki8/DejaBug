import { Trophy } from "pixelarticons/react/Trophy.js";
import { usePageTitle } from "./pageTitle";
import { Placeholder } from "./Placeholder";

export function ProgressPage() {
  usePageTitle("Progress", <Trophy />);
  return <Placeholder item="T6.2" />;
}
