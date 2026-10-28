/**
 * The interview (issue 186): the agent asks the owner one question at a time, with answers to tap, and waits. Runs only in the
 * browser, where the chat shows the question as a card; the owner taps an option, types an answer, or leaves it to the agent.
 */
import { defineRead, type CapabilityContext } from '@opensu/core';
import { z } from 'zod';
import { m } from '@/lib/i18n';

export interface Question {
  question: string;
  options: { label: string; detail?: string }[];
  multiple: boolean;
}

/** What the owner did: tapped options, typed an answer, or left it to the agent */
export type Answer = { picked: string[] } | { text: string } | { deferred: true };

export interface AskHost {
  ask(q: Question): Promise<Answer>;
}

const host = (ctx: CapabilityContext) => {
  const h = ctx.host?.ask as AskHost | undefined;
  if (!h) throw new Error(m.server_err_view_needs_browser());
  return h;
};

export const askUser = defineRead({
  name: 'ask_user',
  title: 'Ask the owner',
  kind: 'view',
  permission: 'read',
  runtime: 'browser',
  description: [
    'Ask the owner one question and wait for the answer. The chat shows it as a card: your options as buttons to tap (2–6 short labels, ',
    'in the language the owner writes in, each with an optional one-line detail), a "you decide" button, and the chat box for a typed answer. ',
    "Use it in the interview and whenever a choice is the owner's: one question per call, never several at once. ",
    'The result is the picked option labels, the typed text, or deferred: then choose a sensible default yourself and say what you chose.',
  ].join(''),
  input: z.object({
    question: z.string().min(1).max(200),
    options: z
      .array(z.object({ label: z.string().min(1).max(40), detail: z.string().max(80).optional() }))
      .min(2)
      .max(6),
    multiple: z.boolean().default(false).describe('Let the owner pick several options'),
  }),
  run: async (i, ctx) => {
    const a = await host(ctx).ask(i);
    if ('picked' in a) return { picked: a.picked };
    if ('text' in a) return { text: a.text };
    return { deferred: true, note: 'The owner left this to you: choose a sensible default and say what you chose.' };
  },
});

export const INTERVIEW_CAPABILITIES = [askUser];
