import { Sliders } from "pixelarticons/react/Sliders.js";
import { usePageTitle } from "./pageTitle";
import { Placeholder } from "./Placeholder";

export function SettingsPage() {
  usePageTitle("Settings", <Sliders />);
  return <Placeholder item="T5.7" />;
}
