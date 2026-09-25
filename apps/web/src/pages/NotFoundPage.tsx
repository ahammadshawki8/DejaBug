import { Link } from "react-router-dom";
import { PaperPanel, Stamp } from "../components/game";
import { usePageTitle } from "./pageTitle";

export function NotFoundPage() {
  usePageTitle("File not found");
  return (
    <PaperPanel tone="paper" className="mt-6 max-w-xl p-8">
      <Stamp size="lg">No such file</Stamp>
      <p className="mt-6 font-typewriter">
        This drawer is empty. The case you asked for is not in the archive.
      </p>
      <Link to="/" className="mt-4 inline-block font-display text-sm uppercase text-stamp underline">
        Back to the case board
      </Link>
    </PaperPanel>
  );
}
