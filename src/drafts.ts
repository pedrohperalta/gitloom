const key = (path: string) => `gitloom.draft:${path}`;
export function readDraft(path: string): string {
  return localStorage.getItem(key(path)) ?? "";
}
export function saveDraft(path: string, message: string): void {
  if (message) localStorage.setItem(key(path), message);
  else localStorage.removeItem(key(path));
}
