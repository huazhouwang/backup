/** Keys in this browser's storage are `opensu.<name>`; a value saved under the name before the rename (`plinth.<name>`, issue 179) is still read */
export const localKey = (name: string) => `opensu.${name}`;

export function readLocal(name: string): string | null {
  return localStorage.getItem(localKey(name)) ?? localStorage.getItem(`plinth.${name}`);
}
