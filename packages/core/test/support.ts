/** Files the tests read: the sample project, the library files and the UI messages, all from the repository */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '../../..');
const json = (...path: string[]) => JSON.parse(readFileSync(join(ROOT, ...path), 'utf8'));

/** A file of the wushi-10 sample, as stored (not migrated) */
export const sampleFile = (file = 'project.json') => json('samples/wushi-10', file);
/** A look library file in libraries/ */
export const libraryFile = (name: string) => json('libraries', name);
/** The web app's UI messages for a locale */
export const messages = (locale: string): Record<string, string> => json('apps/web/messages', `${locale}.json`);
