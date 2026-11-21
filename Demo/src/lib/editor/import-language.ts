import {
  detectUfDataLanguages,
  ufDataToProject,
  type IdFactory,
  type LanguageDetection,
  type Project,
  type UfData,
} from "@audiflo/ichikara";

/** Language codes offered by the import picker. */
export const IMPORT_LANGUAGES = ["jp", "en", "zh"] as const;

/** A language selectable for one imported track. */
export type ImportLanguage = (typeof IMPORT_LANGUAGES)[number];

/** One row in the import language picker. */
export interface ImportLanguageChoice {
  trackName: string;
  detected: LanguageDetection;
  language: ImportLanguage;
}

/** Parsed import data plus the editable per-track language choices. */
export interface ImportLanguagePlan {
  data: UfData;
  choices: ImportLanguageChoice[];
  needsReview: boolean;
}

function importLanguage(value: string): ImportLanguage {
  if (value === "en") return "en";
  if (value === "zh") return "zh";
  return "jp";
}

/** Detect languages and decide whether the user must review them before importing. */
export function planImportLanguages(data: UfData): ImportLanguagePlan {
  const detections = detectUfDataLanguages(data);
  const choices = data.project.tracks.map((track, index): ImportLanguageChoice => {
    const detected = detections[index] ?? { language: "jp", confident: false };
    return {
      trackName: track.name || `Track ${index + 1}`,
      detected,
      language: importLanguage(detected.language),
    };
  });
  return {
    data,
    choices,
    needsReview: choices.length > 1 || choices.some((choice) => !choice.detected.confident),
  };
}

/** Change one track's language in a plan; return false when the row does not exist. */
export function setImportLanguage(plan: ImportLanguagePlan, index: number, language: ImportLanguage): boolean {
  const choice = plan.choices[index];
  if (!choice) return false;
  choice.language = language;
  return true;
}

/** Build the native project from reviewed per-track language choices. */
export function buildImportProject(plan: ImportLanguagePlan, id: IdFactory): Project {
  return ufDataToProject(plan.data, plan.choices.map((choice) => choice.language), id);
}
