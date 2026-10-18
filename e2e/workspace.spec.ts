import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }, testInfo) => {
  const savedPreferences = testInfo.title.startsWith("preferences:")
    ? null
    : { theme: "sage", language: "pt-BR" };
  await page.addInitScript((initialPreferences) => {
    if (initialPreferences && !localStorage.getItem("gitloom.preferences"))
      localStorage.setItem(
        "gitloom.preferences",
        JSON.stringify(initialPreferences),
      );
    const hash = (n: number) => n.toString(16).padStart(40, "0");
    const repo = {
      path: "/tmp/gitloom-playground",
      name: "gitloom-playground",
      branch: "main",
      branches: [
        { name: "main", current: true, upstream: "origin/main", remote: false },
        {
          name: "feature/diff-view",
          current: false,
          upstream: "",
          remote: false,
        },
      ],
      commits: [
        {
          hash: hash(6),
          parents: [hash(5), hash(4)],
          author: "Pedro",
          date: "2026-10-16T15:00:00Z",
          subject: "Merge feature/diff-view into main",
          refs: "HEAD -> main, origin/main",
        },
        {
          hash: hash(5),
          parents: [hash(3)],
          author: "Pedro",
          date: "2026-10-16T14:00:00Z",
          subject: "Ajusta estados vazios da interface",
          refs: "",
        },
        {
          hash: hash(4),
          parents: [hash(3)],
          author: "Pedro",
          date: "2026-10-16T13:00:00Z",
          subject: "Adiciona visualização de diff",
          refs: "feature/diff-view",
        },
        {
          hash: hash(3),
          parents: [hash(2)],
          author: "Pedro",
          date: "2026-10-15T12:00:00Z",
          subject: "Conecta o histórico ao Git local",
          refs: "",
        },
        {
          hash: hash(2),
          parents: [hash(1)],
          author: "Pedro",
          date: "2026-10-15T11:00:00Z",
          subject: "Cria navegação de branches",
          refs: "",
        },
        {
          hash: hash(1),
          parents: [],
          author: "Pedro",
          date: "2026-10-15T10:00:00Z",
          subject: "Primeiro commit",
          refs: "",
        },
      ],
      files: [
        {
          path: "src/App.tsx",
          originalPath: null,
          index: " ",
          worktree: "M",
          conflict: false,
        },
        {
          path: "src/components/DiffView.tsx",
          originalPath: null,
          index: "?",
          worktree: "?",
          conflict: false,
        },
      ],
      githubRepository: null as string | null,
      worktrees: [
        {
          path: "/tmp/gitloom-playground",
          branch: "main",
          locked: false,
          prunable: false,
        },
        {
          path: "/tmp/linked-worktree",
          branch: "feature/linked",
          locked: false,
          prunable: false,
        },
      ],
      stashes: [
        {
          name: "stash@{0}",
          hash: hash(10),
          subject: "On main: unfinished work",
        },
      ],
      tags: ["v0.2.0"],
      remotes: ["origin"],
      ahead: 0,
      behind: 0,
      hasMore: false,
      upstream: "origin/main",
      operation: null as string | null,
      headDetached: false,
    };
    if (new URLSearchParams(location.search).has("many-files")) {
      repo.files.push(
        ...Array.from({ length: 100 }, (_, i) => ({
          path: `src/z-file-${String(i).padStart(3, "0")}.ts`,
          originalPath: null,
          index: i < 40 ? "M" : " ",
          worktree: i < 40 ? " " : "M",
          conflict: false,
        })),
      );
    }
    const params = new URLSearchParams(location.search);
    if (params.has("long-branch"))
      repo.branch =
        "feature/very-long-branch-name-with-many-details-and-a-ticket-reference-GITLOOM-1234-improve-the-workspace-layout";
    if (params.has("git-state")) {
      repo.operation = params.get("git-state");
      repo.files[0].conflict = true;
    }
    if (params.has("diverged")) {
      repo.ahead = 2;
      repo.behind = 3;
    }
    if (params.has("no-upstream")) repo.upstream = "";
    if (params.has("avatars")) {
      repo.githubRepository = "example/project";
      Object.assign(repo.commits[0], {
        committer: "Maria Silva",
        committerEmail: "maria@example.invalid",
        refs: "HEAD -> main, origin/main, tag: v0.2.0",
      });
      Object.assign(repo.commits[1], {
        committer: "Offline Person",
        committerEmail: "offline@example.invalid",
      });
    }
    (window as any).__operations = [];
    const hunkStaged = [false, false];
    let stale = params.has("stale-hunk");
    const hunkPatch = (staged: boolean) => {
      const hunks = [
        "@@ -1,1 +1,1 @@\n-old\n+first change\n",
        "@@ -20,1 +20,1 @@\n-old second\n+second change\n",
      ];
      return (
        "diff --git a/src/App.tsx b/src/App.tsx\nindex abcdef0..1234567 100644\n--- a/src/App.tsx\n+++ b/src/App.tsx\n" +
        hunks.filter((_, i) => hunkStaged[i] === staged).join("")
      );
    };
    localStorage.setItem(
      "ramo.recents",
      JSON.stringify([
        { path: repo.path, name: repo.name },
        ...(params.has("draft-tests")
          ? [{ path: "/tmp/other-project", name: "other-project" }]
          : []),
      ]),
    );
    (window as any).__TAURI_INTERNALS__ = {
      invoke: async (cmd: string, args: any) => {
        if (cmd === "repository")
          return structuredClone({
            ...repo,
            path: args.path,
            name: args.path.split("/").pop(),
          });
        if (cmd === "changes")
          return [
            {
              path: "src/App.tsx",
              originalPath: null,
              index: "M",
              worktree: " ",
              conflict: false,
            },
          ];
        if (cmd === "diff" && params.has("hunk-tests"))
          return hunkPatch(args.staged);
        if (cmd === "diff")
          return 'diff --git a/src/App.tsx b/src/App.tsx\n--- a/src/App.tsx\n+++ b/src/App.tsx\n@@ -1,4 +1,5 @@\n import React from "react";\n-export default function App() {\n+export default function App() {\n+  const title = "Seu Git, com clareza";\n   return <main>Gitloom</main>;\n }';
        if (cmd === "operate") {
          const a = args.action;
          (window as any).__operations.push(a);
          if (a.kind === "removeWorktree") {
            if (params.has("dirty-worktree"))
              throw "fatal: worktree contains modified or untracked files";
            repo.worktrees = repo.worktrees.filter((w) => w.path !== a.path);
          }
          if (a.kind === "createWorktree")
            repo.worktrees.push({
              path: a.path,
              branch: a.branch || "HEAD",
              locked: false,
              prunable: false,
            });
          if (a.kind === "createTag") repo.tags.push(a.name);
          if (a.kind === "deleteTag")
            repo.tags = repo.tags.filter((name) => name !== a.name);
          if (a.kind === "checkoutTag") {
            repo.headDetached = true;
            repo.branch = "HEAD destacado";
          }
          if (a.kind === "dropStash" || a.kind === "popStash")
            repo.stashes = repo.stashes.filter(
              (stash) => stash.hash !== a.hash,
            );
          if (a.kind === "saveStash")
            repo.stashes.push({
              name: "stash@{1}",
              hash: hash(11),
              subject: a.message,
            });
          if (a.kind === "push" && params.has("auth-error"))
            throw "fatal: Authentication failed for remote";
          if (a.kind === "applyHunk") {
            if (stale) {
              stale = false;
              throw "staleHunk";
            }
            const available = hunkStaged
              .map((value, i) => ({ value, i }))
              .filter((h) => h.value === a.staged);
            hunkStaged[available[a.hunk].i] = !a.staged;
            repo.files[0].index = hunkStaged.some(Boolean) ? "M" : " ";
            repo.files[0].worktree = hunkStaged.every(Boolean) ? " " : "M";
          }
          if (a.kind === "stage")
            repo.files.forEach((f) => {
              if (a.files.includes(f.path)) {
                f.index = f.worktree === "?" ? "A" : f.worktree;
                f.worktree = " ";
              }
            });
          if (a.kind === "unstage")
            repo.files.forEach((f) => {
              if (a.files.includes(f.path)) {
                f.worktree = f.index === "A" ? "?" : f.index;
                f.index = f.index === "A" ? "?" : " ";
              }
            });
          if (a.kind === "commit") {
            if (a.message.includes("fail"))
              throw "Hook de commit recusou a mensagem";
            repo.files = repo.files.filter(
              (f) => f.index === " " || f.index === "?",
            );
          }
          if (a.kind === "createBranch" || a.kind === "switch") {
            repo.branch = a.branch;
            repo.branches.forEach((b) => {
              b.current = b.name === a.branch;
            });
            if (a.kind === "createBranch")
              repo.branches.push({
                name: a.branch,
                current: true,
                upstream: "",
                remote: false,
              });
          }
          return "";
        }
        throw `Comando inesperado: ${cmd}`;
      },
    };
  }, savedPreferences);
});
test("open, inspect, stage, recover failed commit, commit, and create branch", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Espaço para o que importa." }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/welcome.png" });
  await page
    .getByRole("button", { name: "gitloom-playground", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: /gitloom-playground/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "M src/App.tsx", exact: true })
    .click();
  await expect(page.getByLabel("Diff do arquivo")).toContainText(
    "Seu Git, com clareza",
  );
  const diffPanel = page.getByRole("region", {
    name: "Visualização do diff",
    exact: true,
  });
  await expect(diffPanel).toBeVisible();
  await expect(page.getByLabel("Buscar commits")).toBeHidden();
  await expect(
    page
      .getByRole("region", { name: "Arquivos e commit" })
      .getByLabel("Diff do arquivo"),
  ).toHaveCount(0);
  const diffBounds = await diffPanel.boundingBox();
  const filesBounds = await page
    .getByRole("region", { name: "Arquivos e commit" })
    .boundingBox();
  expect(diffBounds!.x + diffBounds!.width).toBeLessThan(filesBounds!.x);
  await page.getByLabel("Seu próximo commit").fill("Rascunho preservado");
  await page.getByRole("button", { name: "Voltar ao histórico" }).click();
  await expect(page.getByLabel("Buscar commits")).toBeVisible();
  await expect(page.getByLabel("Seu próximo commit")).toHaveValue(
    "Rascunho preservado",
  );
  await page
    .getByRole("button", { name: "M src/App.tsx", exact: true })
    .click();
  await page.screenshot({ path: "test-results/workspace.png" });
  await page
    .getByRole("button", {
      name: "Adicionar ao stage src/App.tsx",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Retirar do stage src/App.tsx",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByLabel("Seu próximo commit").fill("fail");
  await page.getByRole("button", { name: "Fazer commit", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Hook de commit recusou");
  await expect(page.getByLabel("Seu próximo commit")).toHaveValue("fail");
  await page.getByLabel("Seu próximo commit").fill("Melhora a interface");
  await page.getByRole("button", { name: "Fazer commit", exact: true }).click();
  await expect(page.getByLabel("Seu próximo commit")).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Fazer commit", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Nova branch", exact: true }).click();
  await page.getByLabel("Nome da branch").fill("feature/new");
  await page.getByRole("button", { name: "Criar e trocar de branch" }).click();
  await expect(page.locator(".branch-pill")).toHaveText("feature/new");
});
test("search and inspect historical changes separately from working tree", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "gitloom-playground", exact: true })
    .click();
  await page.getByLabel("Buscar commits").fill("visualização");
  await expect(page.locator(".commit-row")).toHaveCount(1);
  await expect(page.locator(".graph")).toHaveCount(0);
  await page.locator(".commit-row").click();
  await expect(
    page.getByText("Detalhes do commit", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Diff do arquivo")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Fazer commit", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Voltar ao local" }).click();
  await expect(
    page.getByRole("button", { name: "Fazer commit", exact: true }),
  ).toBeVisible();
});

for (const height of [900, 680]) {
  test(`both file groups stay visible and reveal moved files at ${height}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1200, height });
    await page.goto("/?many-files");
    await page
      .getByRole("button", { name: "gitloom-playground", exact: true })
      .click();
    const unstaged = page.getByRole("region", {
      name: "Para preparar",
      exact: true,
    });
    const staged = page.getByRole("region", { name: "No stage", exact: true });
    await expect(unstaged.locator(".file-group-heading")).toBeInViewport();
    await expect(staged.locator(".file-group-heading")).toBeInViewport();
    const filesBounds = await page.locator(".files-area").boundingBox();
    const panelBounds = await page
      .getByRole("region", { name: "Arquivos e commit" })
      .boundingBox();
    expect(filesBounds!.height).toBeGreaterThan(panelBounds!.height / 2);
    expect((await unstaged.boundingBox())!.height).toBeGreaterThanOrEqual(100);
    expect((await staged.boundingBox())!.height).toBeGreaterThanOrEqual(100);
    await page
      .getByRole("button", {
        name: "Adicionar ao stage src/z-file-099.ts",
        exact: true,
      })
      .click();
    const moved = staged.getByRole("button", {
      name: "M src/z-file-099.ts",
      exact: true,
    });
    await expect(moved).toBeInViewport();
    await expect(staged.locator(".file-row.selected")).toContainText(
      "src/z-file-099.ts",
    );
    await expect(unstaged.locator(".file-group-heading")).toBeInViewport();
    await expect(staged.locator(".file-group-heading")).toBeInViewport();
    await page.screenshot({ path: `test-results/many-files-${height}.png` });
    await staged
      .getByRole("button", {
        name: "Retirar do stage src/z-file-099.ts",
        exact: true,
      })
      .click();
    await expect(
      unstaged.getByRole("button", {
        name: "M src/z-file-099.ts",
        exact: true,
      }),
    ).toBeInViewport();
    await expect(staged.locator(".file-group-heading")).toBeInViewport();
    await expect(
      page.getByRole("button", { name: "Fazer commit", exact: true }),
    ).toBeInViewport();
  });
}

test("preferences: English default, live themes, persistent language, and intact workspace", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Room for what matters." }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page).toHaveTitle("Gitloom — Local Git");
  await page
    .getByRole("button", { name: "gitloom-playground", exact: true })
    .click();
  await page
    .getByRole("button", { name: "M src/App.tsx", exact: true })
    .click();
  await page.getByLabel("Your next commit").fill("Preserve this draft");
  for (const theme of ["Dark", "Light", "Darcula", "Nord", "Sage"]) {
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("radio", { name: theme, exact: true }).check();
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme",
      theme.toLowerCase(),
    );
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "Diff viewer" }),
    ).toBeVisible();
    await expect(page.getByLabel("Your next commit")).toHaveValue(
      "Preserve this draft",
    );
    await page.screenshot({
      path: `test-results/theme-${theme.toLowerCase()}.png`,
    });
  }
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("radio", { name: "Darcula", exact: true }).check();
  await page.getByLabel("Language", { exact: true }).selectOption("pt-BR");
  await expect(
    page.getByRole("dialog", { name: "Configurações", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".settings-footer .primary")).toHaveCSS(
    "background-color",
    "rgb(204, 120, 50)",
  );
  await page.screenshot({
    path: "test-results/settings-pt-br.png",
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Concluir", exact: true }).click();
  await expect(page.getByLabel("Seu próximo commit")).toHaveValue(
    "Preserve this draft",
  );
  await expect(
    page.getByRole("region", { name: "Visualização do diff" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Voltar ao histórico" }).click();
  await expect(page.getByLabel("Buscar commits")).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "darcula");
  await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
  await expect(
    page.getByRole("button", { name: "Configurações", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Configurações", exact: true })
    .click();
  await page.getByLabel("Idioma", { exact: true }).selectOption("en");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page
    .getByRole("button", { name: "gitloom-playground", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Stage src/App.tsx", exact: true })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Staged", exact: true })
      .getByRole("button", { name: "M src/App.tsx", exact: true }),
  ).toBeInViewport();
  await expect(page.getByText("1 file staged.", { exact: true })).toBeVisible();
});

test("preferences: system theme follows OS appearance changes", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("radio", { name: "Follow system", exact: true }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("preferences: text sizing is immediate, independent, persistent and keyboard accessible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1080, height: 680 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "gitloom-playground", exact: true })
    .click();
  await page
    .getByRole("button", { name: "M src/App.tsx", exact: true })
    .click();
  const draft = page.getByRole("textbox", { name: "Your next commit" });
  await draft.fill("Keep this draft while resizing");
  const scale = page.locator(".statusbar select");
  await scale.selectOption("150");
  await expect(page.locator("html")).toHaveCSS("font-size", "19.5px");
  await expect(page.locator(".diff-code")).toHaveCSS("font-size", "12px");
  await expect(
    page.getByRole("button", { name: "Increase text size", exact: true }),
  ).toBeDisabled();
  await expect(draft).toHaveValue("Keep this draft while resizing");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Diff font size", { exact: true }).selectOption("24");
  await expect(page.locator(".diff-code")).toHaveCSS("font-size", "24px");
  await expect(page.locator(".diff-line").first()).toHaveCSS(
    "min-height",
    "48px",
  );
  await page.screenshot({
    path: "test-results/font-settings-150.png",
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(draft).toHaveValue("Keep this draft while resizing");
  await page.screenshot({
    path: "test-results/font-workspace-150.png",
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Back to history", exact: true })
    .click();
  await page.screenshot({
    path: "test-results/font-history-150.png",
    animations: "disabled",
  });
  const subject = page.locator(".commit-subject").first();
  await expect(subject).toHaveCSS("font-size", "18px");
  await page
    .getByRole("button", { name: "M src/App.tsx", exact: true })
    .click();
  await page.keyboard.press("Control+-");
  await expect(scale).toHaveValue("140");
  await page.keyboard.press("Control+=");
  await expect(scale).toHaveValue("150");
  await page.keyboard.press("Control+0");
  await expect(scale).toHaveValue("100");
  await expect(page.locator(".diff-code")).toHaveCSS("font-size", "24px");
  await scale.selectOption("125");
  await page.reload();
  await expect(scale).toHaveValue("125");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Diff font size", { exact: true })).toHaveValue(
    "24",
  );
  await expect(
    page.getByLabel("Interface text size", { exact: true }).last(),
  ).toHaveValue("125");
});

test("preferences: spacing scales with text and sidebar resizing persists within window limits", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "gitloom-playground", exact: true })
    .click();
  await page.locator(".statusbar select").selectOption("150");
  const sidebar = page.locator(".sidebar");
  const divider = page.locator(".sidebar-resizer:not(.workspace-resizer)");
  await expect(sidebar).toHaveCSS("width", "342px");
  await expect(page.locator(".commit-row").first()).toHaveCSS("height", "72px");
  await expect(page.locator(".graph svg").first()).toHaveAttribute(
    "height",
    "72",
  );
  await expect(page.locator(".file-row").first()).toHaveCSS("height", "48px");
  const graphRows = await page.locator(".graph").evaluateAll((nodes) =>
    nodes.slice(0, 2).map((node) => {
      const r = node.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom };
    }),
  );
  expect(graphRows[0].bottom).toBeCloseTo(graphRows[1].top, 1);
  // Drag the actual splitter, then verify that keyboard adjustment and reload retain it.
  const handle = (await divider.boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 200);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 78, handle.y + 200, {
    steps: 8,
  });
  await page.mouse.up();
  await expect(sidebar).toHaveCSS("width", "420px");
  await divider.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(sidebar).toHaveCSS("width", "410px");
  await page.reload();
  await expect(sidebar).toHaveCSS("width", "410px");
  await page
    .getByRole("button", { name: "gitloom-playground", exact: true })
    .click();
  await page.setViewportSize({ width: 1080, height: 680 });
  await expect(sidebar).toHaveCSS("width", "340px");
  for (const language of ["en", "pt-BR"]) {
    await page
      .getByRole("button", {
        name: "Settings",
        exact: true,
      })
      .click();
    await page.locator("#preferences-language").selectOption(language);
    await page
      .getByRole("button", {
        name: language === "en" ? "Done" : "Concluir",
        exact: true,
      })
      .click();
    const geometry = await page.locator(".open-repo").evaluate((button) => {
      const label = button.querySelector("span")!;
      const shortcut = button.querySelector("kbd")!;
      const range = document.createRange();
      range.selectNodeContents(label);
      return {
        lines: range.getClientRects().length,
        fits: button.scrollWidth <= button.clientWidth,
        labelRight: label.getBoundingClientRect().right,
        shortcutLeft: shortcut.getBoundingClientRect().left,
      };
    });
    expect(geometry.lines).toBe(1);
    expect(geometry.fits).toBe(true);
    expect(geometry.labelRight).toBeLessThanOrEqual(geometry.shortcutLeft);
    await page.screenshot({
      path: `test-results/spacing-150-${language}.png`,
      animations: "disabled",
    });
  }
  await page
    .getByRole("button", {
      name: "Adicionar ao stage src/App.tsx",
      exact: true,
    })
    .click();
  await expect(
    page
      .getByRole("region", { name: "No stage", exact: true })
      .getByRole("button", { name: "M src/App.tsx", exact: true }),
  ).toBeInViewport();
  await page.setViewportSize({ width: 1280, height: 680 });
  await expect(divider).toHaveAttribute("aria-valuemax", "440");
  await divider.focus();
  await page.keyboard.press("End");
  await expect(sidebar).toHaveCSS("width", "440px");
  expect(
    await page
      .locator(".workspace")
      .evaluate((workspace) => workspace.scrollWidth <= workspace.clientWidth),
  ).toBe(true);
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(sidebar).toHaveCSS("width", "410px");
  await divider.dblclick();
  await expect(sidebar).toHaveCSS("width", "342px");
});

test("drafts survive repository switches and reload, and clear only after a successful commit", async ({
  page,
}) => {
  await page.goto("/?draft-tests");
  const first = page.getByRole("button", {
    name: "gitloom-playground",
    exact: true,
  });
  const other = page.getByRole("button", {
    name: "other-project",
    exact: true,
  });
  await first.click();
  await page.getByLabel("Seu próximo commit").fill("first draft");
  await other.click();
  await expect(page.getByLabel("Seu próximo commit")).toHaveValue("");
  await page.getByLabel("Seu próximo commit").fill("other draft");
  await first.click();
  await expect(page.getByLabel("Seu próximo commit")).toHaveValue(
    "first draft",
  );
  await page.reload();
  await first.click();
  await expect(page.getByLabel("Seu próximo commit")).toHaveValue(
    "first draft",
  );
  await page
    .getByRole("button", {
      name: "Adicionar ao stage src/App.tsx",
      exact: true,
    })
    .click();
  await page.getByLabel("Seu próximo commit").fill("fail preserved");
  await page.getByRole("button", { name: "Fazer commit", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.reload();
  await first.click();
  await expect(page.getByLabel("Seu próximo commit")).toHaveValue(
    "fail preserved",
  );
  await page
    .getByRole("button", {
      name: "Adicionar ao stage src/App.tsx",
      exact: true,
    })
    .click();
  await page.getByLabel("Seu próximo commit").fill("successful commit");
  await page.getByRole("button", { name: "Fazer commit", exact: true }).click();
  await expect(page.getByLabel("Seu próximo commit")).toHaveValue("");
  await page.reload();
  await first.click();
  await expect(page.getByLabel("Seu próximo commit")).toHaveValue("");
  await other.click();
  await expect(page.getByLabel("Seu próximo commit")).toHaveValue(
    "other draft",
  );
});

test("hunks can be staged and unstaged independently, with stale preview recovery", async ({
  page,
}) => {
  await page.goto("/?hunk-tests&stale-hunk");
  await page
    .getByRole("button", { name: "gitloom-playground", exact: true })
    .click();
  await page
    .getByRole("button", { name: "M src/App.tsx", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Preparar hunk", exact: true }),
  ).toHaveCount(2);
  await page
    .getByRole("button", { name: "Preparar hunk", exact: true })
    .last()
    .click();
  await expect(page.getByRole("alert")).toContainText("arquivo mudou");
  await expect(
    page.getByRole("button", { name: "Preparar hunk", exact: true }),
  ).toHaveCount(2);
  await page
    .getByRole("button", { name: "Preparar hunk", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("button", { name: "Preparar hunk", exact: true }),
  ).toHaveCount(1);
  await expect(page.getByLabel("Diff do arquivo")).toContainText(
    "first change",
  );
  await expect(page.getByLabel("Diff do arquivo")).not.toContainText(
    "second change",
  );
  await page
    .getByRole("region", { name: "No stage", exact: true })
    .getByRole("button", { name: "M src/App.tsx", exact: true })
    .click();
  await expect(page.getByLabel("Diff do arquivo")).toContainText(
    "second change",
  );
  await page.screenshot({ path: "test-results/hunks.png" });
  await page
    .getByRole("button", { name: "Retirar hunk do stage", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Retirar do stage src/App.tsx",
      exact: true,
    }),
  ).toHaveCount(0);
});

for (const [state, command] of [
  ["merge", "git merge --abort"],
  ["rebase", "git rebase --continue"],
  ["cherryPick", "git cherry-pick --continue"],
  ["revert", "git revert --continue"],
]) {
  test(`Git state: ${state} explains recovery and blocks branch switching`, async ({
    page,
  }) => {
    await page.goto(`/?git-state=${state}`);
    await page
      .getByRole("button", { name: "gitloom-playground", exact: true })
      .click();
    await expect(page.locator(".repository-guidance")).toContainText(command);
    if (state === "rebase")
      await page.screenshot({ path: "test-results/rebase-guidance.png" });
    await expect(
      page.getByRole("button", { name: "feature/diff-view", exact: true }),
    ).toBeDisabled();
    await expect(page.getByRole("button", { name: /^Pull/ })).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Fazer commit", exact: true }),
    ).toBeDisabled();
  });
}

test("divergence, missing upstream and authentication failures explain next steps", async ({
  page,
}) => {
  await page.goto("/?diverged&no-upstream&auth-error");
  await page
    .getByRole("button", { name: "gitloom-playground", exact: true })
    .click();
  await expect(page.locator(".repository-guidance")).toContainText(
    "histórico local e remoto divergiu",
  );
  await expect(page.locator(".repository-guidance")).toContainText(
    "não tem upstream",
  );
  await expect(page.getByRole("button", { name: /^Pull/ })).toBeDisabled();
  await page.getByRole("button", { name: /^Push/ }).click();
  await expect(page.getByRole("alert")).toContainText("SSH agent");
  await expect(page.getByRole("alert")).toContainText(
    "fatal: Authentication failed for remote",
  );
});

test("draft storage failure keeps the typed message and shows a warning", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "gitloom-playground", exact: true })
    .click();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("gitloom.draft:"))
        throw new DOMException("Storage full", "QuotaExceededError");
      original.call(this, key, value);
    };
  });
  await page.getByLabel("Seu próximo commit").fill("important unsaved draft");
  await expect(page.getByLabel("Seu próximo commit")).toHaveValue(
    "important unsaved draft",
  );
  await expect(page.getByRole("status")).toContainText("rascunho");
});

test("collapsed navigation preserves shortcuts, drafts and the expanded width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1080, height: 680 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "gitloom-playground", exact: true })
    .click();
  await page.getByLabel("Seu próximo commit").fill("Keep while collapsed");
  const before = (await page.locator(".workspace").boundingBox())!.width;
  await page
    .getByRole("button", { name: "Recolher barra lateral", exact: true })
    .click();
  await expect(page.locator(".sidebar")).toHaveCSS("width", "64px");
  await expect(
    page.getByRole("separator", {
      name: "Redimensionar barra lateral",
      exact: true,
    }),
  ).toHaveCount(0);
  expect(
    (await page.locator(".workspace").boundingBox())!.width,
  ).toBeGreaterThan(before + 150);
  await expect(
    page.getByRole("button", { name: "Abrir repositório", exact: true }),
  ).toBeInViewport();
  await expect(page.getByLabel("Seu próximo commit")).toHaveValue(
    "Keep while collapsed",
  );
  await page
    .getByRole("button", { name: "Configurações", exact: true })
    .click();
  await page.getByRole("button", { name: "Concluir", exact: true }).click();
  await page.screenshot({ path: "test-results/sidebar-collapsed.png" });
  await page.reload();
  await expect(page.locator(".sidebar")).toHaveCSS("width", "64px");
  await page
    .getByRole("button", { name: "gitloom-playground", exact: true })
    .click();
  await expect(page.getByLabel("Seu próximo commit")).toHaveValue(
    "Keep while collapsed",
  );
  await page
    .getByRole("button", { name: "Expandir barra lateral", exact: true })
    .click();
  await expect(page.locator(".sidebar")).toHaveCSS("width", "228px");
});

test("workspace proportions support drag, keyboard, persistence, diff and narrow windows", async ({
  page,
}) => {
  await page.goto("/");
  const open = () =>
    page
      .getByRole("button", { name: "gitloom-playground", exact: true })
      .click();
  await open();
  const divider = page.getByRole("separator", {
    name: "Redimensionar Histórico e Alterações",
    exact: true,
  });
  const history = page.locator(".history-panel");
  const initial = (await history.boundingBox())!.width;
  const box = (await divider.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 120);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 100, box.y + 120, {
    steps: 10,
  });
  await page.mouse.up();
  const resized = (await history.boundingBox())!.width;
  expect(resized).toBeCloseTo(initial - 100, 0);
  await divider.focus();
  await page.keyboard.press("ArrowRight");
  expect((await history.boundingBox())!.width).toBeCloseTo(resized + 10, 0);
  await page.reload();
  await open();
  await expect(async () =>
    expect((await history.boundingBox())!.width).toBeCloseTo(resized + 10, 0),
  ).toPass();
  await page
    .getByRole("button", { name: "M src/App.tsx", exact: true })
    .click();
  await expect(page.locator(".diff-panel")).toBeVisible();
  await expect(divider).toBeVisible();
  await page.setViewportSize({ width: 1080, height: 680 });
  await divider.focus();
  await page.keyboard.press("End");
  expect(
    (await page.locator(".changes-panel").boundingBox())!.width,
  ).toBeGreaterThanOrEqual(299);
  expect(
    await page
      .locator(".workspace")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.screenshot({ path: "test-results/workspace-resized.png" });
  await divider.dblclick();
  const percent = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("gitloom.preferences")!).historyPercent,
  );
  expect(percent).toBe(58.33);
});

test("long branch names remain fully visible without pushing toolbar actions out of view", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1080, height: 680 });
  await page.goto("/?long-branch");
  await page
    .getByRole("button", { name: "gitloom-playground", exact: true })
    .click();
  for (const scale of ["100", "150"]) {
    await page.locator(".statusbar select").selectOption(scale);
    const branch = page.locator(".branch-pill > span");
    const fits = await branch.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const container = el.parentElement!.getBoundingClientRect();
      return Array.from(range.getClientRects()).every(
        (r) =>
          r.left >= container.left &&
          r.right <= container.right + 1 &&
          r.bottom <= container.bottom,
      );
    });
    expect(fits).toBe(true);
    await expect(page.getByRole("button", { name: /^Push/ })).toBeInViewport();
    expect(
      await page
        .locator(".toolbar")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await page.screenshot({ path: `test-results/long-branch-${scale}.png` });
  }
});

test("reference column shows all decorations and graph uses committer photos with initials fallback", async ({
  page,
}) => {
  let avatarRequests = 0;
  await page.route(
    "https://api.github.com/repos/example/project/commits/*",
    async (route) => {
      avatarRequests++;
      if (route.request().url().endsWith("6"))
        await route.fulfill({
          json: {
            committer: {
              avatar_url: "https://avatars.githubusercontent.com/u/42",
            },
          },
        });
      else await route.fulfill({ status: 404, json: {} });
    },
  );
  await page.route("https://avatars.githubusercontent.com/u/42", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="green"/></svg>',
    }),
  );
  await page.goto("/?avatars");
  await page
    .getByRole("button", { name: "gitloom-playground", exact: true })
    .click();
  await expect(page.locator(".refs-heading")).toHaveText("BRANCH / TAG");
  const first = page.locator(".commit-row").first();
  await expect(first.locator(".commit-refs .ref-label")).toHaveText([
    "main",
    "origin/main",
    "v0.2.0",
  ]);
  await expect(first.locator(".commit-avatar img")).toHaveAttribute(
    "alt",
    "Maria Silva",
  );
  await expect(
    page.locator(".commit-row").nth(1).locator(".commit-avatar"),
  ).toHaveText("OP");
  await expect(first.locator(".commit-meta")).toContainText("Pedro");
  await page
    .getByRole("textbox", { name: "Buscar commits", exact: true })
    .fill("Merge");
  await expect(page.locator(".search-avatar img")).toHaveAttribute(
    "alt",
    "Maria Silva",
  );
  expect(avatarRequests).toBeLessThanOrEqual(6);
});

test("sidebar creates worktrees and tags, confirms removals and applies stashes", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "gitloom-playground", exact: true })
    .click();
  const worktrees = page.getByRole("region", {
    name: "WORKTREES",
    exact: true,
  });
  await expect(
    worktrees.getByRole("button", { name: /feature\/linked/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Criar worktree", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Caminho absoluto da pasta")
    .fill("/tmp/another-tree");
  await dialog.getByLabel(/Nova branch/).fill("feature/new-tree");
  await dialog
    .getByRole("button", { name: "Criar worktree", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    worktrees.getByRole("button", { name: /feature\/new-tree/ }),
  ).toBeVisible();
  await worktrees
    .getByRole("button", {
      name: "Remover worktree /tmp/another-tree",
      exact: true,
    })
    .click();
  dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("/tmp/another-tree");
  await dialog
    .getByRole("button", { name: "Remover worktree", exact: true })
    .click();
  await expect(
    worktrees.getByRole("button", { name: /feature\/new-tree/ }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Criar tag", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome da tag").fill("v1.0");
  await dialog.getByRole("button", { name: "Criar tag", exact: true }).click();
  const tags = page.getByRole("region", { name: "TAGS", exact: true });
  await expect(
    tags.getByRole("button", { name: "v1.0", exact: true }),
  ).toBeVisible();
  await tags.getByRole("button", { name: "v1.0", exact: true }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("HEAD destacado");
  await dialog.getByRole("button", { name: "Abrir tag", exact: true }).click();
  await page
    .getByRole("button", { name: "Excluir tag local v1.0", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Excluir tag local", exact: true })
    .click();
  await expect(
    tags.getByRole("button", { name: "v1.0", exact: true }),
  ).toHaveCount(0);
  const stashes = page.getByRole("region", { name: "STASHES", exact: true });
  await stashes.getByRole("button", { name: "Aplicar", exact: true }).click();
  await expect(stashes).toContainText("unfinished work");
  await stashes
    .getByRole("button", { name: "Aplicar e remover stash", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Aplicar e remover stash", exact: true })
    .click();
  await expect(stashes).toContainText("Nenhum item");
  await page.getByRole("button", { name: "Salvar stash", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Mensagem do stash")
    .fill("Work in progress");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Salvar stash", exact: true })
    .click();
  await expect(stashes).toContainText("Work in progress");
  await page.screenshot({ path: "test-results/repository-sections.png" });
  await worktrees.getByRole("button", { name: /feature\/linked/ }).click();
  await expect(page.locator(".branch-pill")).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("ramo.recents") || "[]")[0].path,
    ),
  ).toBe("/tmp/linked-worktree");
});

test("sidebar keeps removal errors visible and allows retry or cancellation", async ({
  page,
}) => {
  await page.goto("/?dirty-worktree");
  await page
    .getByRole("button", { name: "gitloom-playground", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Remover worktree /tmp/linked-worktree",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Remover worktree", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "modified or untracked files",
  );
  await dialog.getByRole("button", { name: "Fechar", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /feature\/linked/ }),
  ).toBeVisible();
});
