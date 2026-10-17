export type FileChange = {
  path: string;
  originalPath: string | null;
  index: string;
  worktree: string;
  conflict: boolean;
};
export type Commit = {
  hash: string;
  parents: string[];
  author: string;
  date: string;
  subject: string;
  refs: string;
};
export type Branch = {
  name: string;
  current: boolean;
  upstream: string;
  remote: boolean;
};
export type Repository = {
  path: string;
  name: string;
  branch: string;
  branches: Branch[];
  commits: Commit[];
  files: FileChange[];
  remotes: string[];
  ahead: number;
  behind: number;
  hasMore: boolean;
  upstream: string | null;
  operation: "merge" | "rebase" | "cherryPick" | "revert" | "am" | null;
  headDetached: boolean;
};
export type Action =
  | {
      kind: "applyHunk";
      file: string;
      staged: boolean;
      expectedDiff: string;
      hunk: number;
    }
  | { kind: "stage" | "unstage"; files: string[] }
  | { kind: "commit"; message: string }
  | { kind: "switch" | "createBranch"; branch: string }
  | { kind: "fetch" | "pull" | "push" };
export type Selection = { file: FileChange; staged: boolean };
