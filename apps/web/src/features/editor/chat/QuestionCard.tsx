/**
 * The question the agent is waiting on (ask_user, issue 186): its options to tap (or several, then confirm), "you decide", and
 * a hint that typing in the chat box answers it too.
 */
import { CheckIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { m } from '@/lib/i18n';
import { useEditor } from '../store';

export function QuestionCard() {
  const question = useEditor(s => s.question);
  const answer = useEditor(s => s.answerQuestion);
  const [picked, setPicked] = useState<string[]>([]);
  if (!question) return null;
  const done = (a: Parameters<typeof answer>[0]) => {
    setPicked([]);
    answer(a);
  };
  return (
    <Card size="sm" className="mx-3 mb-2 shrink-0" aria-label={m.chat_question_aria()}>
      <CardHeader>
        <CardTitle className="text-sm">{question.question}</CardTitle>
        <CardDescription>{m.chat_question_hint()}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {question.options.map(o => {
          const on = picked.includes(o.label);
          return (
            <Button
              key={o.label}
              variant={on ? 'default' : 'outline'}
              size="sm"
              className="h-auto flex-col items-start gap-0 whitespace-normal py-1.5 text-left"
              aria-pressed={question.multiple ? on : undefined}
              onClick={() => (question.multiple ? setPicked(s => (on ? s.filter(x => x !== o.label) : [...s, o.label])) : done({ picked: [o.label] }))}
            >
              <span className="flex items-center gap-1">
                {on && <CheckIcon />}
                {o.label}
              </span>
              {o.detail && <span className={on ? 'text-xs opacity-80' : 'text-xs text-muted-foreground'}>{o.detail}</span>}
            </Button>
          );
        })}
      </CardContent>
      <CardFooter className="justify-between gap-2">
        <Button variant="link" size="sm" className="h-auto p-0" onClick={() => done({ deferred: true })}>
          {m.chat_question_defer()}
        </Button>
        {question.multiple && (
          <Button size="sm" disabled={!picked.length} onClick={() => done({ picked })}>
            {m.chat_question_confirm()}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
