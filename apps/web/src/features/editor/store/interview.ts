/** The interview (issue 186): the question the agent is waiting on, and whether a new design should open with one */
import { hops } from '@/canvas/hop';
import { track } from '@/lib/events';
import type { Answer, Choice, ChoiceOption, Question } from '../agent/interview-capabilities';
import type { StoreContext } from './create';
import type { EditorActions, EditorState } from './types';

type Interview = Pick<EditorState, 'question' | 'interview' | 'choice' | 'justBuilt'> &
  Pick<EditorActions, 'askHost' | 'answerQuestion' | 'interviewStarted' | 'chooseHost' | 'pickHouse' | 'clearJustBuilt'>;

export const interviewSlice = ({ set, get }: StoreContext, interview: boolean): Interview => {
  // The agent's pending ask_user call; a new question supersedes an unanswered one (left to the agent)
  let pending: ((a: Answer) => void) | null = null;
  // The agent's pending house_choose call
  let choosing: ((c: Choice) => void) | null = null;
  return {
    question: null,
    interview,
    choice: null,
    justBuilt: null,
    chooseHost: {
      choose: (options: ChoiceOption[]) =>
        new Promise<Choice>(resolve => {
          choosing?.({ deferred: true });
          choosing = resolve;
          set({ choice: options });
          track('options_shown', get().projectId, options.map(o => o.id).join(','));
        }),
    },
    async pickHouse(id) {
      const resolve = choosing;
      choosing = null;
      set({ choice: null });
      if (!id) return resolve?.({ deferred: true });
      // Built as the owner's own edit, then shown going up in 3D (issue 188)
      const r = await get().call('house_build', { option: id }, { kind: 'user' });
      if (r.ok) {
        track('option_picked', get().projectId, id);
        hops.build(get().session.project);
        get().setView({ mode: '3d' });
        get().fitView();
        set({ justBuilt: Date.now() });
      }
      resolve?.(r.ok ? { picked: id } : { deferred: true });
    },
    askHost: {
      ask: (q: Question) =>
        new Promise<Answer>(resolve => {
          pending?.({ deferred: true });
          pending = resolve;
          set({ question: q });
        }),
    },
    answerQuestion(answer) {
      const resolve = pending;
      pending = null;
      set({ question: null });
      resolve?.(answer);
    },
    clearJustBuilt() {
      set({ justBuilt: null });
    },
    interviewStarted() {
      set({ interview: false });
    },
  };
};
