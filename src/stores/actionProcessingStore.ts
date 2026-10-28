import { create } from "zustand";
import reasoningService from "../services/ReasoningService";
import { getSettings, selectResolvedNoteFormatting } from "./settingsStore";
import { appendDictionarySuffix } from "../config/prompts";
import { generateNoteTitle } from "../utils/generateTitle";
import { buildNoteFormattingOverrides } from "../helpers/noteFormattingOverrides";
import { claimWritingModel, sortConversationIntoGroup } from "./conversationGroupSortStore";
import { checkConversationLinks } from "./conversationLinkStore";
import { summaryRouteKey } from "../helpers/remoteLinks.mjs";
import { summaryAnswerProblem, summaryLimits } from "../helpers/summaryCall.mjs";
import type { ActionItem } from "../types/electron";

export type ActionProcessingStatus = "idle" | "processing" | "success" | "failed";

export interface NoteActionState {
  status: ActionProcessingStatus;
  actionName: string | null;
  /** Why a conversation's summary failed ("failed"), for the record to say. */
  message?: string | null;
}

export interface ActionErrorEvent {
  noteId: number;
  message: string;
}

interface ActionProcessingStoreState {
  noteStates: Record<number, NoteActionState>;
  errorEvents: ActionErrorEvent[];
}

const cancelledFlags = new Map<number, boolean>();
const processingFlags = new Map<number, boolean>();
const successTimers = new Map<number, NodeJS.Timeout>();

const IDLE_STATE: NoteActionState = { status: "idle", actionName: null };

function setNoteState(noteId: number, patch: Partial<NoteActionState>) {
  const { noteStates } = useActionProcessingStore.getState();
  const prev = noteStates[noteId] ?? IDLE_STATE;
  useActionProcessingStore.setState({
    noteStates: { ...noteStates, [noteId]: { ...prev, ...patch } },
  });
}

function clearNoteState(noteId: number) {
  const { noteStates } = useActionProcessingStore.getState();
  const next = { ...noteStates };
  delete next[noteId];
  useActionProcessingStore.setState({ noteStates: next });
}

function pushErrorEvent(event: ActionErrorEvent) {
  const { errorEvents } = useActionProcessingStore.getState();
  useActionProcessingStore.setState({ errorEvents: [...errorEvents, event] });
}

export const useActionProcessingStore = create<ActionProcessingStoreState>()(() => ({
  noteStates: {},
  errorEvents: [],
}));

const BASE_SYSTEM_PROMPT = `You are a note enhancement assistant. The user will provide raw notes — possibly voice-transcribed, rough, or unstructured. Your job is to clean them up according to the instructions below while preserving all original meaning and information. Output clean markdown.

FORMAT RULES (strict):
- Do NOT include any preamble: no title, no date/time/location, no attendee list, no topic header. Start directly with the content.
- Do NOT use tables, horizontal rules, or block quotes.
- Do NOT list or guess participant names/roles.
- Keep the tone professional and concise. Bias toward brevity.

Instructions: `;

const MEETING_SYSTEM_PROMPT = `You are a professional meeting notes assistant. You will receive the transcript of a conversation, written by speech recognition, along with any manual notes the user took. The transcript can contain misheard words. A line may start with a speaker label ("You:", "Them:", "Speaker 1:"); a conversation recorded in one room often has no labels at all.

Your job is to produce clean, actionable meeting notes in markdown. Follow these rules:

FORMAT RULES (strict):
- Do NOT include any preamble: no title, no "# Meeting Notes", no date/time/location, no attendee list, no topic header. Start directly with the summary.
- Do NOT use tables, horizontal rules, or block quotes.
- Do NOT list or guess participant names/roles.
- Start with a concise 1–2 sentence summary of what the meeting was about.
- Use clear section headings: ## Threads, ## Key Discussion Points, ## Decisions Made, ## Action Items, ## Follow-ups (omit any section that has no content).
- Under ## Threads, capture the 2–5 important lines of thought: the starting question or claim, how it developed, and what remains unresolved. Write each as a concise bullet; this is the conversation's intellectual map, not a chronological recap.
- Under Action Items, use checkboxes (\`- [ ]\`). Name who will do an item only when the transcript says so (a speaker label or a name); otherwise leave the item unattributed.

CONTENT RULES:
- Write only what the transcript supports. List a decision only if the participants agreed on it, and an action item only if someone took it on. Leave out what you cannot make out; never guess a number, a name or a date.
- Preserve important quotes or specific commitments verbatim when they carry meaning.
- Remove filler, small talk, false starts, and repeated/redundant content.
- Where speakers refer to the same topic across multiple turns, consolidate into a coherent point rather than listing every utterance.
- If the user included manual notes alongside the transcript, integrate them — they represent the user's emphasis on what matters most.
- Keep the tone professional and concise. Bias toward brevity.

Instructions: `;

export interface RunActionOptions {
  isCloudMode: boolean;
  modelId: string;
  isMeetingNote?: boolean;
  /** Opt-in so enhancement never renames a note the user has titled. */
  allowTitleGeneration?: boolean;
}

export interface RunActionLabels {
  noModel: string;
  noEndpoint: string;
  actionFailed: string;
  /** A conversation's summary came back empty, or as the transcript itself. */
  noSummary?: string;
}

/**
 * Start processing an action on a note. Runs in the background — survives
 * component unmounts and navigation so the user can switch notes mid-action.
 */
export function runBackgroundAction(
  noteId: number,
  noteContent: string,
  contentHash: string,
  action: ActionItem,
  options: RunActionOptions,
  labels: RunActionLabels
): void {
  if (processingFlags.get(noteId)) return;

  const modelId = options.modelId;
  if (!modelId && !options.isCloudMode) {
    pushErrorEvent({ noteId, message: labels.noModel });
    return;
  }

  const settings = getSettings();
  const noteFormatting = selectResolvedNoteFormatting(settings);
  // A self-hosted config without a URL would fall through to a cloud provider.
  if (!options.isCloudMode && noteFormatting.mode === "self-hosted" && !noteFormatting.remoteUrl) {
    pushErrorEvent({ noteId, message: labels.noEndpoint });
    return;
  }

  cancelledFlags.set(noteId, false);
  processingFlags.set(noteId, true);
  setNoteState(noteId, { status: "processing", actionName: action.name, message: null });

  (async () => {
    // The model on this computer answers one request at a time, so the
    // background group sort steps aside before the summary asks.
    const release = await claimWritingModel().catch(() => () => {});
    try {
      const basePrompt = options.isMeetingNote ? MEETING_SYSTEM_PROMPT : BASE_SYSTEM_PROMPT;
      const providerOverrides = buildNoteFormattingOverrides(
        noteFormatting,
        options.isCloudMode,
        noteFormatting.customApiKey
      );
      const systemPrompt = appendDictionarySuffix(
        basePrompt + action.prompt,
        options.isMeetingNote ? settings.customDictionary : undefined,
        settings.uiLanguage
      );
      const enhanced = await reasoningService.processText(noteContent, modelId, null, {
        systemPrompt,
        temperature: 0.3,
        disableThinking: noteFormatting.disableThinking,
        ...providerOverrides,
        // A conversation's summary reads the whole transcript: room for a
        // reasoning model, and a cut or empty answer fails (summaryCall.mjs).
        ...(options.isMeetingNote ? summaryLimits(noteFormatting.mode) : {}),
      });

      if (cancelledFlags.get(noteId)) return;
      // Never save nothing, or the transcript itself, as the summary.
      if (options.isMeetingNote && summaryAnswerProblem(enhanced, noteContent)) {
        throw new Error(labels.noSummary ?? labels.actionFailed);
      }

      let title: string | undefined;
      if (options.allowTitleGeneration && getSettings().autoGenerateNoteTitle) {
        const generated = await generateNoteTitle(enhanced, modelId, providerOverrides);
        if (generated) title = generated;
      }

      if (cancelledFlags.get(noteId)) return;

      const updates: Record<string, string> = {
        enhanced_content: enhanced,
        enhancement_prompt: action.prompt,
        enhanced_at_content_hash: contentHash,
        // Which route and provider wrote it: a later link check sends this
        // conversation only to the provider that has already read it.
        summary_route: summaryRouteKey({
          mode: options.isCloudMode ? "cloud" : noteFormatting.mode,
          provider: providerOverrides.provider,
        }),
      };
      if (title) updates.title = title;
      await window.electronAPI.updateNote(noteId, updates);

      setNoteState(noteId, { status: "success", actionName: action.name });

      const timer = setTimeout(() => {
        processingFlags.set(noteId, false);
        clearNoteState(noteId);
        successTimers.delete(noteId);
      }, 600);
      successTimers.set(noteId, timer);

      // Then its group, by the same model and the same route. The summary is
      // done whatever happens here: a failed sort leaves the conversation
      // unsorted, for the background run to try again, and is not an error.
      if (options.isMeetingNote && !cancelledFlags.get(noteId)) {
        await sortConversationIntoGroup(noteId, {
          modelId,
          mode: noteFormatting.mode,
          config: { ...providerOverrides, disableThinking: noteFormatting.disableThinking },
        }).catch(() => undefined);
        // And, with a cloud writing model, its links to earlier conversations
        // (stores/conversationLinkStore.ts). With any other model it does
        // nothing, and the board links the conversation on this computer.
        if (!cancelledFlags.get(noteId)) {
          await checkConversationLinks(noteId, {
            modelId,
            mode: noteFormatting.mode,
            config: { ...providerOverrides, disableThinking: noteFormatting.disableThinking },
          }).catch(() => undefined);
        }
      }
    } catch (err) {
      if (cancelledFlags.get(noteId)) return;
      processingFlags.set(noteId, false);
      const message = err instanceof Error ? err.message : labels.actionFailed;
      // A conversation keeps the failure, so its record says so and offers it
      // again (OatsWorkspace.tsx); other notes go back to idle.
      if (options.isMeetingNote) {
        setNoteState(noteId, { status: "failed", actionName: action.name, message });
      } else {
        clearNoteState(noteId);
      }
      pushErrorEvent({ noteId, message });
    } finally {
      cancelledFlags.delete(noteId);
      release();
    }
  })();
}

/** Soft cancel: the HTTP request continues but the result is discarded. */
export function cancelAction(noteId: number): void {
  cancelledFlags.set(noteId, true);
  processingFlags.set(noteId, false);
  const timer = successTimers.get(noteId);
  if (timer) {
    clearTimeout(timer);
    successTimers.delete(noteId);
  }
  clearNoteState(noteId);
}

export function consumeErrorEvents(): ActionErrorEvent[] {
  const { errorEvents } = useActionProcessingStore.getState();
  if (errorEvents.length === 0) return [];
  useActionProcessingStore.setState({ errorEvents: [] });
  return errorEvents;
}

export function selectNoteActionState(
  state: ActionProcessingStoreState,
  noteId: number | null
): NoteActionState {
  if (noteId == null) return IDLE_STATE;
  return state.noteStates[noteId] ?? IDLE_STATE;
}
