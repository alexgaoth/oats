import { useEffect, useState } from "react";
import { continueRender, delayRender, staticFile } from "remotion";
import type { Capture } from "./types";

/** The director's log for a clip, loaded before the first frame renders. */
export function useCapture(name: string): Capture | null {
  const [capture, setCapture] = useState<Capture | null>(null);
  const [handle] = useState(() => delayRender(`Loading clips/${name}.json`));
  useEffect(() => {
    fetch(staticFile(`clips/${name}.json`))
      .then((response) => response.json())
      .then((json) => {
        setCapture(json);
        continueRender(handle);
      })
      .catch((error) => {
        console.error(error);
        continueRender(handle);
      });
  }, [handle, name]);
  return capture;
}
