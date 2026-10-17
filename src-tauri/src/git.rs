use serde::{Deserialize, Serialize};
use std::{
    io::{Read, Write},
    path::{Component, Path, PathBuf},
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};
const MAX_OUTPUT: u64 = 12 * 1024 * 1024;
fn git_binary() -> &'static str {
    for path in [
        "/opt/homebrew/bin/git",
        "/usr/local/bin/git",
        "/usr/bin/git",
    ] {
        if Path::new(path).exists() {
            return path;
        }
    }
    "git"
}
fn drain(mut input: impl Read) -> Vec<u8> {
    let mut output = Vec::new();
    let _ = input.by_ref().take(MAX_OUTPUT + 1).read_to_end(&mut output);
    let _ = std::io::copy(&mut input, &mut std::io::sink());
    output
}
fn run(root: &Path, args: &[&str], input: Option<&str>) -> Result<String, String> {
    run_output(root, args, input, false)
}
fn run_output(
    root: &Path,
    args: &[&str],
    input: Option<&str>,
    strict: bool,
) -> Result<String, String> {
    let mut command = Command::new(git_binary());
    command
        .current_dir(root)
        .args(["--no-pager", "-c", "color.ui=false"])
        .args(args)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_LITERAL_PATHSPECS", "1")
        .env("LC_ALL", "C")
        .env("GIT_OPTIONAL_LOCKS", "0")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    let mut child = command
        .spawn()
        .map_err(|e| format!("Não foi possível executar Git: {e}"))?;
    let mut stdin = child.stdin.take().unwrap();
    let content = input.unwrap_or("").to_owned();
    let writer = thread::spawn(move || {
        let _ = stdin.write_all(content.as_bytes());
    });
    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();
    let out = thread::spawn(move || drain(stdout));
    let err = thread::spawn(move || drain(stderr));
    let start = Instant::now();
    let status = loop {
        match child.try_wait().map_err(|e| e.to_string())? {
            Some(status) => break Some(status),
            None if start.elapsed() > Duration::from_secs(120) => {
                #[cfg(unix)]
                unsafe {
                    libc::kill(-(child.id() as i32), libc::SIGKILL);
                }
                let _ = child.kill();
                let _ = child.wait();
                break None;
            }
            None => thread::sleep(Duration::from_millis(25)),
        }
    };
    let _ = writer.join();
    let stdout = out.join().unwrap_or_default();
    let stderr = err.join().unwrap_or_default();
    let status = status
        .ok_or("A operação excedeu 120 segundos. Verifique a conexão e a autenticação Git.")?;
    if !status.success() {
        return Err(String::from_utf8_lossy(&stderr).trim().to_owned());
    }
    if stdout.len() as u64 > MAX_OUTPUT {
        return Err("Resultado muito grande (limite de 12 MB). Selecione um arquivo menor.".into());
    }
    if strict {
        return String::from_utf8(stdout).map_err(|_| "nonUtf8Diff".into());
    }
    Ok(String::from_utf8_lossy(&stdout).into_owned())
}
fn root(path: &str) -> Result<PathBuf, String> {
    let directory = Path::new(path)
        .canonicalize()
        .map_err(|e| format!("Pasta indisponível: {e}"))?;
    let result = run(&directory, &["rev-parse", "--show-toplevel"], None)?;
    Ok(PathBuf::from(result.trim_end_matches('\n')))
}
fn revision(root: &Path, value: &str) -> Result<String, String> {
    if !value.bytes().all(|b| b.is_ascii_hexdigit()) || !(40..=64).contains(&value.len()) {
        return Err("Commit inválido".into());
    }
    Ok(run(
        root,
        &["rev-parse", "--verify", &format!("{value}^{{commit}}")],
        None,
    )?
    .trim()
    .into())
}
fn file_path(value: &str) -> Result<(), String> {
    if value.is_empty()
        || Path::new(value)
            .components()
            .any(|c| !matches!(c, Component::Normal(_)))
        || value.contains('\0')
    {
        return Err("Caminho de arquivo inválido".into());
    }
    Ok(())
}
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileChange {
    pub path: String,
    pub original_path: Option<String>,
    pub index: String,
    pub worktree: String,
    pub conflict: bool,
}
fn parse_status(output: &str) -> Vec<FileChange> {
    let mut records = output.split('\0');
    let mut files = Vec::new();
    while let Some(record) = records.next() {
        if record.len() < 4 {
            continue;
        }
        let code = &record[..2];
        let original_path = if code.contains('R') || code.contains('C') {
            records.next().map(str::to_owned)
        } else {
            None
        };
        files.push(FileChange {
            path: record[3..].to_owned(),
            original_path,
            index: code[..1].into(),
            worktree: code[1..].into(),
            conflict: matches!(code, "DD" | "AU" | "UD" | "UA" | "DU" | "AA" | "UU"),
        });
    }
    files
}
#[derive(Serialize, Debug)]
pub struct Commit {
    pub hash: String,
    pub parents: Vec<String>,
    pub author: String,
    pub date: String,
    pub subject: String,
    pub refs: String,
}
#[derive(Serialize, Debug)]
pub struct Branch {
    pub name: String,
    pub current: bool,
    pub upstream: String,
    pub remote: bool,
}
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Repository {
    pub path: String,
    pub name: String,
    pub branch: String,
    pub branches: Vec<Branch>,
    pub commits: Vec<Commit>,
    pub files: Vec<FileChange>,
    pub remotes: Vec<String>,
    pub ahead: usize,
    pub behind: usize,
    pub has_more: bool,
    pub upstream: Option<String>,
    pub operation: Option<String>,
    pub head_detached: bool,
}
fn operation(root: &Path) -> Result<Option<String>, String> {
    let directory = run(root, &["rev-parse", "--absolute-git-dir"], None)?;
    let directory = Path::new(directory.trim_end_matches('\n'));
    for (marker, state) in [
        ("rebase-merge", "rebase"),
        ("rebase-apply/applying", "am"),
        ("rebase-apply", "rebase"),
        ("MERGE_HEAD", "merge"),
        ("CHERRY_PICK_HEAD", "cherryPick"),
        ("REVERT_HEAD", "revert"),
    ] {
        if directory.join(marker).exists() {
            return Ok(Some(state.into()));
        }
    }
    // A multi-commit sequence can remain active after its current conflict was committed.
    if let Ok(todo) = std::fs::read_to_string(directory.join("sequencer/todo")) {
        for line in todo.lines() {
            if line.starts_with("pick ") {
                return Ok(Some("cherryPick".into()));
            }
            if line.starts_with("revert ") {
                return Ok(Some("revert".into()));
            }
        }
    }
    Ok(None)
}

pub fn repository(path: &str, limit: usize) -> Result<Repository, String> {
    let root = root(path)?;
    let limit = limit.clamp(50, 5000);
    let has_head = run(&root, &["rev-parse", "--verify", "HEAD"], None).is_ok();
    let branch = run(&root, &["symbolic-ref", "--short", "HEAD"], None)
        .unwrap_or_else(|_| "HEAD destacado".into())
        .trim()
        .to_owned();
    let refs = run(
        &root,
        &[
            "for-each-ref",
            "--format=%(refname:short)%00%(HEAD)%00%(upstream:short)%00%(refname)",
            "refs/heads/",
            "refs/remotes/",
        ],
        None,
    )?;
    let branches = refs
        .lines()
        .filter_map(|line| {
            let f: Vec<_> = line.split('\0').collect();
            (f.len() == 4).then(|| Branch {
                name: f[0].into(),
                current: f[1] == "*",
                upstream: f[2].into(),
                remote: f[3].starts_with("refs/remotes/"),
            })
        })
        .collect();
    let files = parse_status(&run(
        &root,
        &["status", "--porcelain=v1", "-z", "--untracked-files=all"],
        None,
    )?);
    let mut commits = Vec::new();
    if has_head {
        let count = format!("--max-count={}", limit + 1);
        let log = run(
            &root,
            &[
                "log",
                "--all",
                "HEAD",
                "--topo-order",
                &count,
                "--format=%H%x00%P%x00%an%x00%aI%x00%s%x00%D",
                "-z",
            ],
            None,
        )?;
        let fields: Vec<_> = log.split('\0').collect();
        for f in fields.chunks_exact(6) {
            commits.push(Commit {
                hash: f[0].into(),
                parents: f[1].split_whitespace().map(str::to_owned).collect(),
                author: f[2].into(),
                date: f[3].into(),
                subject: f[4].into(),
                refs: f[5].into(),
            });
        }
    }
    let has_more = commits.len() > limit;
    commits.truncate(limit);
    let upstream = run(&root, &["rev-parse", "--abbrev-ref", "@{upstream}"], None)
        .ok()
        .map(|value| value.trim().to_owned());
    let head_detached = run(&root, &["symbolic-ref", "-q", "HEAD"], None).is_err();
    let counts = run(
        &root,
        &["rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
        None,
    )
    .unwrap_or_default();
    let mut counts = counts.split_whitespace().map(|s| s.parse().unwrap_or(0));
    Ok(Repository {
        path: root.to_string_lossy().into(),
        name: root
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into(),
        branch,
        branches,
        commits,
        files,
        remotes: run(&root, &["remote"], None)?
            .lines()
            .map(str::to_owned)
            .collect(),
        ahead: counts.next().unwrap_or(0),
        behind: counts.next().unwrap_or(0),
        has_more,
        upstream,
        operation: operation(&root)?,
        head_detached,
    })
}
pub fn changes(path: &str, commit: Option<&str>) -> Result<Vec<FileChange>, String> {
    let root = root(path)?;
    let Some(commit) = commit else {
        return Ok(parse_status(&run(
            &root,
            &["status", "--porcelain=v1", "-z", "--untracked-files=all"],
            None,
        )?));
    };
    let hash = revision(&root, commit)?;
    let output = run(
        &root,
        &[
            "show",
            "--format=",
            "--first-parent",
            "--diff-merges=first-parent",
            "--name-status",
            "--no-renames",
            "-z",
            &hash,
        ],
        None,
    )?;
    let fields: Vec<_> = output.split('\0').collect();
    Ok(fields
        .chunks_exact(2)
        .map(|f| FileChange {
            path: f[1].into(),
            original_path: None,
            index: f[0].trim().into(),
            worktree: " ".into(),
            conflict: false,
        })
        .collect())
}
pub fn diff(path: &str, file: &str, staged: bool, commit: Option<&str>) -> Result<String, String> {
    file_path(file)?;
    let root = root(path)?;
    if let Some(commit) = commit {
        let hash = revision(&root, commit)?;
        return run(
            &root,
            &[
                "show",
                "--format=",
                "--first-parent",
                "--diff-merges=first-parent",
                "--no-ext-diff",
                "--no-textconv",
                "--no-renames",
                &hash,
                "--",
                file,
            ],
            None,
        );
    }
    let status = parse_status(&run(
        &root,
        &[
            "status",
            "--porcelain=v1",
            "-z",
            "--untracked-files=all",
            "--",
            file,
        ],
        None,
    )?);
    if status.iter().any(|f| f.index == "?") {
        let full = root.join(file);
        let meta = std::fs::symlink_metadata(&full).map_err(|e| e.to_string())?;
        if !meta.file_type().is_file() {
            return Ok("Arquivo especial ou link simbólico. Prévia indisponível.".into());
        }
        if meta.len() > 1024 * 1024 {
            return Ok("Arquivo maior que 1 MB. Prévia indisponível.".into());
        }
        let bytes = std::fs::read(full).map_err(|e| e.to_string())?;
        if bytes.contains(&0) {
            return Ok("Arquivo binário. Prévia indisponível.".into());
        }
        let text = String::from_utf8_lossy(&bytes);
        return Ok(format!(
            "diff --git a/{file} b/{file}\nnew file\n--- /dev/null\n+++ b/{file}\n@@ -0,0 +1,{} @@\n{}",
            text.lines().count(),
            text.lines()
                .map(|line| format!("+{line}\n"))
                .collect::<String>()
        ));
    }
    let mut args = vec![
        "diff",
        "--no-ext-diff",
        "--no-textconv",
        "--no-renames",
        "--no-color",
        "--no-relative",
        "--src-prefix=a/",
        "--dst-prefix=b/",
        "--unified=3",
    ];
    if staged {
        args.push("--cached");
    }
    args.extend(["--", file]);
    run_output(&root, &args, None, true)
}
#[derive(Deserialize, Debug)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum Action {
    Stage {
        files: Vec<String>,
    },
    Unstage {
        files: Vec<String>,
    },
    Commit {
        message: String,
    },
    Switch {
        branch: String,
    },
    CreateBranch {
        branch: String,
    },
    ApplyHunk {
        file: String,
        staged: bool,
        expected_diff: String,
        hunk: usize,
    },
    Fetch,
    Pull,
    Push,
}
fn apply_hunk(
    path: &str,
    file: &str,
    staged: bool,
    expected: &str,
    hunk: usize,
) -> Result<String, String> {
    file_path(file)?;
    let root = root(path)?;
    let status = parse_status(&run(
        &root,
        &["status", "--porcelain=v1", "-z", "--", file],
        None,
    )?);
    let eligible = status.iter().any(|f| {
        f.path == file
            && !f.conflict
            && f.original_path.is_none()
            && (if staged { &f.index } else { &f.worktree }) == "M"
    });
    if !eligible {
        return Err("hunkUnavailable".into());
    }
    let current = diff(path, file, staged, None)?;
    if current != expected {
        return Err("staleHunk".into());
    }
    // Build the patch only from Git's current output, never from caller-provided headers.
    let lines: Vec<_> = current.split_inclusive('\n').collect();
    let starts: Vec<_> = lines
        .iter()
        .enumerate()
        .filter_map(|(i, line)| line.starts_with("@@ ").then_some(i))
        .collect();
    let first = *starts.first().ok_or("hunkUnavailable")?;
    if lines[..first]
        .iter()
        .any(|line| line.starts_with("old mode ") || line.starts_with("new mode "))
        || !lines[..first].iter().any(|line| {
            line.starts_with("index ")
                && (line.trim_end().ends_with(" 100644") || line.trim_end().ends_with(" 100755"))
        })
    {
        return Err("hunkUnavailable".into());
    }
    let start = *starts.get(hunk).ok_or("hunkUnavailable")?;
    let end = starts.get(hunk + 1).copied().unwrap_or(lines.len());
    let patch = lines[..first].concat() + &lines[start..end].concat();
    let mut args = vec!["apply", "--cached", "--whitespace=nowarn"];
    if staged {
        args.push("--reverse");
    }
    // git apply checks and updates the index atomically; the working tree is untouched.
    args.push("-");
    run(&root, &args, Some(&patch))
}

pub fn operate(path: &str, action: Action) -> Result<String, String> {
    let root = root(path)?;
    match action {
        Action::ApplyHunk {
            file,
            staged,
            expected_diff,
            hunk,
        } => apply_hunk(path, &file, staged, &expected_diff, hunk),
        Action::Stage { files } | Action::Unstage { files } if files.is_empty() => {
            Err("Selecione um arquivo".into())
        }
        Action::Stage { files } => {
            for file in &files {
                file_path(file)?;
            }
            let mut args = vec!["add", "-A", "--"];
            args.extend(files.iter().map(String::as_str));
            run(&root, &args, None)
        }
        Action::Unstage { files } => {
            for file in &files {
                file_path(file)?;
            }
            let has_head = run(&root, &["rev-parse", "--verify", "HEAD"], None).is_ok();
            let mut args = if has_head {
                vec!["reset", "-q", "HEAD", "--"]
            } else {
                vec!["rm", "--cached", "--ignore-unmatch", "--"]
            };
            args.extend(files.iter().map(String::as_str));
            run(&root, &args, None)
        }
        Action::Commit { message } => {
            if message.trim().is_empty() {
                return Err("Escreva uma mensagem para o commit".into());
            }
            if message.len() > 64 * 1024 {
                return Err("Mensagem muito longa".into());
            }
            let conflicts = parse_status(&run(&root, &["status", "--porcelain=v1", "-z"], None)?);
            if conflicts.iter().any(|f| f.conflict) {
                return Err(
                    "Resolva os conflitos e adicione os arquivos antes de fazer commit.".into(),
                );
            }
            if matches!(
                operation(&root)?.as_deref(),
                Some("rebase" | "cherryPick" | "revert" | "am")
            ) {
                return Err("finishOperation".into());
            }
            run(&root, &["commit", "-F", "-"], Some(&message))
        }
        Action::Switch { branch } => {
            if operation(&root)?.is_some() {
                return Err("finishOperation".into());
            }
            run(&root, &["check-ref-format", "--branch", &branch], None)?;
            run(&root, &["switch", "--end-of-options", &branch], None)
        }
        Action::CreateBranch { branch } => {
            if operation(&root)?.is_some() {
                return Err("finishOperation".into());
            }
            run(&root, &["check-ref-format", "--branch", &branch], None)?;
            run(&root, &["switch", "-c", &branch], None)
        }
        Action::Fetch => run(&root, &["fetch", "--all"], None),
        Action::Pull => {
            if operation(&root)?.is_some() {
                return Err("finishOperation".into());
            }
            if run(&root, &["rev-parse", "--abbrev-ref", "@{upstream}"], None).is_err() {
                return Err("missingUpstream".into());
            }
            run(&root, &["pull", "--ff-only"], None)
        }
        Action::Push => {
            if run(&root, &["rev-parse", "--abbrev-ref", "@{upstream}"], None).is_ok() {
                return run(&root, &["push"], None);
            }
            let branch = run(&root, &["symbolic-ref", "--short", "HEAD"], None)?;
            let remotes = run(&root, &["remote"], None)?;
            let remote = if remotes.lines().any(|r| r == "origin") {
                "origin"
            } else if remotes.lines().count() == 1 {
                remotes.lines().next().unwrap()
            } else {
                return Err(
                    "Sem upstream. Configure o destino da branch no Git antes de enviar.".into(),
                );
            };
            run(
                &root,
                &["push", "--set-upstream", "--", remote, branch.trim()],
                None,
            )
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;
    fn setup() -> TempDir {
        let dir = tempfile::tempdir().unwrap();
        run(dir.path(), &["init", "-b", "main"], None).unwrap();
        run(dir.path(), &["config", "user.name", "Gitloom Test"], None).unwrap();
        run(
            dir.path(),
            &["config", "user.email", "gitloom@example.invalid"],
            None,
        )
        .unwrap();
        run(dir.path(), &["config", "commit.gpgsign", "false"], None).unwrap();
        dir
    }
    fn path(dir: &TempDir) -> &str {
        dir.path().to_str().unwrap()
    }
    fn write(dir: &TempDir, file: &str, contents: &str) {
        std::fs::write(dir.path().join(file), contents).unwrap();
    }
    fn stage(dir: &TempDir, files: &[&str]) {
        operate(
            path(dir),
            Action::Stage {
                files: files.iter().map(|s| s.to_string()).collect(),
            },
        )
        .unwrap();
    }
    fn commit(dir: &TempDir, message: &str) {
        operate(
            path(dir),
            Action::Commit {
                message: message.into(),
            },
        )
        .unwrap();
    }
    #[test]
    fn full_workflow_and_unborn_unstage_preserve_worktree() {
        let dir = setup();
        write(&dir, "olá file.txt", "hello\n");
        let repo = repository(path(&dir), 100).unwrap();
        assert_eq!(repo.branch, "main");
        assert!(repo.commits.is_empty());
        assert_eq!(repo.files[0].index, "?");
        assert!(
            diff(path(&dir), "olá file.txt", false, None)
                .unwrap()
                .contains("+hello")
        );
        stage(&dir, &["olá file.txt"]);
        operate(
            path(&dir),
            Action::Unstage {
                files: vec!["olá file.txt".into()],
            },
        )
        .unwrap();
        assert_eq!(
            std::fs::read_to_string(dir.path().join("olá file.txt")).unwrap(),
            "hello\n"
        );
        stage(&dir, &["olá file.txt"]);
        commit(&dir, "Primeiro commit com acento");
        let repo = repository(path(&dir), 100).unwrap();
        assert_eq!(repo.commits.len(), 1);
        assert!(repo.files.is_empty());
        assert_eq!(repo.commits[0].subject, "Primeiro commit com acento");
        assert_eq!(
            changes(path(&dir), Some(&repo.commits[0].hash)).unwrap()[0].path,
            "olá file.txt"
        );
        assert!(
            diff(
                path(&dir),
                "olá file.txt",
                false,
                Some(&repo.commits[0].hash)
            )
            .unwrap()
            .contains("+hello")
        );
        write(&dir, "olá file.txt", "hello\nsecond\n");
        stage(&dir, &["olá file.txt"]);
        write(&dir, "olá file.txt", "hello\nsecond\nthird\n");
        let repo = repository(path(&dir), 100).unwrap();
        assert_eq!(repo.files[0].index, "M");
        assert_eq!(repo.files[0].worktree, "M");
        assert!(
            diff(path(&dir), "olá file.txt", true, None)
                .unwrap()
                .contains("+second")
        );
        assert!(
            !diff(path(&dir), "olá file.txt", true, None)
                .unwrap()
                .contains("+third")
        );
        assert!(
            diff(path(&dir), "olá file.txt", false, None)
                .unwrap()
                .contains("+third")
        );
        operate(
            path(&dir),
            Action::Unstage {
                files: vec!["olá file.txt".into()],
            },
        )
        .unwrap();
        assert!(
            std::fs::read_to_string(dir.path().join("olá file.txt"))
                .unwrap()
                .contains("third")
        );
    }
    #[test]
    fn literal_paths_rename_delete_and_branch_switch() {
        let dir = setup();
        write(&dir, "[abc].txt", "one\n");
        write(&dir, "a.txt", "two\n");
        stage(&dir, &["[abc].txt"]);
        let repo = repository(path(&dir), 100).unwrap();
        assert_eq!(repo.files.iter().filter(|f| f.index == "A").count(), 1);
        commit(&dir, "literal path");
        std::fs::rename(dir.path().join("[abc].txt"), dir.path().join("renamed.txt")).unwrap();
        stage(&dir, &["[abc].txt", "renamed.txt"]);
        let repo = repository(path(&dir), 100).unwrap();
        let rename = repo.files.iter().find(|f| f.path == "renamed.txt").unwrap();
        assert_eq!(rename.index, "R");
        assert_eq!(rename.original_path.as_deref(), Some("[abc].txt"));
        operate(
            path(&dir),
            Action::Unstage {
                files: vec!["[abc].txt".into(), "renamed.txt".into()],
            },
        )
        .unwrap();
        assert!(dir.path().join("renamed.txt").exists());
        stage(&dir, &["[abc].txt", "renamed.txt"]);
        commit(&dir, "rename");
        operate(
            path(&dir),
            Action::CreateBranch {
                branch: "feature/test".into(),
            },
        )
        .unwrap();
        assert_eq!(repository(path(&dir), 100).unwrap().branch, "feature/test");
        operate(
            path(&dir),
            Action::Switch {
                branch: "main".into(),
            },
        )
        .unwrap();
        assert_eq!(repository(path(&dir), 100).unwrap().branch, "main");
        std::fs::remove_file(dir.path().join("renamed.txt")).unwrap();
        stage(&dir, &["renamed.txt"]);
        assert!(
            repository(path(&dir), 100)
                .unwrap()
                .files
                .iter()
                .any(|f| f.index == "D")
        );
        assert!(diff(path(&dir), "../outside", false, None).is_err());
        assert!(
            operate(
                path(&dir),
                Action::CreateBranch {
                    branch: "--orphan".into()
                }
            )
            .is_err()
        );
    }
    #[test]
    fn merge_history_and_conflicts() {
        let dir = setup();
        write(&dir, "a.txt", "base\n");
        stage(&dir, &["a.txt"]);
        commit(&dir, "base");
        operate(
            path(&dir),
            Action::CreateBranch {
                branch: "feature".into(),
            },
        )
        .unwrap();
        write(&dir, "a.txt", "feature\n");
        stage(&dir, &["a.txt"]);
        commit(&dir, "feature");
        operate(
            path(&dir),
            Action::Switch {
                branch: "main".into(),
            },
        )
        .unwrap();
        write(&dir, "b.txt", "main\n");
        stage(&dir, &["b.txt"]);
        commit(&dir, "main");
        run(
            dir.path(),
            &["merge", "--no-ff", "feature", "-m", "merge"],
            None,
        )
        .unwrap();
        let repo = repository(path(&dir), 100).unwrap();
        assert_eq!(repo.commits[0].parents.len(), 2);
        let files = changes(path(&dir), Some(&repo.commits[0].hash)).unwrap();
        assert_eq!(files[0].path, "a.txt");
        assert!(
            diff(path(&dir), "a.txt", false, Some(&repo.commits[0].hash))
                .unwrap()
                .contains("+feature")
        );
        operate(
            path(&dir),
            Action::CreateBranch {
                branch: "conflict".into(),
            },
        )
        .unwrap();
        write(&dir, "a.txt", "other\n");
        stage(&dir, &["a.txt"]);
        commit(&dir, "other");
        operate(
            path(&dir),
            Action::Switch {
                branch: "main".into(),
            },
        )
        .unwrap();
        write(&dir, "a.txt", "different\n");
        stage(&dir, &["a.txt"]);
        commit(&dir, "different");
        assert!(run(dir.path(), &["merge", "conflict"], None).is_err());
        assert!(repository(path(&dir), 100).unwrap().files[0].conflict);
        assert!(
            operate(
                path(&dir),
                Action::Commit {
                    message: "blocked".into()
                }
            )
            .unwrap_err()
            .contains("conflitos")
        );
    }
    #[test]
    fn remote_push_fetch_pull_and_divergence() {
        let origin = tempfile::tempdir().unwrap();
        run(origin.path(), &["init", "--bare", "-b", "main"], None).unwrap();
        let first = setup();
        write(&first, "a.txt", "one\n");
        stage(&first, &["a.txt"]);
        commit(&first, "one");
        run(
            first.path(),
            &["remote", "add", "origin", path(&origin)],
            None,
        )
        .unwrap();
        operate(path(&first), Action::Push).unwrap();
        let second = setup();
        run(
            second.path(),
            &["remote", "add", "origin", path(&origin)],
            None,
        )
        .unwrap();
        operate(path(&second), Action::Fetch).unwrap();
        run(
            second.path(),
            &["switch", "-C", "main", "--track", "origin/main"],
            None,
        )
        .unwrap();
        write(&first, "a.txt", "two\n");
        stage(&first, &["a.txt"]);
        commit(&first, "two");
        operate(path(&first), Action::Push).unwrap();
        operate(path(&second), Action::Fetch).unwrap();
        assert_eq!(repository(path(&second), 100).unwrap().behind, 1);
        operate(path(&second), Action::Pull).unwrap();
        assert_eq!(
            std::fs::read_to_string(second.path().join("a.txt")).unwrap(),
            "two\n"
        );
        write(&first, "a.txt", "three\n");
        stage(&first, &["a.txt"]);
        commit(&first, "three");
        operate(path(&first), Action::Push).unwrap();
        write(&second, "b.txt", "divergent\n");
        stage(&second, &["b.txt"]);
        commit(&second, "divergent");
        let head = run(second.path(), &["rev-parse", "HEAD"], None).unwrap();
        assert!(operate(path(&second), Action::Pull).is_err());
        assert_eq!(
            run(second.path(), &["rev-parse", "HEAD"], None).unwrap(),
            head
        );
    }
    fn separated_changes() -> (TempDir, String) {
        let dir = setup();
        let original = (1..=40).map(|n| format!("line {n}\n")).collect::<String>();
        write(&dir, "space [a].txt", &original);
        stage(&dir, &["space [a].txt"]);
        commit(&dir, "base");
        let modified = original
            .replace("line 2\n", "first change\nextra line\n")
            .replace("line 30\n", "second change\n");
        write(&dir, "space [a].txt", &modified);
        (dir, modified)
    }

    #[test]
    fn partial_stage_and_reverse_preserve_other_hunks_and_worktree() {
        let (dir, modified) = separated_changes();
        let patch = diff(path(&dir), "space [a].txt", false, None).unwrap();
        assert_eq!(patch.lines().filter(|l| l.starts_with("@@ ")).count(), 2);
        apply_hunk(path(&dir), "space [a].txt", false, &patch, 1).unwrap();
        let cached = diff(path(&dir), "space [a].txt", true, None).unwrap();
        assert!(cached.contains("+second change"));
        assert!(!cached.contains("+first change"));
        let unstaged = diff(path(&dir), "space [a].txt", false, None).unwrap();
        assert!(unstaged.contains("+first change"));
        assert!(!unstaged.contains("+second change"));
        apply_hunk(path(&dir), "space [a].txt", false, &unstaged, 0).unwrap();
        let cached = diff(path(&dir), "space [a].txt", true, None).unwrap();
        apply_hunk(path(&dir), "space [a].txt", true, &cached, 1).unwrap();
        let cached = diff(path(&dir), "space [a].txt", true, None).unwrap();
        assert!(cached.contains("+first change"));
        assert!(!cached.contains("+second change"));
        assert_eq!(
            std::fs::read_to_string(dir.path().join("space [a].txt")).unwrap(),
            modified
        );
    }

    #[test]
    fn rejects_stale_invalid_and_forged_hunks_without_changing_index() {
        let (dir, modified) = separated_changes();
        let patch = diff(path(&dir), "space [a].txt", false, None).unwrap();
        write(&dir, "space [a].txt", &(modified + "external edit\n"));
        assert_eq!(
            apply_hunk(path(&dir), "space [a].txt", false, &patch, 0).unwrap_err(),
            "staleHunk"
        );
        let fresh = diff(path(&dir), "space [a].txt", false, None).unwrap();
        assert!(apply_hunk(path(&dir), "space [a].txt", false, &fresh, 999).is_err());
        assert!(
            apply_hunk(
                path(&dir),
                "space [a].txt",
                false,
                &fresh.replace("space", "outside"),
                0
            )
            .is_err()
        );
        assert!(apply_hunk(path(&dir), "../outside", false, &fresh, 0).is_err());
        assert!(
            diff(path(&dir), "space [a].txt", true, None)
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn unsupported_hunks_and_non_utf8_diff_are_rejected() {
        let (dir, _) = separated_changes();
        write(&dir, "new.txt", "new\n");
        let new = diff(path(&dir), "new.txt", false, None).unwrap();
        assert_eq!(
            apply_hunk(path(&dir), "new.txt", false, &new, 0).unwrap_err(),
            "hunkUnavailable"
        );
        std::fs::write(dir.path().join("space [a].txt"), b"bad \xff\n").unwrap();
        assert_eq!(
            diff(path(&dir), "space [a].txt", false, None).unwrap_err(),
            "nonUtf8Diff"
        );
    }

    #[test]
    fn operation_states_and_upstream_are_reported_and_guarded() {
        let (dir, _) = separated_changes();
        let repo = repository(path(&dir), 100).unwrap();
        assert!(repo.upstream.is_none());
        assert!(repo.operation.is_none());
        assert!(!repo.head_detached);
        let head = run(dir.path(), &["rev-parse", "HEAD"], None).unwrap();
        for (marker, expected) in [
            ("MERGE_HEAD", "merge"),
            ("CHERRY_PICK_HEAD", "cherryPick"),
            ("REVERT_HEAD", "revert"),
        ] {
            let marker_path = dir.path().join(".git").join(marker);
            std::fs::write(&marker_path, &head).unwrap();
            assert_eq!(
                repository(path(&dir), 100).unwrap().operation.as_deref(),
                Some(expected)
            );
            assert_eq!(
                operate(
                    path(&dir),
                    Action::Switch {
                        branch: "main".into()
                    }
                )
                .unwrap_err(),
                "finishOperation"
            );
            assert_eq!(
                operate(path(&dir), Action::Pull).unwrap_err(),
                "finishOperation"
            );
            if expected != "merge" {
                assert_eq!(
                    operate(
                        path(&dir),
                        Action::Commit {
                            message: "blocked".into()
                        }
                    )
                    .unwrap_err(),
                    "finishOperation"
                );
            }
            std::fs::remove_file(marker_path).unwrap();
        }
        std::fs::create_dir(dir.path().join(".git/rebase-merge")).unwrap();
        assert_eq!(operation(dir.path()).unwrap().as_deref(), Some("rebase"));
        std::fs::remove_dir(dir.path().join(".git/rebase-merge")).unwrap();
        assert_eq!(
            operate(path(&dir), Action::Pull).unwrap_err(),
            "missingUpstream"
        );
    }
    #[test]
    fn hunk_action_deserializes_frontend_payload_and_runs_real_git() {
        let (dir, _) = separated_changes();
        let patch = diff(path(&dir), "space [a].txt", false, None).unwrap();
        let action: Action = serde_json::from_value(serde_json::json!({
            "kind": "applyHunk", "file": "space [a].txt", "staged": false,
            "expectedDiff": patch, "hunk": 0
        }))
        .unwrap();
        operate(path(&dir), action).unwrap();
        let staged = diff(path(&dir), "space [a].txt", true, None).unwrap();
        assert!(staged.contains("+first change"));
        assert!(!staged.contains("+second change"));
    }

    #[test]
    fn hunk_handles_missing_final_newline_and_external_index_changes() {
        let dir = setup();
        write(&dir, "a.txt", "before");
        stage(&dir, &["a.txt"]);
        commit(&dir, "base");
        write(&dir, "a.txt", "after");
        let patch = diff(path(&dir), "a.txt", false, None).unwrap();
        assert!(patch.contains("No newline at end of file"));
        apply_hunk(path(&dir), "a.txt", false, &patch, 0).unwrap();
        let cached = diff(path(&dir), "a.txt", true, None).unwrap();
        write(&dir, "a.txt", "external change");
        stage(&dir, &["a.txt"]);
        assert_eq!(
            apply_hunk(path(&dir), "a.txt", true, &cached, 0).unwrap_err(),
            "staleHunk"
        );
        let fresh = diff(path(&dir), "a.txt", true, None).unwrap();
        apply_hunk(path(&dir), "a.txt", true, &fresh, 0).unwrap();
        assert!(diff(path(&dir), "a.txt", true, None).unwrap().is_empty());
        assert_eq!(
            std::fs::read_to_string(dir.path().join("a.txt")).unwrap(),
            "external change"
        );
    }

    #[test]
    fn operation_detection_supports_linked_worktrees_and_sequence_states() {
        let (dir, _) = separated_changes();
        let linked_parent = tempfile::tempdir().unwrap();
        let linked = linked_parent.path().join("linked");
        run(
            dir.path(),
            &["worktree", "add", "-b", "linked", linked.to_str().unwrap()],
            None,
        )
        .unwrap();
        let metadata = run(&linked, &["rev-parse", "--absolute-git-dir"], None).unwrap();
        let metadata = Path::new(metadata.trim());
        std::fs::create_dir(metadata.join("rebase-apply")).unwrap();
        std::fs::write(metadata.join("rebase-apply/applying"), "").unwrap();
        assert_eq!(operation(&linked).unwrap().as_deref(), Some("am"));
        assert!(operation(dir.path()).unwrap().is_none());
        std::fs::remove_dir_all(metadata.join("rebase-apply")).unwrap();
        std::fs::create_dir(metadata.join("sequencer")).unwrap();
        for (line, expected) in [
            ("pick abcdef commit", "cherryPick"),
            ("revert abcdef commit", "revert"),
        ] {
            std::fs::write(metadata.join("sequencer/todo"), line).unwrap();
            assert_eq!(operation(&linked).unwrap().as_deref(), Some(expected));
        }
    }
}
