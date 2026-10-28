/**
 * The interview (issue 186): the agent asks the owner one question at a time, with answers to tap, and waits. Runs only in the
 * browser, where the chat shows the question as a card; the owner taps an option, types an answer, or leaves it to the agent.
 */
import { defineRead, houseOptions, text, zProgram, type CapabilityContext, type HouseOption, type HouseProgram, type Project } from '@opensu/core';
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

/** An option as the cards show it: what house_options returns, plus the generated design to draw */
export type ChoiceOption = Omit<HouseOption, never> & { project: Project };

/** The owner picked an option (already built), or left it to the agent */
export type Choice = { picked: string } | { deferred: true };

export interface ChooseHost {
  choose(options: ChoiceOption[]): Promise<Choice>;
}

const chooser = (ctx: CapabilityContext) => {
  const h = ctx.host?.choose as ChooseHost | undefined;
  if (!h) throw new Error(m.server_err_view_needs_browser());
  return h;
};

export const houseChoose = defineRead({
  name: 'house_choose',
  title: 'Choose a house',
  kind: 'view',
  permission: 'read',
  runtime: 'browser',
  description: [
    "Show the owner 2–3 generated houses for the brief's room program (or the program given) as cards: a plan and a 3D view of each, ",
    'its footprint and area. The owner taps one and it is built at once (undoable), and the 3D view shows it going up. ',
    'Returns the option built, with each room and its area; do not call house_build after it. Deferred: build the first option with house_build.',
  ].join(''),
  input: z.object({ program: zProgram.optional().describe("Default: the brief's program") }),
  run: async (i, ctx) => {
    const p = ctx.session.project;
    const program = (i.program as HouseProgram | undefined) ?? p.brief.program;
    if (!program) throw new Error(text('err_no_program', 'No room program: pass one, or record it in the brief first (brief_update)'));
    const { options } = houseOptions(program, p.language);
    if (!options.length) throw new Error(text('err_no_house', 'No house could be built from this program: check the rooms and storeys'));
    const choice = await chooser(ctx).choose(options);
    if ('deferred' in choice) return { deferred: true, options: options.map(({ project: _p, ...o }) => o) };
    const o = options.find(x => x.id === choice.picked)!;
    const { project: _p, ...built } = o;
    return { built };
  },
});

export const INTERVIEW_CAPABILITIES = [askUser, houseChoose];
