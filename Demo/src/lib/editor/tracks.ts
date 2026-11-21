import { detectLanguage, type Project } from "@audiflo/ichikara";

/** Set one track's language by stable id; return false when the id is no longer present. */
export function setTrackLanguage(project: Project, trackId: string, language: string): boolean {
  const track = project.tracks.find((candidate) => candidate.id === trackId);
  if (!track) return false;
  track.language = language;
  return true;
}

/** Detect a likely language for every track from its note lyrics. */
export function detectProjectLanguages(project: Project): string[] {
  return project.tracks.map((track) => detectLanguage(track.parts.flatMap((part) => part.notes.map((note) => note.lyric))));
}

/** Apply per-track languages in track order, leaving tracks without a selection unchanged. */
export function applyTrackLanguages(project: Project, languages: readonly string[]): void {
  project.tracks.forEach((track, index) => {
    const language = languages[index];
    if (language !== undefined) track.language = language;
  });
}
