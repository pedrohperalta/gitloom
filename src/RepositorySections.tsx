import { SidebarSection } from "./SidebarSection";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Archive,
  Check,
  RefreshCw,
  FolderGit2,
  GitBranch,
  Plus,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import type { Action, Repository } from "./types";
import type { MessageKey, MessageParams } from "./i18n";

type Props = {
  repo: Repository;
  collapsedSections: string[];
  onToggleSection: (id: string) => void;
  busy: boolean;
  error: string;
  blocked: boolean;
  createBranch: () => void;
  act: (action: Action, label: MessageKey) => Promise<boolean>;
  openRepository: (path: string) => Promise<void>;
  t: (key: MessageKey, params?: MessageParams) => string;
};
type Dialog = {
  title: MessageKey;
  description?: string;
  destructive?: boolean;
  fields: { label: MessageKey; value: string; required?: boolean }[];
  action: (values: string[]) => Action;
};
export function RepositorySections({
  repo,
  collapsedSections,
  onToggleSection,
  busy,
  error,
  blocked,
  createBranch,
  act,
  openRepository,
  t,
}: Props) {
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [dialogError, setDialogError] = useState(false);
  const modal = useRef<HTMLDialogElement>(null);
  const dialogOpen = dialog !== null;
  useEffect(() => {
    if (dialogOpen) {
      modal.current?.showModal();
      modal.current
        ?.querySelector<HTMLElement>("[data-initial-focus='true']")
        ?.focus();
    }
  }, [dialogOpen]);
  const show = (value: Dialog) => {
    setDialogError(false);
    setDialog(value);
  };
  const confirm = (title: MessageKey, description: string, action: Action) =>
    show({ title, description, fields: [], action: () => action });
  const run = (action: Action) => void act(action, "Atualizando");
  const add = (label: MessageKey, onClick: () => void, disabled = blocked) => (
    <button
      className="icon-button"
      title={t(label)}
      aria-label={t(label)}
      disabled={busy || disabled}
      onClick={onClick}
    >
      <Plus size={15} />
    </button>
  );
  const remove = (
    label: MessageKey,
    name: string,
    action: Action,
    disabled = false,
  ) => (
    <button
      className="icon-button"
      aria-label={`${t(label)} ${name}`}
      title={t(label)}
      disabled={busy || disabled}
      onClick={() =>
        show({
          title: label,
          description: t("confirmRemoval", { name }),
          destructive: true,
          fields: [],
          action: () => action,
        })
      }
    >
      <Trash2 size={13} />
    </button>
  );
  const section = (
    title: MessageKey,
    count: number,
    action: ReactNode,
    children: ReactNode,
  ) => (
    <SidebarSection
      id={title}
      title={t(title)}
      count={count}
      collapsed={collapsedSections.includes(title)}
      onToggle={onToggleSection}
      actions={action}
    >
      <div className="branch-list">
        {count ? children : <p className="sidebar-hint">{t("sectionEmpty")}</p>}
      </div>
    </SidebarSection>
  );
  return (
    <>
      {section(
        "BRANCHES LOCAIS",
        repo.branches.filter((branch) => !branch.remote).length,
        add("Criar branch", createBranch),
        repo.branches
          .filter((branch) => !branch.remote)
          .map((branch) => (
            <div className="sidebar-item" key={branch.name}>
              <button
                className={`branch ${branch.current ? "current" : ""}`}
                disabled={busy || blocked || branch.current}
                title={
                  branch.upstream
                    ? `${branch.name} → ${branch.upstream}`
                    : branch.name
                }
                onClick={() => run({ kind: "switch", branch: branch.name })}
              >
                <GitBranch size={14} />
                <span>{branch.name}</span>
                {branch.current && <Check size={13} />}
              </button>
              {!branch.current &&
                remove(
                  "deleteBranch",
                  branch.name,
                  { kind: "deleteBranch", branch: branch.name },
                  blocked,
                )}
            </div>
          )),
      )}
      {section(
        "REMOTOS",
        repo.remotes.length,
        <button
          className="icon-button"
          aria-label={t("Buscar atualizações dos remotos")}
          title={t("Buscar atualizações dos remotos")}
          disabled={busy || !repo.remotes.length}
          onClick={() => run({ kind: "fetch" })}
        >
          <RefreshCw size={14} />
        </button>,
        repo.remotes.map((remote) => (
          <SidebarSection
            key={remote}
            id={`remote:${remote}`}
            title={remote}
            count={
              repo.branches.filter(
                (branch) =>
                  branch.remote &&
                  branch.name.startsWith(`${remote}/`) &&
                  !branch.name.endsWith("/HEAD"),
              ).length
            }
            collapsed={collapsedSections.includes(`remote:${remote}`)}
            onToggle={onToggleSection}
            nested
          >
            {repo.branches
              .filter(
                (branch) =>
                  branch.remote &&
                  branch.name.startsWith(`${remote}/`) &&
                  !branch.name.endsWith("/HEAD"),
              )
              .map((branch) => (
                <button
                  key={branch.name}
                  className="branch"
                  title={t("trackRemoteBranch")}
                  disabled={busy || blocked}
                  onClick={() =>
                    run({ kind: "trackBranch", branch: branch.name })
                  }
                >
                  <GitBranch size={14} />
                  <span>{branch.name}</span>
                </button>
              ))}
          </SidebarSection>
        )),
      )}
      {section(
        "worktrees",
        repo.worktrees?.length || 0,
        add("createWorktree", () =>
          show({
            title: "createWorktree",
            fields: [
              { label: "worktreePath", value: "", required: true },
              { label: "worktreeBranch", value: "" },
            ],
            action: ([path, branch]) => ({
              kind: "createWorktree",
              path,
              branch,
            }),
          }),
        ),
        repo.worktrees?.map((worktree) => (
          <div className="sidebar-item" key={worktree.path}>
            <button
              className={`branch ${worktree.path === repo.path ? "current" : ""}`}
              title={worktree.path}
              disabled={
                busy || worktree.path === repo.path || worktree.prunable
              }
              onClick={() => void openRepository(worktree.path)}
            >
              <FolderGit2 size={14} />
              <span>
                {worktree.branch}
                <small>
                  {worktree.path.split("/").pop()}
                  {worktree.locked ? ` · ${t("lockedWorktree")}` : ""}
                </small>
              </span>
            </button>
            {remove(
              "removeWorktree",
              worktree.path,
              { kind: "removeWorktree", path: worktree.path },
              worktree.path === repo.path || worktree.locked,
            )}
          </div>
        )),
      )}
      {section(
        "stashes",
        repo.stashes?.length || 0,
        add(
          "saveStash",
          () =>
            show({
              title: "saveStash",
              description: t("stashIncludesUntracked"),
              fields: [{ label: "stashMessage", value: "", required: true }],
              action: ([message]) => ({ kind: "saveStash", message }),
            }),
          blocked || !repo.files.length,
        ),
        repo.stashes?.map((stash) => (
          <div className="stash-item" key={stash.hash}>
            <div className="remote" title={stash.subject}>
              <Archive size={14} />
              <span>
                {stash.name}
                <small>{stash.subject}</small>
              </span>
            </div>
            <div className="stash-actions">
              <button
                disabled={busy || blocked}
                onClick={() => run({ kind: "applyStash", hash: stash.hash })}
              >
                {t("applyStash")}
              </button>
              <button
                disabled={busy || blocked}
                onClick={() =>
                  confirm(
                    "popStash",
                    t("confirmPopStash", {
                      name: `${stash.name}: ${stash.subject}`,
                    }),
                    {
                      kind: "popStash",
                      hash: stash.hash,
                    },
                  )
                }
              >
                {t("popStash")}
              </button>
              {remove(
                "dropStash",
                stash.name,
                { kind: "dropStash", hash: stash.hash },
                blocked,
              )}
            </div>
          </div>
        )),
      )}
      {section(
        "tags",
        repo.tags?.length || 0,
        add(
          "createTag",
          () =>
            show({
              title: "createTag",
              fields: [
                { label: "tagName", value: "", required: true },
                { label: "tagRevision", value: "HEAD", required: true },
              ],
              action: ([name, revision]) => ({
                kind: "createTag",
                name,
                revision,
              }),
            }),
          false,
        ),
        repo.tags?.map((name) => (
          <div className="sidebar-item" key={name}>
            <button
              className="branch"
              disabled={busy || blocked}
              title={t("checkoutTag")}
              onClick={() =>
                confirm("checkoutTag", t("detachedTagWarning", { name }), {
                  kind: "checkoutTag",
                  name,
                })
              }
            >
              <Tag size={14} />
              <span>{name}</span>
            </button>
            {remove("deleteTag", name, { kind: "deleteTag", name })}
          </div>
        )),
      )}
      {dialog && (
        <dialog
          ref={modal}
          className="modal repository-dialog"
          aria-label={t(dialog.title)}
          onCancel={(event) => {
            if (busy) event.preventDefault();
            else setDialog(null);
          }}
        >
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setDialogError(false);
              if (
                await act(
                  dialog.action(
                    dialog.fields.map((field) => field.value.trim()),
                  ),
                  "Atualizando",
                )
              )
                setDialog(null);
              else setDialogError(true);
            }}
          >
            <div className="modal-heading">
              <h2>{t(dialog.title)}</h2>
              <button
                type="button"
                className="icon-button"
                aria-label={t("Fechar")}
                disabled={busy}
                onClick={() => setDialog(null)}
              >
                <X size={18} />
              </button>
            </div>
            {dialog.description && <p>{dialog.description}</p>}
            {dialog.fields.map((field, index) => (
              <label key={field.label} className="repository-field">
                {t(field.label)}
                <input
                  data-initial-focus={index === 0}
                  disabled={busy}
                  required={field.required}
                  value={field.value}
                  onChange={(event) =>
                    setDialog({
                      ...dialog,
                      fields: dialog.fields.map((item, i) =>
                        i === index
                          ? { ...item, value: event.target.value }
                          : item,
                      ),
                    })
                  }
                />
              </label>
            ))}
            {dialogError && (
              <p role="alert">{error || t("operationFailedReview")}</p>
            )}
            <div className="dialog-actions">
              <button
                type="button"
                data-initial-focus={!dialog.fields.length}
                disabled={busy}
                onClick={() => setDialog(null)}
              >
                {t("cancelAction")}
              </button>
              <button
                className={`primary ${dialog.destructive ? "destructive-action" : ""}`}
                disabled={
                  busy ||
                  dialog.fields.some(
                    (field) => field.required && !field.value.trim(),
                  )
                }
              >
                {t(dialog.title)}
              </button>
            </div>
          </form>
        </dialog>
      )}
    </>
  );
}
