/** The D1 database the repository reads and writes, with plain prepared statements for minimal overhead */
import { env } from 'cloudflare:workers';

export const db = () => env.DB;
export const now = () => Date.now();
export const newId = (prefix = '') => prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 20);
