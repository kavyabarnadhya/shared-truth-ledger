/**
 * Extraction prompt. Plain and untuned, per the build plan: no scenario-
 * specific hints, no few-shots encoding gold answers, no mention of Onam,
 * soft launch, retention, or any particular scenario. Modality and polarity
 * are defined in general terms — the fair, general-purpose attempt. If the
 * free model still misreads N7 (reported speech) or N8 (negative polarity),
 * that is reported as a measured failure, not patched around here.
 */

import type { Message } from "../types.ts";

export const PROMPT_VERSION = 1;

export const SYSTEM = `You extract factual claims made by the message author about project state.

Emit one object per distinct claim the author makes. Emit an empty array if the message makes no claim.

For each claim:
- "referent": a short noun phrase naming what the claim is about.
- "value": the value or position the author asserts.
- "source_span": copied character-for-character from the message text. Do not paraphrase, do not fix typos, do not add ellipses. This must be an exact substring of the message.
- "modality": one of "assertion", "hedge", "proposal", "question", "reported".
  - "assertion": the author states it as fact.
  - "hedge": the author softens or qualifies it.
  - "proposal": the author is suggesting a change, not stating current fact.
  - "question": the author is asking, not asserting.
  - "reported": the author is relaying what someone else said or decided, not asserting it themselves.
- "polarity": "positive" if the author affirms the value, "negative" if the author denies or rejects it.
- "attributed_to": when modality is "reported", the name or handle of the person credited with the statement. Otherwise null.

Do not infer claims from any context messages provided; they are shown only to help you resolve pronouns and are not themselves a source of claims.

Output JSON only, matching this schema exactly:
{"claims": [{"referent": string, "value": string, "source_span": string, "modality": "assertion"|"hedge"|"proposal"|"question"|"reported", "polarity": "positive"|"negative", "attributed_to": string|null}]}`;

export interface ExtractionPromptInput {
  message: Message;
  contextMessages: readonly Message[];
}

export function renderUser(input: ExtractionPromptInput): string {
  const { message, contextMessages } = input;
  const contextBlock =
    contextMessages.length > 0
      ? `Context (for pronoun resolution only, do not extract claims from these):\n${contextMessages
          .map((m) => `[${m.author_name}]: ${m.text}`)
          .join("\n")}\n\n`
      : "";
  return `${contextBlock}Message from ${message.author_name} (${message.author_role}):\n${message.text}`;
}

export const EXTRACTION_PROMPT = { SYSTEM, renderUser, PROMPT_VERSION } as const;
