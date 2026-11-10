<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { Plus, FolderOpen, Save, Undo2, Redo2, Settings, PanelLeft, Music2, Trash2 } from "@lucide/svelte";
  import { Dialog, Tooltip as BitsTooltip } from "bits-ui";
  import {
    addTrack,
    addPart,
    createProject,
    projectFromScore,
    parseProject,
    serializeProject,
    streamProject,
    mixChunks,
    encodeWav,
    chitoseChika,
    importProjectFromFile,
    exportProjectToBytes,
    StreamPlayer,
    TempoMap,
    type Project,
    type ProjectNote,
    type VocalTrack,
    type AudioChunk,
  } from "@audiflo/ichikara";
  import Arrangement from "./components/Arrangement.svelte";
  import PianoRoll from "./components/PianoRoll.svelte";
  import NoteInspector from "./components/NoteInspector.svelte";
  import VoicePanel from "./components/VoicePanel.svelte";
  import TransportBar from "./components/TransportBar.svelte";
  import SettingsPanel from "./components/SettingsPanel.svelte";
  import TimelinePanel from "./components/TimelinePanel.svelte";
  import ResizeHandle from "./components/ui/ResizeHandle.svelte";
  import { createDemoScore } from "./lib/score";
  import { EditorHistory } from "./lib/editor/history";
  import { downloadFile } from "./lib/editor/files";
  import { readDraft, writeDraft } from "./lib/editor/draft";
  import { defaultPreferences, layoutBounds, readPreferences, writePreferences } from "./lib/editor/preferences";
  import { constrainPane, workspaceSize } from "./lib/editor/layout";
  import { createWorkerStream } from "./lib/workerStream";
  import { createResilientStream, type CancellableAudio } from "./lib/render/resilient-stream";

  const id = (): string => crypto.randomUUID();
  const initial = projectFromScore(createDemoScore("jp"), "First phrase", "jp", id);
  let project = $state<Project>(initial);
  const history = new EditorHistory(initial);
  let trackId = $state<string | null>(initial.tracks[0]?.id ?? null);
  let partId = $state<string | null>(initial.tracks[0]?.parts[0]?.id ?? null);
  let selectedNote = $state<number | null>(null);
  const track = $derived(project.tracks.find((track) => track.id === trackId));
  const part = $derived(track?.parts.find((part) => part.id === partId));
  const note = $derived(selectedNote === null ? undefined : part?.notes[selectedNote]);
  let canUndo = $state(false);
  let canRedo = $state(false);
  let savedDocument = serializeProject(initial);
  let savedSignature = $state(JSON.stringify(initial));
  const dirty = $derived(JSON.stringify(project) !== savedSignature);
  let pendingProject: Project | null = $state(null);
  let replaceOpen = $state(false);
  let recoveryMessage = $state("");
  let settingsOpen = $state(false);
  let timelineOpen = $state(false);
  let inspectorOpen = $state(true);
  let advancedOpen = $state(false);
  let preferences = $state({ ...defaultPreferences });
  let preferencesReady = $state(false);
  let preferencesMessage = $state("");
  let editorsHeight = $state(1);
  let workspaceWidth = $state(0);
  const usableHeight = $derived(Math.max(workspaceSize.arrangement + workspaceSize.part, editorsHeight - workspaceSize.divider));
  const arrangementSize = $derived(
    constrainPane(
      preferences.arrangementRatio * usableHeight,
      usableHeight,
      Math.max(workspaceSize.arrangement, usableHeight * layoutBounds.arrangementRatio.min),
      usableHeight * layoutBounds.arrangementRatio.max,
      workspaceSize.part,
    ),
  );
  const inspectorSize = $derived(
    constrainPane(
      preferences.inspectorWidth,
      workspaceWidth,
      layoutBounds.inspectorWidth.min,
      layoutBounds.inspectorWidth.max,
      workspaceSize.editorWidth + workspaceSize.divider,
    ),
  );
  let errorMessage = $state("");
  let renderNotice = $state("");
  let fileInput: HTMLInputElement | undefined;
  let volume = $state(0.8);
  let exporting = $state(false);
  let buffering = $state(false);
  let playerState = $state("idle");
  let bufferAhead = $state(0);
  let playheadTick = $state<number | null>(null);
  let player: StreamPlayer | null = $state(null);
  let currentStream: CancellableAudio | null = null;
  let frame = 0;
  let playbackTiming: TempoMap | null = null;
  const timing = $derived(new TempoMap(project.tempos, project.resolution));
  const totalTicks = $derived(
    project.tracks.reduce((end, track) => track.parts.reduce((end, part) => Math.max(end, part.tick + part.length), end), 0),
  );

  function synchronizeHistory(): void {
    canUndo = history.canUndo;
    canRedo = history.canRedo;
  }

  function saveSnapshot(): void {
    if (part) part.length = part.notes.reduce((end, note) => Math.max(end, note.tick + note.length), part.length);
    history.push($state.snapshot(project));
    synchronizeHistory();
    persistDraft();
  }

  function updateNote(next: ProjectNote): void {
    if (!part) return;
    const index = part.notes.findIndex((note) => note.id === next.id);
    if (index < 0) return;
    part.notes[index] = next;
    saveSnapshot();
  }

  function select(nextTrack: string, nextPart: string | null): void {
    trackId = nextTrack;
    partId = nextPart;
    selectedNote = null;
  }

  function restore(next: Project): void {
    handleStop();
    project = next;
    const selectedTrack = next.tracks.find((track) => track.id === trackId) ?? next.tracks[0];
    select(selectedTrack?.id ?? "", selectedTrack?.parts.find((part) => part.id === partId)?.id ?? selectedTrack?.parts[0]?.id ?? null);
    synchronizeHistory();
    persistDraft();
  }

  function undo(): void {
    restore(history.undo());
  }
  function redo(): void {
    restore(history.redo());
  }

  function newTrack(): void {
    const added = addTrack(project, `Vocal ${project.tracks.length + 1}`, chitoseChika, "jp", id);
    const region = addPart(added, "Untitled part", 0, project.resolution * 16, id);
    select(added.id, region.id);
    saveSnapshot();
  }

  function newPart(target: VocalTrack): void {
    const end = target.parts.reduce((end, part) => Math.max(end, part.tick + part.length), 0);
    const region = addPart(target, "Untitled part", end, project.resolution * 16, id);
    select(target.id, region.id);
    saveSnapshot();
  }

  function deleteTrack(): void {
    project.tracks = project.tracks.filter((candidate) => candidate.id !== trackId);
    const next = project.tracks[0];
    select(next?.id ?? "", next?.parts[0]?.id ?? null);
    saveSnapshot();
  }

  function duplicatePart(): void {
    if (!part || !track) return;
    const copy = {
      ...$state.snapshot(part),
      id: id(),
      tick: part.tick + part.length,
      notes: part.notes.map((note) => ({ ...$state.snapshot(note), id: id() })),
    };
    track.parts.push(copy);
    select(track.id, copy.id);
    saveSnapshot();
  }

  function deletePart(): void {
    if (!track || !part) return;
    track.parts = track.parts.filter((candidate) => candidate.id !== partId);
    partId = track.parts[0]?.id ?? null;
    selectedNote = null;
    saveSnapshot();
  }

  function setTempo(value: number): void {
    if (!Number.isFinite(value) || value < 20 || value > 400) return;
    const first = project.tempos[0];
    if (first) first.tempo = value;
    saveSnapshot();
  }

  function stopFrame(): void {
    cancelAnimationFrame(frame);
    frame = 0;
  }
  function tickLoop(): void {
    if (!player || playerState !== "playing" || !playbackTiming) return;
    playheadTick = playbackTiming.tickAt(player.currentTime);
    frame = requestAnimationFrame(tickLoop);
  }

  function handleStop(): void {
    const previous = player;
    player = null;
    previous?.stop();
    currentStream?.cancel();
    currentStream = null;
    stopFrame();
    playerState = "idle";
    buffering = false;
    bufferAhead = 0;
    playheadTick = null;
  }

  async function handlePlay(): Promise<void> {
    handleStop();
    errorMessage = "";
    renderNotice = "";
    const p = new StreamPlayer();
    player = p;
    buffering = true;
    const snapshot = $state.snapshot(project);
    const { sampleRate, preBufferSeconds } = preferences;
    playbackTiming = new TempoMap(snapshot.tempos, snapshot.resolution);
    const source = createResilientStream(
      () => createWorkerStream({ project: snapshot, sampleRate }),
      () => streamProject(snapshot, sampleRate),
      () => {
        if (player === p) renderNotice = "Rendering locally. Worker unavailable.";
      },
    );
    currentStream = source;
    p.on((event) => {
      if (player !== p) return;
      if (event.type === "stateChange") {
        playerState = event.state;
        stopFrame();
        if (event.state === "playing") {
          buffering = false;
          frame = requestAnimationFrame(tickLoop);
        }
      } else if (event.type === "progress") {
        bufferAhead = event.bufferAhead;
      } else if (event.type === "bufferUnderrun") bufferAhead = event.bufferAhead;
      else if (event.type === "error") errorMessage = `Playback failed: ${event.error.message}`;
    });
    try {
      await p.play(source.stream, volume, sampleRate, { preBufferThreshold: preBufferSeconds });
    } finally {
      source.cancel();
      if (player === p) handleStop();
    }
  }

  $effect(() => {
    player?.setVolume(volume);
  });
  onDestroy(handleStop);

  function persistDraft(): void {
    try {
      writeDraft(localStorage, $state.snapshot(project), savedDocument);
      recoveryMessage = "Draft saved on this device";
    } catch (error) {
      recoveryMessage = `Draft recovery unavailable: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  onMount(() => {
    inspectorOpen = matchMedia("(min-width: 701px)").matches;
    try {
      preferences = readPreferences(localStorage);
    } catch (error) {
      preferencesMessage = `Could not restore preferences: ${error instanceof Error ? error.message : String(error)}`;
    }
    preferencesReady = true;
    try {
      const draft = readDraft(localStorage);
      if (draft) {
        savedDocument = draft.savedDocument;
        savedSignature = JSON.stringify(parseProject(savedDocument));
        history.reset(draft.project);
        restore(draft.project);
        recoveryMessage = "Restored draft from this device";
      }
    } catch (error) {
      recoveryMessage = `Could not recover draft: ${error instanceof Error ? error.message : String(error)}`;
    }
  });

  $effect(() => {
    if (!preferencesReady) return;
    try {
      writePreferences(localStorage, $state.snapshot(preferences));
    } catch (error) {
      preferencesMessage = `Could not save preferences: ${error instanceof Error ? error.message : String(error)}`;
    }
  });

  function beforeUnload(event: BeforeUnloadEvent): void {
    persistDraft();
    if (dirty) event.preventDefault();
  }

  function requestReplacement(next: Project): void {
    if (dirty) {
      pendingProject = next;
      replaceOpen = true;
    } else replaceProject(next);
  }

  function confirmReplacement(save: boolean): void {
    if (save && !saveFile()) return;
    if (pendingProject) replaceProject($state.snapshot(pendingProject));
    pendingProject = null;
    replaceOpen = false;
  }

  function replaceProject(next: Project): void {
    savedDocument = serializeProject(next);
    savedSignature = JSON.stringify(next);
    history.reset(next);
    restore(next);
  }

  function newSong(): void {
    const next = createProject("Untitled", id);
    const added = addTrack(next, "Vocal 1", chitoseChika, "jp", id);
    addPart(added, "Untitled part", 0, next.resolution * 16, id);
    requestReplacement(next);
  }

  async function openFile(): Promise<void> {
    const input = fileInput;
    const file = input?.files?.[0];
    if (!file) return;
    try {
      const next = /\.(ichi|ichikara)$/i.test(file.name) ? parseProject(await file.text()) : await importProjectFromFile(file, "jp", id);
      requestReplacement(next);
      errorMessage = "";
    } catch (error) {
      errorMessage = `Could not open ${file.name}: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      input.value = "";
    }
  }

  function saveFile(): boolean {
    try {
      saveSnapshot();
      const document = serializeProject($state.snapshot(project));
      downloadFile(new Blob([document], { type: "application/json" }), `${project.name || "Untitled"}.ichi`);
      savedDocument = document;
      savedSignature = JSON.stringify(project);
      persistDraft();
      errorMessage = "";
      return true;
    } catch (error) {
      errorMessage = `Save failed: ${error instanceof Error ? error.message : String(error)}`;
      return false;
    }
  }

  async function exportAudio(): Promise<void> {
    exporting = true;
    try {
      const chunks: AudioChunk[] = [];
      for await (const chunk of streamProject($state.snapshot(project), preferences.sampleRate)) chunks.push(chunk);
      downloadFile(new Blob([encodeWav([mixChunks(chunks)], volume)], { type: "audio/wav" }), `${project.name || "Untitled"}.wav`);
    } catch (error) {
      errorMessage = `Audio export failed: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      exporting = false;
    }
  }

  async function exportSong(): Promise<void> {
    try {
      const bytes = await exportProjectToBytes($state.snapshot(project), { format: "ustx" });
      downloadFile(new Blob([new Uint8Array(bytes)]), `${project.name || "Untitled"}.ustx`);
    } catch (error) {
      errorMessage = `Score export failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  function keydown(event: KeyboardEvent): void {
    const target = event.target;
    const editing = target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === "s") {
      event.preventDefault();
      saveFile();
    } else if (mod && event.key.toLowerCase() === "o") {
      event.preventDefault();
      fileInput?.click();
    } else if (!editing && mod && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    } else if (!editing && event.code === "Space") {
      event.preventDefault();
      if (playerState === "playing") player?.pause();
      else if (playerState === "paused") player?.resume();
      else
        handlePlay().catch((error: unknown) => {
          errorMessage = String(error);
          handleStop();
        });
    }
  }
</script>

<svelte:window onkeydown={keydown} onbeforeunload={beforeUnload} />
<BitsTooltip.Provider>
  <div class="editor-shell">
    <header class="document-bar">
      <button
        class="sidebar-toggle icon-btn"
        aria-label="Toggle inspector"
        aria-pressed={inspectorOpen}
        onclick={() => {
          inspectorOpen = !inspectorOpen;
        }}><PanelLeft size={18} /></button
      >
      <span class="app-wordmark">Ichikara</span>
      <span class="document-divider"></span>
      <input class="document-name" aria-label="Project name" bind:value={project.name} onchange={saveSnapshot} />
      <span class="document-state">{dirty ? "Edited" : "Local project"}</span>
      <div class="spacer"></div>
      <button title="New song" onclick={newSong}><Plus size={15} /><span>New</span></button>
      <button title="Open project" onclick={() => fileInput?.click()}><FolderOpen size={15} /><span>Open</span></button>
      <button title="Save project (Cmd/Ctrl+S)" onclick={saveFile}><Save size={15} /><span>Save</span></button>
      <span class="document-divider"></span>
      <button class="icon-btn" title="Undo" disabled={!canUndo} onclick={undo}><Undo2 size={16} /></button>
      <button class="icon-btn" title="Redo" disabled={!canRedo} onclick={redo}><Redo2 size={16} /></button>
      <button
        title="Settings"
        class="icon-btn"
        onclick={() => {
          settingsOpen = true;
        }}><Settings size={16} /></button
      >
      <input
        type="file"
        hidden
        bind:this={fileInput}
        accept=".ichi,.ichikara,.ust,.ustx,.vsqx,.vpr,.svp,.mid,.midi,.musicxml,.ufdata"
        onchange={openFile}
      />
    </header>
    <TransportBar
      state={playerState}
      bind:volume
      tempo={project.tempos[0]?.tempo ?? 120}
      onTempoChange={setTempo}
      meterLabel={`${project.meters[0]?.numerator ?? 4}/${project.meters[0]?.denominator ?? 4}`}
      onTimelineEdit={() => {
        timelineOpen = true;
      }}
      {buffering}
      {bufferAhead}
      {playheadTick}
      {totalTicks}
      {timing}
      {exporting}
      onPlay={handlePlay}
      onPause={() => player?.pause()}
      onResume={() => player?.resume()}
      onStop={handleStop}
      onExport={exportAudio}
      onScoreExport={exportSong}
    />
    {#if errorMessage}<div class="editor-message" role="alert">
        {errorMessage}<button
          onclick={() => {
            errorMessage = "";
          }}>Dismiss</button
        >
      </div>{/if}
    <main
      class="workspace"
      class:inspector-open={inspectorOpen}
      bind:clientWidth={workspaceWidth}
      style:--inspector-width="{inspectorSize.value}px"
      style:--divider-size="{workspaceSize.divider}px"
      style:--editors-min-height="{workspaceSize.arrangement + workspaceSize.part + workspaceSize.divider}px"
    >
      {#if inspectorOpen}
        <aside id="inspector" class="inspector" aria-label="Inspector">
          <div class="section-toolbar"><h2>Inspector</h2></div>
          {#if track}
            <div class="track-inspector">
              <div class="track-heading">
                <h3>{track.name}</h3>
                <button class="icon-btn" title="Delete selected track" onclick={deleteTrack}><Trash2 size={14} /></button>
              </div>
              <label
                >Language<select aria-label="Track language" bind:value={track.language} onchange={saveSnapshot}
                  ><option value="jp">Japanese</option><option value="en">English</option><option value="zh">Mandarin</option></select
                ></label
              >
              <label
                >Level<input
                  aria-label="Track level"
                  type="range"
                  min="0"
                  max="2"
                  step="0.01"
                  bind:value={track.gain}
                  onchange={saveSnapshot}
                /></label
              >
              <label
                >Pan<input
                  aria-label="Track pan"
                  type="range"
                  min="-1"
                  max="1"
                  step="0.01"
                  bind:value={track.pan}
                  onchange={saveSnapshot}
                /></label
              >
            </div>
            {#if note}<NoteInspector
                {note}
                language={track.language}
                onChange={updateNote}
                onError={(message: string) => {
                  errorMessage = message;
                }}
              />{/if}
            <div class="voice-settings" role="group" aria-label="Voice settings">
              <VoicePanel bind:params={track.parameters} bind:baseVoice={track.voice} bind:advancedOpen onCommit={saveSnapshot} />
            </div>
          {:else}<p class="inspector-empty">Select a track to edit its voice and mix.</p>{/if}
        </aside>
        <div class="inspector-divider">
          <ResizeHandle
            label="Inspector width"
            controls="inspector"
            axis="x"
            {...inspectorSize}
            onChange={(value: number) => {
              preferences.inspectorWidth = value;
            }}
          />
        </div>
      {/if}
      <div class="editors" bind:clientHeight={editorsHeight} style:--arrangement-height="{arrangementSize.value}px">
        <div id="arrangement-pane" class="arrangement-pane">
          <Arrangement
            bind:project
            {trackId}
            {partId}
            {playheadTick}
            autoScroll={preferences.autoScroll && playerState === "playing"}
            followMode={preferences.followMode}
            bind:trackHeight={preferences.trackHeight}
            bind:trackWidth={preferences.trackHeaderWidth}
            onSelect={select}
            onChange={saveSnapshot}
            onAddTrack={newTrack}
            onAddPart={newPart}
            onDuplicate={duplicatePart}
            onDelete={deletePart}
          />
        </div>
        <ResizeHandle
          label="Arrangement height"
          controls="arrangement-pane"
          axis="y"
          {...arrangementSize}
          onChange={(value: number) => {
            preferences.arrangementRatio = value / usableHeight;
          }}
        />
        <section class="part-pane" aria-label="Vocal part editor">
          <div class="section-toolbar">
            <Music2 size={14} />
            {#if part}<input aria-label="Part name" class="part-title" bind:value={part.name} onchange={saveSnapshot} /><span
                class="section-meta">{part.notes.length} notes</span
              >
            {:else}<h2>Vocal editor</h2>{/if}
            <div class="spacer"></div>
            <span class="section-meta">Piano roll</span>
          </div>
          {#if part}
            {#key part.id}<PianoRoll
                bind:notes={part.notes}
                bind:selectedNote
                playheadTick={playheadTick === null ? null : playheadTick - part.tick}
                bind:autoScroll={preferences.autoScroll}
                following={playerState === "playing"}
                followMode={preferences.followMode}
                bind:showKeyboard={preferences.showKeyboard}
                showExpression={preferences.showExpression}
                bind:expressionHeight={preferences.expressionHeight}
                noteHeight={preferences.noteHeight}
                bind:snap={preferences.snap}
                ticksPerBeat={project.resolution}
                meters={project.meters}
                partTick={part.tick}
                {saveSnapshot}
              />{/key}
          {:else}<div class="part-empty">
              <Music2 size={28} />
              <h3>Select a vocal part</h3>
              <p>Choose a region above to edit its notes, lyrics, and pitch.</p>
              {#if track}<button
                  onclick={() => {
                    newPart(track);
                  }}>Add vocal part</button
                >{/if}
            </div>{/if}
        </section>
      </div>
    </main>
    <footer class="editor-status">
      <span role="status">{renderNotice || recoveryMessage || "OneVoice synthesis"}</span><span>{project.resolution} ticks / quarter</span>
      <div class="spacer"></div>
      <span>Space: play / pause</span><span>Cmd/Ctrl+S: save</span>
    </footer>
  </div>
  <SettingsPanel bind:open={settingsOpen} bind:preferences message={preferencesMessage} />
  {#if timelineOpen}<TimelinePanel
      {project}
      onApply={(next: Project) => {
        restore(next);
        saveSnapshot();
      }}
      onClose={() => {
        timelineOpen = false;
      }}
    />{/if}
  <Dialog.Root bind:open={replaceOpen}>
    <Dialog.Portal>
      <Dialog.Overlay class="dialog-overlay" />
      <Dialog.Content class="dialog-content">
        <div class="dialog-header"><Dialog.Title class="dialog-title">Save changes to {project.name || "Untitled"}?</Dialog.Title></div>
        <div class="dialog-body">
          <Dialog.Description>Your current song has changes that have not been saved to a file.</Dialog.Description>
          <div class="document-actions">
            <Dialog.Close>Cancel</Dialog.Close>
            <button onclick={() => confirmReplacement(false)}>Discard changes</button>
            <button onclick={() => confirmReplacement(true)}>Save and continue</button>
          </div>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
</BitsTooltip.Provider>
