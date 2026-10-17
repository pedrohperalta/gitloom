import { FlatSelect } from "./FlatSelect";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  FileCode2,
  FolderGit2,
  FolderOpen,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  Layers,
  LoaderCircle,
  Minus,
  Plus,
  RefreshCw,
  Search,
  Settings,
  X,
} from "lucide-react";
import type {
  Action,
  Commit,
  FileChange,
  Repository,
  Selection,
} from "./types";
import { layoutGraph, parseDiff, type GraphRow } from "./graph";
import {
  localizeBackendMessage,
  type MessageKey,
  type MessageParams,
} from "./i18n";
import { textScales, usePreferences } from "./preferences";
import { SidebarDivider } from "./SidebarDivider";
import { SettingsDialog } from "./SettingsDialog";
import { readDraft, saveDraft } from "./drafts";
import { errorGuidance } from "./gitGuidance";
import "./App.css";

type Recent = { path: string; name: string };
function readRecents(): Recent[] {
  try {
    const data = JSON.parse(localStorage.getItem("ramo.recents") || "[]");
    return Array.isArray(data)
      ? data
          .filter(
            (r) => typeof r?.path === "string" && typeof r?.name === "string",
          )
          .slice(0, 8)
      : [];
  } catch {
    return [];
  }
}
const changed = (f: FileChange) => f.worktree !== " " && f.worktree !== "";
const stagedFile = (f: FileChange) =>
  f.index !== " " && f.index !== "?" && f.index !== "";
const paths = (files: FileChange[]) => [
  ...new Set(
    files.flatMap((f) =>
      f.originalPath ? [f.path, f.originalPath] : [f.path],
    ),
  ),
];
function Graph({
  row,
  width,
  height,
}: {
  row: GraphRow;
  width: number;
  height: number;
}) {
  const x = (column: number) => 18 + column * 14;
  return (
    <svg className="graph" width={width} height={height} aria-hidden="true">
      {row.edges.map((e, i) => {
        const y1 = e.start === "top" ? 0 : height / 2,
          y2 = e.end === "node" ? height / 2 : height;
        return (
          <path
            key={i}
            d={`M ${x(e.from)} ${y1} C ${x(e.from)} ${(y1 + y2) / 2}, ${x(e.to)} ${(y1 + y2) / 2}, ${x(e.to)} ${y2}`}
            stroke={e.color}
            strokeWidth="2"
            fill="none"
            opacity=".7"
          />
        );
      })}
      <circle
        cx={x(row.column)}
        cy={height / 2}
        r="4.5"
        fill="var(--surface)"
        stroke={row.color}
        strokeWidth="2.5"
      />
    </svg>
  );
}
function App() {
  const { preferences, setPreferences, t } = usePreferences();
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  useEffect(() => {
    const resize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const sidebarMax = Math.min(
    480,
    Math.max(228, viewportWidth - (viewportWidth <= 1200 ? 740 : 840)),
  );
  const sidebarMin = Math.min(
    sidebarMax,
    Math.round(228 + (preferences.textScale - 100) * 1.5),
  );
  const sidebarWidth = Math.min(
    sidebarMax,
    Math.max(
      sidebarMin,
      preferences.sidebarWidth ??
        Math.round((228 * preferences.textScale) / 100),
    ),
  );
  const historyRowHeight = Math.round((48 * preferences.textScale) / 100);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const date = (value: string) =>
    new Date(value).toLocaleDateString(
      preferences.language === "en" ? "en-US" : "pt-BR",
      { day: "2-digit", month: "short" },
    );
  const [repo, setRepo] = useState<Repository | null>(null);
  const [recents, setRecents] = useState(readRecents);
  const [busy, setBusy] = useState<MessageKey | "">("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{
    key: MessageKey;
    params?: MessageParams;
  } | null>(null);
  const [query, setQuery] = useState("");
  const [commit, setCommit] = useState<Commit | null>(null);
  const [commitFiles, setCommitFiles] = useState<FileChange[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [patch, setPatch] = useState("");
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [message, setMessage] = useState("");
  const [draftWarning, setDraftWarning] = useState(false);
  const updateMessage = (value: string) => {
    setMessage(value);
    try {
      saveDraft(activePath.current, value);
      setDraftWarning(false);
    } catch {
      setDraftWarning(true);
    }
  };
  const [branchDialog, setBranchDialog] = useState(false);
  const [newBranch, setNewBranch] = useState("");
  const [pathDialog, setPathDialog] = useState(false);
  const [manualPath, setManualPath] = useState("");
  const [limit, setLimit] = useState(400);
  const activePath = useRef("");
  const diffRequest = useRef(0);
  const commitRequest = useRef(0);
  const busyRef = useRef(false);
  const pickingRef = useRef(false);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const selectedFileRef = useRef<HTMLDivElement>(null);
  const unstaged = repo?.files.filter(changed) || [];
  const staged = repo?.files.filter(stagedFile) || [];
  const conflict = repo?.files.some((f) => f.conflict);
  const operationBlocksCommit = !!repo?.operation && repo.operation !== "merge";
  const operationBlocksNavigation = !!repo?.operation;
  const guidance = errorGuidance(error);
  const hunkActions =
    !commit &&
    !!selection &&
    !selection.file.conflict &&
    !selection.file.originalPath &&
    (selection.staged ? selection.file.index : selection.file.worktree) ===
      "M" &&
    /^index [^\n]+ 100(?:644|755)$/m.test(patch) &&
    !/^(?:old mode|new mode) /m.test(patch);
  const graph = useMemo(
    () => layoutGraph(repo?.commits || []),
    [repo?.commits],
  );
  const graphWidth = Math.max(62, graph.columns * 14 + 28);
  const visibleCommits = useMemo(
    () =>
      (repo?.commits || [])
        .map((c, i) => ({ commit: c, row: graph.rows[i] }))
        .filter(({ commit: c }) =>
          `${c.subject} ${c.author} ${c.hash} ${c.refs}`
            .toLowerCase()
            .includes(query.toLowerCase()),
        ),
    [repo?.commits, graph, query],
  );
  const diffLines = useMemo(
    () => parseDiff(localizeBackendMessage(patch, preferences.language)),
    [patch, preferences.language],
  );
  const additions = diffLines.filter((l) => l.kind === "add").length;
  const deletions = diffLines.filter((l) => l.kind === "remove").length;

  const load = useCallback(async (path: string, count: number) => {
    const data = await invoke<Repository>("repository", { path, limit: count });
    setRepo(data);
    activePath.current = data.path;
    setRecents((previous) => {
      const next = [
        { path: data.path, name: data.name },
        ...previous.filter((r) => r.path !== data.path),
      ].slice(0, 8);
      try {
        localStorage.setItem("ramo.recents", JSON.stringify(next));
      } catch {
        /* storage unavailable */
      }
      return next;
    });
    return data;
  }, []);
  const openRepository = useCallback(
    async (path: string) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy("Abrindo repositório");
      setError("");
      setNotice(null);
      try {
        const opened = await load(path, 400);
        setLimit(400);
        setCommit(null);
        setSelection(null);
        setPatch("");
        setQuery("");
        try {
          setMessage(readDraft(opened.path));
          setDraftWarning(false);
        } catch {
          setMessage("");
          setDraftWarning(true);
        }
        setPathDialog(false);
      } catch (e) {
        setError(String(e));
      } finally {
        busyRef.current = false;
        setBusy("");
      }
    },
    [load],
  );
  const choose = useCallback(async () => {
    if (busyRef.current) return;
    if (!isTauri()) {
      setPathDialog(true);
      return;
    }
    pickingRef.current = true;
    try {
      const path = await open({
        directory: true,
        multiple: false,
        title: t("Abrir repositório Git"),
      });
      if (typeof path === "string") await openRepository(path);
    } catch (e) {
      setError(String(e));
    } finally {
      pickingRef.current = false;
    }
  }, [openRepository, t]);
  const refresh = useCallback(async () => {
    if (!activePath.current || busyRef.current) return;
    busyRef.current = true;
    setBusy("Atualizando");
    setError("");
    try {
      await load(activePath.current, limit);
    } catch (e) {
      setError(String(e));
    } finally {
      busyRef.current = false;
      setBusy("");
    }
  }, [load, limit]);
  const act = useCallback(
    async (action: Action, label: MessageKey) => {
      if (!repo || busyRef.current) return false;
      busyRef.current = true;
      setBusy(label);
      setError("");
      setNotice(null);
      let succeeded = false;
      try {
        await invoke<string>("operate", { path: repo.path, action });
        succeeded = true;
        if (action.kind === "commit") {
          setMessage("");
          try {
            saveDraft(repo.path, "");
            setDraftWarning(false);
          } catch {
            setDraftWarning(true);
          }
          setSelection(null);
        }
        if (action.kind === "switch" || action.kind === "createBranch") {
          setCommit(null);
          setSelection(null);
          setBranchDialog(false);
          setNewBranch("");
        }
        setNotice({
          key:
            action.kind === "commit"
              ? "Commit criado com sucesso."
              : "Pronto. Repositório atualizado.",
        });
      } catch (e) {
        setError(String(e));
      }
      // Git hooks can change files even when an operation fails.
      try {
        const updated = await load(repo.path, limit);
        if (
          succeeded &&
          (action.kind === "stage" || action.kind === "unstage")
        ) {
          const inIndex = action.kind === "stage";
          const moved = updated.files.filter(
            (f) =>
              action.files.includes(f.path) &&
              (inIndex ? stagedFile(f) : changed(f)),
          );
          if (moved[0]) setSelection({ file: moved[0], staged: inIndex });
          setNotice({
            key: inIndex
              ? moved.length === 1
                ? "movedToStageOne"
                : "movedToStageOther"
              : moved.length === 1
                ? "movedToUnstagedOne"
                : "movedToUnstagedOther",
            params: { count: moved.length },
          });
        }
      } catch (e) {
        setError(String(e));
      } finally {
        busyRef.current = false;
        setBusy("");
      }
      return succeeded;
    },
    [repo, limit, load],
  );
  useEffect(() => {
    const onFocus = () => {
      if (!pickingRef.current) void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        ["+", "=", "-", "0"].includes(event.key)
      ) {
        event.preventDefault();
        setPreferences((p) => {
          const index = textScales.indexOf(
            p.textScale as (typeof textScales)[number],
          );
          return {
            ...p,
            textScale:
              event.key === "0"
                ? 100
                : textScales[
                    Math.max(
                      0,
                      Math.min(
                        textScales.length - 1,
                        index + (event.key === "-" ? -1 : 1),
                      ),
                    )
                  ],
          };
        });
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "o") {
        event.preventDefault();
        void choose();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "r") {
        event.preventDefault();
        void refresh();
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key === "Enter" &&
        message.trim() &&
        staged.length &&
        !commit &&
        !conflict &&
        !operationBlocksCommit
      ) {
        event.preventDefault();
        void act({ kind: "commit", message }, "Fazendo commit");
      }
      if ((event.metaKey || event.ctrlKey) && event.key === ",") {
        event.preventDefault();
        setSettingsOpen(true);
      }
      if (event.key === "Escape") {
        setBranchDialog(false);
        setPathDialog(false);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [
    choose,
    refresh,
    act,
    message,
    staged.length,
    commit,
    conflict,
    operationBlocksCommit,
    setPreferences,
  ]);
  useEffect(() => {
    const request = ++commitRequest.current;
    setSelection(null);
    setPatch("");
    setCommitFiles([]);
    if (!commit || !repo) {
      setLoadingFiles(false);
      return;
    }
    setLoadingFiles(true);
    invoke<FileChange[]>("changes", { path: repo.path, revision: commit.hash })
      .then((files) => {
        if (request !== commitRequest.current) return;
        setCommitFiles(files);
        if (files[0]) setSelection({ file: files[0], staged: false });
      })
      .catch((e) => {
        if (request === commitRequest.current) setError(String(e));
      })
      .finally(() => {
        if (request === commitRequest.current) setLoadingFiles(false);
      });
    return () => {
      commitRequest.current++;
    };
  }, [commit, repo?.path]);
  useEffect(() => {
    const request = ++diffRequest.current;
    setPatch("");
    if (!repo || !selection) {
      setLoadingDiff(false);
      return;
    }
    setLoadingDiff(true);
    invoke<string>("diff", {
      path: repo.path,
      file: selection.file.path,
      staged: selection.staged,
      revision: commit?.hash ?? null,
    })
      .then((value) => {
        if (request === diffRequest.current) setPatch(value);
      })
      .catch((e) => {
        if (request === diffRequest.current) setError(String(e));
      })
      .finally(() => {
        if (request === diffRequest.current) setLoadingDiff(false);
      });
    return () => {
      diffRequest.current++;
    };
  }, [repo, selection, commit?.hash]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(id);
  }, [notice]);
  useEffect(() => {
    if (!selection || commit || !repo) return;
    const current = repo.files.find((f) => f.path === selection.file.path);
    if (
      !current ||
      (selection.staged ? !stagedFile(current) : !changed(current))
    )
      setSelection(null);
  }, [repo, commit, selection]);

  useEffect(() => {
    selectedFileRef.current?.scrollIntoView({ block: "nearest" });
  }, [selection]);

  const fileRow = (file: FileChange, inIndex: boolean, historical = false) => (
    <div
      className={`file-row ${selection?.file.path === file.path && (historical || selection.staged === inIndex) ? "selected" : ""}`}
      key={`${file.path}:${inIndex}`}
      ref={
        selection?.file.path === file.path &&
        (historical || selection.staged === inIndex)
          ? selectedFileRef
          : undefined
      }
    >
      <button
        className="file-select"
        title={
          file.originalPath ? `${file.originalPath} → ${file.path}` : file.path
        }
        onClick={() => setSelection({ file, staged: inIndex })}
      >
        <span
          className={`file-status ${file.conflict ? "conflict" : (inIndex ? file.index : file.worktree) === "D" ? "deleted" : ""}`}
        >
          {file.conflict
            ? "!"
            : (inIndex ? file.index : file.worktree) === "?"
              ? "U"
              : inIndex
                ? file.index
                : file.worktree}
        </span>
        <span>{file.path}</span>
      </button>
      {!historical && (
        <button
          className="icon-button file-action"
          disabled={!!busy}
          title={inIndex ? t("Retirar do stage") : t("Adicionar ao stage")}
          aria-label={`${inIndex ? t("Retirar do stage") : t("Adicionar ao stage")} ${file.path}`}
          onClick={() =>
            void act(
              { kind: inIndex ? "unstage" : "stage", files: paths([file]) },
              inIndex ? "Retirando do stage" : "Adicionando ao stage",
            )
          }
        >
          {inIndex ? <Minus size={14} /> : <Plus size={14} />}
        </button>
      )}
    </div>
  );

  return (
    <div className="app-shell">
      <aside className="sidebar" style={{ width: sidebarWidth }}>
        <div className="brand">
          <div className="brand-mark">
            <GitBranch size={24} strokeWidth={2.3} />
          </div>
          <span>
            gitloom<span className="brand-dot">.</span>
          </span>
        </div>
        <button
          className="open-repo"
          onClick={() => void choose()}
          disabled={!!busy}
        >
          <FolderOpen size={16} />
          <span>{t("Abrir repositório")}</span>
          <kbd>⌘ O</kbd>
        </button>
        <div className="sidebar-label">
          {" "}
          {t("REPOSITÓRIOS")}{" "}
          <span>{recents.length.toString().padStart(2, "0")}</span>
        </div>
        <nav className="recent-list" aria-label={t("Repositórios recentes")}>
          {recents.map((r) => (
            <button
              key={r.path}
              title={r.path}
              className={`recent ${repo?.path === r.path ? "active" : ""}`}
              disabled={!!busy}
              onClick={() => void openRepository(r.path)}
            >
              <FolderGit2 size={17} />
              <span>{r.name}</span>
              {repo?.path === r.path && <span className="active-dot" />}
            </button>
          ))}
          {!recents.length && (
            <p className="sidebar-hint">
              {" "}
              {t("Seus repositórios recentes")} <br />{" "}
              {t("aparecem aqui.")}{" "}
            </p>
          )}
        </nav>
        {repo && (
          <>
            <div className="sidebar-divider" />
            <div className="sidebar-label">
              {" "}
              {t("BRANCHES LOCAIS")}{" "}
              <button
                className="icon-button"
                title={t("Criar branch")}
                aria-label={t("Criar branch")}
                disabled={!!busy || operationBlocksNavigation}
                onClick={() => setBranchDialog(true)}
              >
                <Plus size={15} />
              </button>
            </div>
            <nav className="branch-list" aria-label={t("Branches locais")}>
              {repo.branches
                .filter((b) => !b.remote)
                .map((b) => (
                  <button
                    key={b.name}
                    className={`branch ${b.current ? "current" : ""}`}
                    disabled={!!busy || b.current || operationBlocksNavigation}
                    onClick={() =>
                      void act(
                        { kind: "switch", branch: b.name },
                        "Trocando de branch",
                      )
                    }
                    title={b.upstream ? `${b.name} → ${b.upstream}` : b.name}
                  >
                    <GitBranch size={14} />
                    <span>{b.name}</span>
                    {b.current && <Check size={13} />}
                  </button>
                ))}
            </nav>
            <div className="sidebar-label remote-label">
              {" "}
              {t("REMOTOS")} <span>{repo.remotes.length}</span>
            </div>
            {repo.remotes.map((r) => (
              <div className="remote" key={r}>
                <GitPullRequest size={14} />
                {r}
                <span className="connection-dot" />
              </div>
            ))}
          </>
        )}
        <div className="sidebar-footer">
          <button
            className="preferences-button"
            aria-label={t("settings")}
            onClick={() => setSettingsOpen(true)}
            title={t("settingsShortcut")}
          >
            <Settings size={16} />
            {t("settings")}
            <kbd>⌘ ,</kbd>
          </button>
          <div className="sidebar-bottom">
            <span className="local-dot" /> {t("Git local. Do seu jeito.")}{" "}
            <div> {t("Menos distração. Mais código.")} </div>
          </div>
        </div>
      </aside>
      <SidebarDivider
        width={sidebarWidth}
        min={sidebarMin}
        max={sidebarMax}
        label={t("resizeSidebar")}
        hint={t("resizeSidebarHint")}
        onResize={(width) =>
          setPreferences((p) => ({ ...p, sidebarWidth: width }))
        }
        onReset={() => setPreferences((p) => ({ ...p, sidebarWidth: null }))}
      />
      <main className="main">
        <header className="toolbar">
          <div className="breadcrumb">
            <FolderGit2 size={17} />
            <strong>{repo?.name || t("Seu próximo commit começa aqui")}</strong>
            {repo && (
              <>
                <ChevronRight size={14} />
                <span className="branch-pill">
                  <GitBranch size={13} />
                  {repo.branch === "HEAD destacado"
                    ? t("HEAD destacado")
                    : repo.branch}
                </span>
              </>
            )}
          </div>
          <div className="toolbar-actions">
            {repo && (
              <>
                <button
                  disabled={!!busy || !repo.remotes.length}
                  onClick={() =>
                    void act({ kind: "fetch" }, "Buscando atualizações")
                  }
                  title={t("Buscar atualizações dos remotos")}
                >
                  <RefreshCw size={14} /> Fetch
                </button>
                <button
                  disabled={
                    !!busy ||
                    !repo.remotes.length ||
                    operationBlocksNavigation ||
                    repo.headDetached ||
                    !repo.upstream ||
                    conflict
                  }
                  onClick={() =>
                    void act({ kind: "pull" }, "Recebendo commits")
                  }
                  title={t("Receber commits (fast-forward)")}
                >
                  <ArrowDown size={15} /> Pull{" "}
                  {repo.behind > 0 && (
                    <span className="count">{repo.behind}</span>
                  )}
                </button>
                <button
                  disabled={!!busy || !repo.remotes.length}
                  onClick={() => void act({ kind: "push" }, "Enviando commits")}
                >
                  <ArrowUp size={15} /> Push{" "}
                  {repo.ahead > 0 && (
                    <span className="count">{repo.ahead}</span>
                  )}
                </button>
                <span className="toolbar-separator" />
                <button
                  className="icon-button"
                  aria-label={t("Atualizar repositório")}
                  title={t("Atualizar · ⌘ R")}
                  disabled={!!busy}
                  onClick={() => void refresh()}
                >
                  <RefreshCw size={16} className={busy ? "spin" : ""} />
                </button>
              </>
            )}
          </div>
        </header>
        {error && !branchDialog && !pathDialog && (
          <div role="alert" className="banner error">
            <div>
              <strong> {t("Não foi possível concluir a operação")} </strong>
              {guidance && <p>{t(guidance)}</p>}
              {!guidance || guidance !== error ? (
                <pre>{localizeBackendMessage(error, preferences.language)}</pre>
              ) : null}
            </div>
            <button
              className="icon-button"
              aria-label={t("Fechar erro")}
              onClick={() => setError("")}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {draftWarning && (
          <div role="status" className="banner">
            <p>{t("draftWarning")}</p>
          </div>
        )}
        {repo &&
          (repo.operation ||
            conflict ||
            repo.headDetached ||
            (repo.ahead > 0 && repo.behind > 0) ||
            (!repo.upstream && repo.remotes.length > 0)) && (
            <div role="status" className="banner repository-guidance">
              <div>
                {repo.operation && (
                  <p>
                    {t(
                      (
                        {
                          merge: "mergeGuidance",
                          rebase: "rebaseGuidance",
                          cherryPick: "cherryPickGuidance",
                          revert: "revertGuidance",
                          am: "amGuidance",
                        } as const
                      )[repo.operation],
                    )}
                  </p>
                )}
                {conflict && <p>{t("conflictGuidance")}</p>}
                {repo.headDetached && <p>{t("detachedGuidance")}</p>}
                {repo.ahead > 0 && repo.behind > 0 && (
                  <p>{t("divergenceGuidance")}</p>
                )}
                {!repo.upstream && repo.remotes.length > 0 && (
                  <p>{t("missingUpstream")}</p>
                )}
              </div>
            </div>
          )}
        {!repo ? (
          <div className="welcome">
            <div className="welcome-tag">
              <span className="local-dot" /> {t("SEU GIT, COM CLAREZA")}{" "}
            </div>
            <div className="welcome-icon">
              <GitBranch size={42} />
            </div>
            <h1>
              {" "}
              {t("Espaço para o que importa")}
              <span>.</span>
            </h1>
            <p>
              {" "}
              {t("Branches, alterações e commits.")} <br />{" "}
              {t("Tudo à vista, do primeiro diff ao próximo push.")}{" "}
            </p>
            <button
              className="primary welcome-open"
              disabled={!!busy}
              onClick={() => void choose()}
            >
              <FolderOpen size={17} /> {t("Abrir um repositório")}{" "}
              <ArrowUpRight size={16} />
            </button>
            <span className="welcome-shortcut">
              {" "}
              {t("ou use")} <kbd>⌘ O</kbd> {t("para escolher uma pasta")}{" "}
            </span>
            <div className="welcome-features">
              <span>
                <GitCommitHorizontal size={17} /> {t("Histórico visual")}{" "}
              </span>
              <span>
                <FileCode2 size={17} /> {t("Diffs claros")}{" "}
              </span>
              <span>
                <Layers size={17} /> {t("Commits simples")}{" "}
              </span>
            </div>
            <div className="welcome-footnote">
              {" "}
              {t(
                "Um cliente Git pequeno, para o seu trabalho de todo dia.",
              )}{" "}
            </div>
          </div>
        ) : (
          <>
            <section className="workspace-heading">
              <div>
                <div className="eyebrow">WORKSPACE</div>
                <h1>
                  {repo.name}
                  <span className="repo-state">
                    {repo.files.length
                      ? t(
                          repo.files.length === 1
                            ? "changedFile"
                            : "changedFiles",
                          { count: repo.files.length },
                        )
                      : t("Tudo em dia")}
                  </span>
                </h1>
              </div>
              <button
                className="quiet-button"
                disabled={!!busy || operationBlocksNavigation}
                onClick={() => setBranchDialog(true)}
              >
                <Plus size={14} /> {t("Nova branch")}{" "}
              </button>
            </section>
            <div className="workspace">
              <section className="history-panel" hidden={!!selection}>
                <div className="panel-heading">
                  <span>
                    <GitCommitHorizontal size={17} /> {t("Histórico")}{" "}
                  </span>
                  <span className="muted">
                    {repo.commits.length} {t("commits")}{" "}
                  </span>
                </div>
                <div className="search-wrap">
                  <Search size={15} />
                  <input
                    aria-label={t("Buscar commits")}
                    placeholder={t("Buscar commit, autor ou hash…")}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  {query && (
                    <button
                      className="icon-button"
                      aria-label={t("Limpar busca")}
                      onClick={() => setQuery("")}
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
                <button
                  className={`working-tree ${!commit ? "active" : ""}`}
                  onClick={() => {
                    setCommit(null);
                    setSelection(null);
                  }}
                >
                  <div className="working-icon">
                    <Layers size={17} />
                  </div>
                  <div>
                    <strong> {t("Alterações locais")} </strong>
                    <span>
                      {repo.files.length
                        ? t("Prepare seu próximo commit")
                        : t("Nenhuma alteração pendente")}
                    </span>
                  </div>
                  <span className="count">{repo.files.length}</span>
                  <ChevronRight size={14} />
                </button>
                <div className="history-columns">
                  <span>
                    {query ? t("RESULTADOS DA BUSCA") : t("GRAFO / MENSAGEM")}
                  </span>
                  <span> {t("DATA")} </span>
                </div>
                <div className="commit-list">
                  {visibleCommits.map(({ commit: c, row }) => (
                    <button
                      key={c.hash}
                      className={`commit-row ${commit?.hash === c.hash ? "selected" : ""}`}
                      onClick={() => {
                        setCommit(c);
                        setError("");
                      }}
                      title={`${c.subject}\n${c.author} · ${c.hash}`}
                    >
                      {!query && (
                        <Graph
                          row={row}
                          width={graphWidth}
                          height={historyRowHeight}
                        />
                      )}
                      <div className="commit-text">
                        <div className="commit-subject">{c.subject}</div>
                        <div className="commit-meta">
                          <span className="hash">{c.hash.slice(0, 7)}</span>
                          <span>{c.author}</span>
                          {c.refs && (
                            <span className="ref-label">
                              {c.refs.replace("HEAD -> ", "").split(", ")[0]}
                            </span>
                          )}
                        </div>
                      </div>
                      <time>{date(c.date)}</time>
                    </button>
                  ))}
                  {!visibleCommits.length && (
                    <div className="empty-state compact">
                      <GitCommitHorizontal size={26} />
                      <strong>
                        {query
                          ? t("Nenhum commit encontrado")
                          : t("Uma história para começar")}
                      </strong>
                      <p>
                        {query
                          ? t("Tente outro autor, hash ou mensagem.")
                          : t(
                              "Adicione seus arquivos e crie o primeiro commit.",
                            )}
                      </p>
                    </div>
                  )}
                  {repo.hasMore && !query && (
                    <button
                      className="load-more"
                      disabled={!!busy || limit >= 5000}
                      onClick={async () => {
                        const next = Math.min(limit + 400, 5000);
                        setLimit(next);
                        busyRef.current = true;
                        setBusy("Carregando histórico");
                        try {
                          await load(repo.path, next);
                        } catch (e) {
                          setError(String(e));
                        } finally {
                          busyRef.current = false;
                          setBusy("");
                        }
                      }}
                    >
                      {limit >= 5000
                        ? t("Limite de 5.000 commits nesta versão")
                        : t("Carregar mais commits")}
                    </button>
                  )}
                </div>
                <div className="history-footer">
                  <span className="local-dot" />
                  {query
                    ? t("Busca nos commits carregados")
                    : t("Todas as branches")}
                  <span>
                    <GitBranch size={12} />
                    {repo.branches.filter((b) => !b.remote).length}
                  </span>
                </div>
              </section>
              {selection && (
                <section
                  className="diff-panel"
                  aria-label={t("Visualização do diff")}
                >
                  <div className="panel-heading">
                    <span>
                      <FileCode2 size={17} /> {t("Alterações do arquivo")}{" "}
                    </span>
                    <button
                      className="quiet-button"
                      onClick={() => setSelection(null)}
                    >
                      <ArrowLeft size={14} /> {t("Voltar ao histórico")}{" "}
                    </button>
                  </div>
                  <div className="diff-heading">
                    <span>
                      <FileCode2 size={14} />
                      <span title={selection.file.path}>
                        {selection.file.path}
                      </span>
                    </span>
                    <span className="diff-stats">
                      <b>+{additions}</b>
                      <b>−{deletions}</b>
                    </span>
                  </div>
                  <div className="diff-area">
                    {loadingDiff ? (
                      <div className="empty-state">
                        <LoaderCircle size={22} className="spin" />
                        <p> {t("Carregando diff…")} </p>
                      </div>
                    ) : patch ? (
                      <div
                        className="diff-code"
                        aria-label={t("Diff do arquivo")}
                      >
                        {diffLines.map((line, i) => (
                          <div className={`diff-line ${line.kind}`} key={i}>
                            <span className="line-number">{line.old}</span>
                            <span className="line-number">{line.next}</span>
                            <code>{line.text || " "}</code>
                            {line.kind === "hunk" && hunkActions && (
                              <button
                                className="hunk-action"
                                disabled={!!busy || loadingDiff}
                                onClick={() =>
                                  void act(
                                    {
                                      kind: "applyHunk",
                                      file: selection.file.path,
                                      staged: selection.staged,
                                      expectedDiff: patch,
                                      hunk: diffLines
                                        .slice(0, i)
                                        .filter((l) => l.kind === "hunk")
                                        .length,
                                    },
                                    selection.staged
                                      ? "Retirando do stage"
                                      : "Adicionando ao stage",
                                  )
                                }
                              >
                                {t(
                                  selection.staged
                                    ? "unstageHunk"
                                    : "stageHunk",
                                )}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="empty-state">
                        <Check size={25} />
                        <p> {t("Nenhuma diferença textual nesta seleção.")} </p>
                      </div>
                    )}
                  </div>
                  <div className="history-footer">
                    <span className="local-dot" />
                    {commit
                      ? t("commitRef", { hash: commit.hash.slice(0, 7) })
                      : selection.staged
                        ? t("No stage · pronto para commit")
                        : t("Para preparar · alterações locais")}
                  </div>
                </section>
              )}
              <section
                className="changes-panel"
                aria-label={t("Arquivos e commit")}
              >
                <div className="panel-heading">
                  <span>
                    {commit ? (
                      <GitCommitHorizontal size={16} />
                    ) : (
                      <FileCode2 size={16} />
                    )}{" "}
                    {commit ? t("Detalhes do commit") : t("Alterações")}
                  </span>
                  {commit ? (
                    <button
                      className="text-button"
                      onClick={() => setCommit(null)}
                    >
                      {" "}
                      {t("Voltar ao local")} <X size={12} />
                    </button>
                  ) : (
                    <span className="muted">Working tree</span>
                  )}
                </div>
                {commit && (
                  <div className="commit-details">
                    <strong>{commit.subject}</strong>
                    <span>
                      {commit.author} · {date(commit.date)} ·{" "}
                      <code>{commit.hash.slice(0, 7)}</code>
                    </span>
                  </div>
                )}
                <div
                  className={`files-area ${commit ? "historical" : ""}`}
                  style={
                    commit
                      ? undefined
                      : {
                          gridTemplateRows: `minmax(100px, ${Math.min(8, Math.max(3, unstaged.length))}fr) minmax(100px, ${Math.min(8, Math.max(3, staged.length))}fr)`,
                        }
                  }
                >
                  {commit ? (
                    <>
                      <div className="file-group-heading">
                        <span>
                          {" "}
                          {t("ARQUIVOS DO COMMIT")} <b>{commitFiles.length}</b>
                        </span>
                      </div>
                      {loadingFiles ? (
                        <div className="small-loading">
                          <LoaderCircle size={15} className="spin" />{" "}
                          {t("Carregando arquivos…")}{" "}
                        </div>
                      ) : (
                        commitFiles.map((f) => fileRow(f, true, true))
                      )}
                      {!loadingFiles && !commitFiles.length && (
                        <p className="files-empty">
                          {" "}
                          {t("Nenhuma alteração de arquivo neste commit.")}{" "}
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <section
                        className="file-group"
                        aria-label={t("Para preparar")}
                      >
                        <div className="file-group-heading">
                          <span>
                            <ChevronDown size={12} /> {t("PARA PREPARAR")}{" "}
                            <b>{unstaged.length}</b>
                          </span>
                          <button
                            className="text-button"
                            disabled={!!busy || !unstaged.length}
                            onClick={() =>
                              void act(
                                { kind: "stage", files: paths(unstaged) },
                                "Adicionando ao stage",
                              )
                            }
                          >
                            <Plus size={12} /> {t("Preparar todos")}{" "}
                          </button>
                        </div>
                        <div className="file-list">
                          {unstaged.map((f) => fileRow(f, false))}
                          {!unstaged.length && (
                            <p className="files-empty">
                              <Check size={13} />{" "}
                              {t("Nenhuma alteração para preparar")}{" "}
                            </p>
                          )}
                        </div>
                      </section>
                      <section
                        className="file-group staged-group"
                        aria-label={t("No stage")}
                      >
                        <div className="file-group-heading">
                          <span>
                            <ChevronDown size={12} /> {t("NO STAGE")}{" "}
                            <b>{staged.length}</b>
                          </span>
                          <button
                            className="text-button"
                            disabled={!!busy || !staged.length}
                            onClick={() =>
                              void act(
                                { kind: "unstage", files: paths(staged) },
                                "Retirando do stage",
                              )
                            }
                          >
                            <Minus size={12} /> {t("Retirar todos")}{" "}
                          </button>
                        </div>
                        <div className="file-list">
                          {staged.map((f) => fileRow(f, true))}
                          {!staged.length && (
                            <p className="files-empty">
                              {" "}
                              {t("Os arquivos preparados aparecem aqui.")}{" "}
                            </p>
                          )}
                        </div>
                      </section>
                    </>
                  )}
                </div>
                {!commit && (
                  <form
                    className="commit-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void act({ kind: "commit", message }, "Fazendo commit");
                    }}
                  >
                    <label htmlFor="commit-message">
                      {" "}
                      {t("Seu próximo commit")}{" "}
                      <span>
                        {t(staged.length === 1 ? "stagedFile" : "stagedFiles", {
                          count: staged.length,
                        })}
                      </span>
                    </label>
                    <textarea
                      id="commit-message"
                      ref={messageRef}
                      placeholder={t("O que mudou?")}
                      value={message}
                      onChange={(e) => updateMessage(e.target.value)}
                      maxLength={16000}
                      disabled={!!busy}
                    />
                    {conflict && (
                      <p className="conflict-note">
                        {" "}
                        {t(
                          "Há conflitos. Resolva os arquivos no editor e adicione ao stage.",
                        )}{" "}
                      </p>
                    )}
                    <div className="commit-form-bottom">
                      <span> {t("⌘ Enter para fazer commit")} </span>
                      <button
                        className="primary"
                        disabled={
                          !!busy ||
                          !message.trim() ||
                          !staged.length ||
                          conflict ||
                          operationBlocksCommit
                        }
                        type="submit"
                      >
                        <GitCommitHorizontal size={16} />{" "}
                        {t("Fazer commit")}{" "}
                      </button>
                    </div>
                  </form>
                )}
              </section>
            </div>
          </>
        )}
        <footer className="statusbar">
          <span>
            {busy ? (
              <>
                <LoaderCircle size={12} className="spin" />
                {t(busy)}…
              </>
            ) : (
              <>
                <span className="local-dot" />
                {notice
                  ? t(notice.key, notice.params)
                  : t("Pronto para o próximo passo")}
              </>
            )}
          </span>
          <div
            className="text-scale-control"
            role="group"
            aria-label={t("textSize")}
          >
            <button
              aria-label={t("decreaseText")}
              disabled={preferences.textScale === textScales[0]}
              onClick={() =>
                setPreferences((p) => ({
                  ...p,
                  textScale:
                    textScales[
                      Math.max(
                        0,
                        textScales.indexOf(
                          p.textScale as (typeof textScales)[number],
                        ) - 1,
                      )
                    ],
                }))
              }
            >
              <Minus size={13} />
            </button>
            <FlatSelect
              aria-label={t("textSize")}
              value={preferences.textScale}
              onChange={(e) =>
                setPreferences((p) => ({
                  ...p,
                  textScale: Number(e.target.value),
                }))
              }
            >
              {textScales.map((size) => (
                <option key={size} value={size}>
                  {size}%
                </option>
              ))}
            </FlatSelect>
            <button
              aria-label={t("increaseText")}
              disabled={
                preferences.textScale === textScales[textScales.length - 1]
              }
              onClick={() =>
                setPreferences((p) => ({
                  ...p,
                  textScale:
                    textScales[
                      Math.min(
                        textScales.length - 1,
                        textScales.indexOf(
                          p.textScale as (typeof textScales)[number],
                        ) + 1,
                      )
                    ],
                }))
              }
            >
              <Plus size={13} />
            </button>
          </div>
          <span title={repo?.path}>
            {repo?.path || t("Feito para manter o foco")}{" "}
            <span className="statusbar-version">GITLOOM / 0.1.0</span>
          </span>
        </footer>
      </main>
      {settingsOpen && (
        <SettingsDialog
          preferences={preferences}
          setPreferences={setPreferences}
          t={t}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {branchDialog && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) setBranchDialog(false);
          }}
        >
          <form
            className="modal"
            onSubmit={(e) => {
              e.preventDefault();
              void act(
                { kind: "createBranch", branch: newBranch.trim() },
                "Criando branch",
              );
            }}
          >
            <div className="modal-heading">
              <div className="modal-icon">
                <GitBranch size={22} />
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label={t("Fechar")}
                disabled={!!busy}
                onClick={() => setBranchDialog(false)}
              >
                <X size={18} />
              </button>
            </div>
            <h2> {t("Um novo caminho.")} </h2>
            <p>
              {" "}
              {t(
                "A nova branch começa no HEAD atual. Você será levado para ela.",
              )}{" "}
            </p>
            {error && (
              <div role="alert" className="dialog-error">
                {localizeBackendMessage(error, preferences.language)}
              </div>
            )}
            <label htmlFor="new-branch"> {t("Nome da branch")} </label>
            <input
              id="new-branch"
              autoFocus
              placeholder={t("branchPlaceholder")}
              value={newBranch}
              onChange={(e) => setNewBranch(e.target.value)}
              disabled={!!busy}
            />
            <button className="primary" disabled={!!busy || !newBranch.trim()}>
              <Plus size={15} /> {t("Criar e trocar de branch")}{" "}
            </button>
          </form>
        </div>
      )}
      {pathDialog && (
        <div className="modal-backdrop">
          <form
            className="modal"
            onSubmit={(e) => {
              e.preventDefault();
              void openRepository(manualPath);
            }}
          >
            <div className="modal-heading">
              <FolderOpen size={24} />
              <button
                type="button"
                className="icon-button"
                aria-label={t("Fechar")}
                onClick={() => setPathDialog(false)}
              >
                <X size={18} />
              </button>
            </div>
            <h2> {t("Abrir repositório")} </h2>
            <p>
              {" "}
              {t(
                "A leitura dos arquivos usa o aplicativo desktop. Execute",
              )}{" "}
              <code>npm run tauri dev</code> {t("para acessar seu Git.")}{" "}
            </p>
            {error && (
              <div role="alert" className="dialog-error">
                {localizeBackendMessage(error, preferences.language)}
              </div>
            )}
            <label htmlFor="repo-path">
              {" "}
              {t("Caminho absoluto da pasta")}{" "}
            </label>
            <input
              id="repo-path"
              autoFocus
              placeholder={t("pathPlaceholder")}
              value={manualPath}
              onChange={(e) => setManualPath(e.target.value)}
            />
            <button className="primary" disabled={!!busy || !manualPath.trim()}>
              {" "}
              {t("Abrir repositório")} <ArrowUpRight size={15} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
export default App;
