import { scoreToUfData, exportUfDataToBytes, type ExportOptions } from "../export/ufdata";
import { ufDataToScore, parseUfData, type UfData } from "../import/ufdata";
import { elementAt, integerInRange } from "../core/validation";
import { createProject, projectFromScore } from "./document";
import { validateProject } from "./validation";
import { MeterMap } from "./meter";
import type { Project, IdFactory } from "./types";

const FORMAT_RESOLUTION = 480;

/** Convert every native track to interchange data, preserving absolute region placement and pitch.
 * Native voice, mix and expression settings remain in .ichi files; UtaFormatix does not represent them.
 * See https://github.com/sdercolin/utaformatix-data
 */
export function projectToUfData(project: Project, options: ExportOptions = {}): ReturnType<typeof scoreToUfData> {
  validateProject(project);
  const empty = scoreToUfData(
    { notes: [], tempos: project.tempos, resolution: project.resolution },
    { ...options, projectName: project.name },
  );
  empty.project.tracks = project.tracks.map((track) => {
    const score = {
      resolution: project.resolution,
      tempos: project.tempos,
      voice: track.name,
      notes: track.parts
        .flatMap((part) => part.notes.map((note) => ({ ...note, tick: note.tick + part.tick })))
        .sort((a, b) => a.tick - b.tick),
    };
    return elementAt(scoreToUfData(score, options).project.tracks, 0);
  });
  const meter = new MeterMap(project.meters, project.resolution);
  empty.project.timeSignatures = project.meters.map((event, index) => {
    const previous = project.meters[index - 1];
    if (previous && (event.tick - previous.tick) % ((project.resolution * 4 * previous.numerator) / previous.denominator) !== 0) {
      throw new RangeError("Interchange formats require meter changes at bar boundaries. Save as .ichi to retain this meter map.");
    }
    return { measurePosition: meter.positionAt(event.tick).bar - 1, numerator: event.numerator, denominator: event.denominator };
  });
  return empty;
}

/** Import every interchange track into a native song with host-supplied stable identities. */
export function ufDataToProject(data: UfData, language: string, id: IdFactory): Project {
  const project = createProject(data.project.name, id);
  project.resolution = FORMAT_RESOLUTION;
  project.tempos = data.project.tempos.map((event) => ({ tick: event.tickPosition, tempo: event.bpm })).sort((a, b) => a.tick - b.tick);
  if (project.tempos[0]?.tick !== 0) project.tempos.unshift({ tick: 0, tempo: 120 });
  for (const [trackIndex, source] of data.project.tracks.entries()) {
    const imported = projectFromScore(ufDataToScore(data, { trackIndex }), project.name, language, id);
    const track = elementAt(imported.tracks, 0);
    track.name = source.name;
    project.tracks.push(track);
  }
  const signatures = [...(data.project.timeSignatures ?? [])].sort((a, b) => a.measurePosition - b.measurePosition);
  if (signatures[0]?.measurePosition !== 0) signatures.unshift({ measurePosition: 0, numerator: 4, denominator: 4 });
  project.meters = [];
  let previousMeasure = -1;
  for (const signature of signatures) {
    integerInRange(signature.measurePosition, "meter measure", 0);
    if (signature.measurePosition <= previousMeasure) throw new RangeError("Duplicate meter measure");
    const tick = new MeterMap(project.meters, project.resolution).tickAtBar(signature.measurePosition + 1);
    project.meters.push({ tick, numerator: signature.numerator, denominator: signature.denominator });
    previousMeasure = signature.measurePosition;
  }
  validateProject(project);
  return project;
}

/** Parse a complete supported singing-project file. Conversion and validation failures propagate. */
export async function importProjectFromFile(file: File, language: string, id: IdFactory): Promise<Project> {
  return ufDataToProject(await parseUfData(file, file.name), language, id);
}

/** Generate whole-song interchange bytes; unsupported or lossy timeline structures throw. */
export async function exportProjectToBytes(project: Project, options: ExportOptions = {}): Promise<Uint8Array> {
  return exportUfDataToBytes(projectToUfData(project, options), options);
}
