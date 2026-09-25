import { Zap } from "pixelarticons/react/Zap.js";
import { usePageTitle } from "./pageTitle";
import { Placeholder } from "./Placeholder";

export function ForgePage() {
  usePageTitle("Forge", <Zap />);
  return <Placeholder item="T7.1" />;
}
