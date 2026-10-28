/** The interview (issue 186): the question the agent is waiting on, and whether a new design should open with one */
import type { Answer, Question } from '../agent/interview-capabilities';
import type { StoreContext } from './create';
import type { EditorActions, EditorState } from './types';

type Interview = Pick<EditorState, 'question' | 'interview'> & Pick<EditorActions, 'askHost' | 'answerQuestion' | 'interviewStarted'>;

export const interviewSlice = ({ set }: StoreContext, interview: boolean): Interview => {
  // The agent's pending ask_user call; a new question supersedes an unanswered one (left to the agent)
  let pending: ((a: Answer) => void) | null = null;
  return {
    question: null,
    interview,
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
    interviewStarted() {
      set({ interview: false });
    },
  };
};
