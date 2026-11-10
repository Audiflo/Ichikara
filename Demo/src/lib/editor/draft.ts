import { parseProject, serializeProject, type Project } from "ichikara";

const DRAFT_KEY = "ichikara.draft.v1";

/** Recovered working copy and the file snapshot used to track unsaved changes. */
export interface Draft {
  project: Project;
  savedDocument: string;
}

/** Read a validated recovery snapshot. Corrupt data and inaccessible storage throw. */
export function readDraft(storage: Pick<Storage, "getItem">): Draft | null {
  const source = storage.getItem(DRAFT_KEY);
  if (source === null) return null;
  const value: unknown = JSON.parse(source);
  if (
    typeof value !== "object" ||
    value === null ||
    !("project" in value) ||
    !("savedDocument" in value) ||
    typeof value.savedDocument !== "string"
  ) {
    throw new TypeError("Invalid recovery draft");
  }
  parseProject(value.savedDocument);
  return { project: parseProject(JSON.stringify(value.project)), savedDocument: value.savedDocument };
}

/** Atomically replace the browser draft; quota and validation errors propagate to the UI. */
export function writeDraft(storage: Pick<Storage, "setItem">, project: Project, savedDocument: string): void {
  parseProject(savedDocument);
  const document = serializeProject(project);
  storage.setItem(DRAFT_KEY, `{"project":${document},"savedDocument":${JSON.stringify(savedDocument)}}`);
}
