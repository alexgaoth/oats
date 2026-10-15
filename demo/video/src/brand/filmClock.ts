import { createContext, useContext } from "react";
import { useCurrentFrame } from "remotion";

/**
 * The film's own frame, for what must not restart with each scene: the
 * backdrop's slow fluid. Inside a Sequence, useCurrentFrame() counts from the
 * scene's start, so two scenes in a dissolve would show the fluid at two
 * different moments. Outside the film (a README still), the local frame.
 */
export const FilmClock = createContext<number | null>(null);

export function useFilmFrame(): number {
  const local = useCurrentFrame();
  const film = useContext(FilmClock);
  return film ?? local;
}
