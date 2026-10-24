/** The capability list as the agent and MCP see it (name, description, input schema, examples). Review snapshot changes like an API change. */
import { expect, it } from 'vitest';
import { createRegistry, describe as describeCapability } from '../../src/index.js';

it('capability descriptions are stable', () => {
  expect(createRegistry().list().map(describeCapability)).toMatchSnapshot();
});
