import { useEffect } from "react";
import { useSettings } from "../state/settings";
import { resumeLofi, setLofiTheme, setLofiVolume, startLofi, stopLofi } from "./lofi";

/** Keeps the lofi radio in step with the settings. Mounted once, in the app layout. */
export function useLofi(): void {
  const on = useSettings((s) => s.musicOn);
  const volume = useSettings((s) => s.musicVolume);
  const theme = useSettings((s) => s.musicTheme);

  useEffect(() => setLofiTheme(theme), [theme]);
  useEffect(() => setLofiVolume(volume), [volume]);
  useEffect(() => {
    if (on) startLofi();
    else stopLofi();
  }, [on]);

  // A radio left on from a previous visit can only start after the first click or key press.
  useEffect(() => {
    const wake = () => resumeLofi();
    window.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", wake);
    return () => {
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
    };
  }, []);
}
