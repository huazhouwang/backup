/** Capabilities about capabilities: batch and search. */
import { z } from 'zod';
import { defineEdit, defineRead, Registry, type CapabilityContext } from './capability.js';
import { TxError } from '../session/session.js';
import { text } from '../i18n.js';

/** Batch: several edits combined into one transaction, undone together */
export function batchCapability(registry: Registry) {
  return defineEdit({
    name: 'batch',
    title: 'Batch edit',
    description:
      'Run several edit capabilities as one step: all succeed or all roll back, and they undo together. Use for large changes or building a design from scratch.',
    input: z.object({
      label: z.string().describe('One-sentence summary of this batch'),
      calls: z
        .array(z.object({ name: z.string(), input: z.record(z.string(), z.unknown()).default({}) }))
        .min(1)
        .max(60),
    }),
    label: i => i.label,
    apply: (p, i, ctx: CapabilityContext) => {
      const results: unknown[] = [];
      for (const [k, call] of i.calls.entries()) {
        const c = registry.get(call.name);
        if (!c || c.mode !== 'edit' || c.name === 'batch')
          throw new TxError(
            'invalid-input',
            text('err_batch_not_edit', 'Step {step}: {name} is not an edit capability that can be batched', { step: k + 1, name: call.name }),
          );
        const parsed = c.input.safeParse(call.input);
        if (!parsed.success)
          throw new TxError(
            'invalid-input',
            text('err_batch_step', 'Step {step} ({name}): {message}', { step: k + 1, name: call.name, message: z.prettifyError(parsed.error) }),
          );
        try {
          results.push(c.apply(p, parsed.data, ctx));
        } catch (e) {
          if (e instanceof TxError)
            throw new TxError(e.code, text('err_batch_step', 'Step {step} ({name}): {message}', { step: k + 1, name: call.name, message: e.message }));
          throw e;
        }
      }
      return results;
    },
  });
}

export const searchCapabilitiesFor = (registry: Registry) =>
  defineRead({
    name: 'search_capabilities',
    title: 'Search capabilities',
    description: 'Search available capabilities by keyword; returns name, description, input schema and examples.',
    input: z.object({ query: z.string().default('') }),
    run: ({ query }) => registry.search(query, 15),
  });
