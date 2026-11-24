import type { PitchBend } from "../core/types";
import { TempoMap } from "../core/timing";
import { elementAt } from "../core/validation";
import { validateProject } from "./validation";
import type { IdFactory, Project, ProjectNote, VocalPart } from "./types";

function projectEnd(project: Project): number {
  let end = 0;
  for (const track of project.tracks) {
    for (const part of track.parts) end = Math.max(end, part.tick + part.length);
  }
  return end;
}

function uniqueName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  let suffix = 2;
  while (used.has(`${name} (${suffix})`)) suffix++;
  const result = `${name} (${suffix})`;
  used.add(result);
  return result;
}

/** Rescale pitch points to the note's new length and drop collisions from rounding. */
function retimePitchBend(bend: PitchBend, sourceLength: number, targetLength: number): PitchBend {
  const scale = targetLength / sourceLength;
  const ticks: number[] = [];
  const values: number[] = [];
  for (const [index, sourceTick] of bend.ticks.entries()) {
    const tick = Math.max(0, Math.min(targetLength, Math.round(sourceTick * scale)));
    if (ticks.length > 0 && tick <= elementAt(ticks, ticks.length - 1)) continue;
    ticks.push(tick);
    values.push(elementAt(bend.values, index));
  }
  return { ticks, values };
}

/** Append a project's tracks after the target's last part.
 *
 *  Source timing is converted through real time so tempo and resolution changes
 *  preserve note placement and duration. The target's timeline, voice settings,
 *  and mix controls stay untouched. Both projects remain valid on return; IDs are
 *  regenerated and duplicate track names are disambiguated.
 */
export function appendProject(target: Project, source: Project, id: IdFactory): Project {
  validateProject(target);
  validateProject(source);

  const sourceMap = new TempoMap(source.tempos, source.resolution);
  const targetMap = new TempoMap(target.tempos, target.resolution);
  const sourceZero = targetMap.tickAt(sourceMap.secondsAt(0));
  const atTargetTick = (sourceTick: number): number => targetMap.tickAt(sourceMap.secondsAt(sourceTick));
  const relativeTick = (sourceTick: number): number => Math.round(atTargetTick(sourceTick) - sourceZero);
  const appendTick = projectEnd(target);
  const usedNames = new Set(target.tracks.map((track) => track.name));

  for (const sourceTrack of source.tracks) {
    const track = structuredClone(sourceTrack);
    track.id = id();
    track.name = uniqueName(sourceTrack.name, usedNames);
    track.parts = [];

    for (const sourcePart of sourceTrack.parts) {
      const partOffset = relativeTick(sourcePart.tick);
      let partLength = Math.max(1, relativeTick(sourcePart.tick + sourcePart.length) - partOffset);
      const notes: ProjectNote[] = [];

      for (const sourceNote of sourcePart.notes) {
        const note = structuredClone(sourceNote);
        const start = relativeTick(sourcePart.tick + note.tick) - partOffset;
        const end = relativeTick(sourcePart.tick + note.tick + note.length) - partOffset;
        note.id = id();
        note.tick = Math.max(0, start);
        note.length = Math.max(1, end - note.tick);
        if (note.pitchBend) note.pitchBend = retimePitchBend(note.pitchBend, sourceNote.length, note.length);
        partLength = Math.max(partLength, note.tick + note.length);
        notes.push(note);
      }

      const part: VocalPart = {
        ...structuredClone(sourcePart),
        id: id(),
        tick: appendTick + partOffset,
        length: partLength,
        notes,
      };
      track.parts.push(part);
    }

    target.tracks.push(track);
  }

  validateProject(target);
  return target;
}
