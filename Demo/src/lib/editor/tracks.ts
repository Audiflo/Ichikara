import type { Project } from "@audiflo/ichikara";

/** Set one track's language by stable id; return false when the id is no longer present. */
export function setTrackLanguage(project: Project, trackId: string, language: string): boolean {
  const track = project.tracks.find((candidate) => candidate.id === trackId);
  if (!track) return false;
  track.language = language;
  return true;
}
