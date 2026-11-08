import * as fs from "node:fs";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { ServerSettings } from "@t3tools/contracts";
import * as ProviderHost from "@t3tools/provider-core/server/ProviderHost";
import * as McpProviderSessions from "@t3tools/provider-core/server/McpProviderSessions";
import type * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";

const execFileAsync = promisify(execFile);

export type ProviderEvent = ProviderAdapter.ProviderAdapterV2Event;
export type ProviderAdapterService = ProviderAdapter.ProviderAdapterV2["Service"];

export interface AsterismHostConfig {
  readonly cwd: string;
  readonly baseDir: string;
}

/**
 * Provides a standalone Effect `Layer` for `@t3tools/provider-core`'s `ProviderHost`
 * and `McpProviderSessions` so any extracted T3 `ProviderDriver` or `ProviderAdapterV2`
 * can run directly inside Asterism without `apps/server`.
 */
export const makeAsterismProviderHostLayer = (config: AsterismHostConfig) => {
  const stateDir = path.join(config.baseDir, "state");
  const providerStatusCacheDir = path.join(stateDir, "provider-status");
  const attachmentsDir = path.join(stateDir, "attachments");

  for (const dir of [stateDir, providerStatusCacheDir, attachmentsDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const defaultSettings = Schema.decodeSync(ServerSettings)({});

  const hostLayer = Layer.effect(
    ProviderHost.ProviderHost,
    Effect.gen(function* () {
      const settingsRef = yield* Ref.make<ServerSettings>(defaultSettings);
      const credentialsMap = yield* Ref.make(new Map<string, Uint8Array>());

      return ProviderHost.ProviderHost.of({
        paths: {
          cwd: config.cwd,
          baseDir: config.baseDir,
          stateDir,
          providerStatusCacheDir,
          attachmentsDir,
        },
        settings: {
          get: Ref.get(settingsRef),
          withSnapshot: (use) => Ref.get(settingsRef).pipe(Effect.flatMap(use)),
          changes: Stream.empty,
          subscribe: Effect.succeed(Stream.empty),
        },
        shouldRunBackgroundWork: () => Effect.succeed(true),
        resolveAttachmentPath: (attachment) =>
          path.join(attachmentsDir, attachment.id),
        credentials: (namespace, bindingId) =>
          Effect.succeed({
            binding: { owner: "t3" as const, key: `${namespace}:${bindingId}` },
            get: Ref.get(credentialsMap).pipe(
              Effect.map((m) =>
                Option.fromUndefinedOr(m.get(`${namespace}:${bindingId}`)),
              ),
            ),
            set: (bytes) =>
              Ref.update(credentialsMap, (m) =>
                new Map(m).set(`${namespace}:${bindingId}`, bytes),
              ),
            remove: Ref.update(credentialsMap, (m) => {
              const next = new Map(m);
              next.delete(`${namespace}:${bindingId}`);
              return next;
            }),
          }),
      });
    }),
  );

  return Layer.mergeAll(hostLayer, McpProviderSessions.layer);
};

export interface WorktreeSandbox {
  readonly branchName: string;
  readonly worktreePath: string;
  readonly baseCommit: string;
}

/**
 * Creates an isolated Git worktree for a speculative or `IMPLEMENT`-stage node
 * on the Innovation Train so parallel agents can edit and run checks without colliding.
 */
export const createIsolatedWorktree = (input: {
  readonly repoRoot: string;
  readonly worktreesDir: string;
  readonly nodeId: string;
}): Effect.Effect<WorktreeSandbox, Error> =>
  Effect.tryPromise({
    try: async () => {
      fs.mkdirSync(input.worktreesDir, { recursive: true });
      const safeSlug = input.nodeId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 48);
      const branchName = `asterism/${safeSlug}-${Date.now().toString(36)}`;
      const worktreePath = path.join(
        input.worktreesDir,
        `${safeSlug}-${Date.now().toString(36)}`,
      );

      const { stdout: headSha } = await execFileAsync(
        "git",
        ["-C", input.repoRoot, "rev-parse", "--short", "HEAD"],
      );

      await execFileAsync("git", [
        "-C",
        input.repoRoot,
        "worktree",
        "add",
        "-b",
        branchName,
        worktreePath,
        "HEAD",
      ]);

      return {
        branchName,
        worktreePath,
        baseCommit: headSha.trim(),
      };
    },
    catch: (cause) =>
      cause instanceof Error ? cause : new Error(String(cause)),
  });

export const removeIsolatedWorktree = (input: {
  readonly repoRoot: string;
  readonly worktreePath: string;
  readonly branchName?: string;
}): Effect.Effect<void, never> =>
  Effect.tryPromise({
    try: async () => {
      await execFileAsync("git", [
        "-C",
        input.repoRoot,
        "worktree",
        "remove",
        "--force",
        input.worktreePath,
      ]).catch(() => {});
      if (input.branchName) {
        await execFileAsync("git", [
          "-C",
          input.repoRoot,
          "branch",
          "-D",
          input.branchName,
        ]).catch(() => {});
      }
    },
    catch: () => undefined,
  }).pipe(Effect.ignore);

export interface WorktreeDiffFile {
  readonly path: string;
  readonly status: string;
  readonly insertions: number;
  readonly deletions: number;
}

export interface WorktreeDiffSummary {
  readonly branchName: string;
  readonly headCommit: string;
  readonly changedFiles: ReadonlyArray<WorktreeDiffFile>;
  readonly insertions: number;
  readonly deletions: number;
  readonly statSummary: string;
  readonly patch: string;
}

/**
 * Inspects live Git status and unified diff inside an isolated worktree.
 * Marks untracked files with `git add -N` so newly created implementation files
 * appear in `git diff HEAD` and numstat counts prior to commit.
 */
export const inspectWorktreeDiff = (
  worktreePath: string,
): Effect.Effect<WorktreeDiffSummary, Error> =>
  Effect.tryPromise({
    try: async () => {
      if (!fs.existsSync(worktreePath)) {
        throw new Error(`Worktree path does not exist: ${worktreePath}`);
      }

      await execFileAsync("git", ["-C", worktreePath, "add", "-N", "."]).catch(
        () => {},
      );

      const [{ stdout: branchOut }, { stdout: headOut }, { stdout: statusOut }, { stdout: numstatOut }, { stdout: statOut }, { stdout: patchOut }] =
        await Promise.all([
          execFileAsync("git", [
            "-C",
            worktreePath,
            "rev-parse",
            "--abbrev-ref",
            "HEAD",
          ]),
          execFileAsync("git", [
            "-C",
            worktreePath,
            "rev-parse",
            "--short",
            "HEAD",
          ]),
          execFileAsync("git", ["-C", worktreePath, "status", "--porcelain"]),
          execFileAsync("git", ["-C", worktreePath, "diff", "--numstat", "HEAD"]),
          execFileAsync("git", ["-C", worktreePath, "diff", "--stat", "HEAD"]),
          execFileAsync("git", ["-C", worktreePath, "diff", "HEAD"]),
        ]);

      const statusByFile = new Map<string, string>();
      for (const line of statusOut.split("\n")) {
        if (line.length < 4) continue;
        const code = line.slice(0, 2).trim() || "M";
        const filePath = line.slice(3).trim();
        if (filePath) statusByFile.set(filePath, code);
      }

      const changedFiles: Array<WorktreeDiffFile> = [];
      let totalInsertions = 0;
      let totalDeletions = 0;

      for (const line of numstatOut.split("\n")) {
        if (!line.trim()) continue;
        const parts = line.split("\t");
        if (parts.length < 3) continue;
        const ins = Number.parseInt(parts[0], 10) || 0;
        const del = Number.parseInt(parts[1], 10) || 0;
        const filePath = parts[2].trim();
        totalInsertions += ins;
        totalDeletions += del;
        changedFiles.push({
          path: filePath,
          status: statusByFile.get(filePath) ?? "M",
          insertions: ins,
          deletions: del,
        });
      }

      return {
        branchName: branchOut.trim(),
        headCommit: headOut.trim(),
        changedFiles,
        insertions: totalInsertions,
        deletions: totalDeletions,
        statSummary: statOut.trim(),
        patch: patchOut.slice(0, 24_000),
      };
    },
    catch: (cause) =>
      cause instanceof Error ? cause : new Error(String(cause)),
  });

export interface WorktreeCommitResult {
  readonly committed: boolean;
  readonly commitSha: string;
  readonly branchName: string;
  readonly message: string;
}

export const commitWorktreeChanges = (input: {
  readonly worktreePath: string;
  readonly message: string;
}): Effect.Effect<WorktreeCommitResult, Error> =>
  Effect.tryPromise({
    try: async () => {
      await execFileAsync("git", ["-C", input.worktreePath, "add", "-A"]);
      const { stdout: statusOut } = await execFileAsync("git", [
        "-C",
        input.worktreePath,
        "status",
        "--porcelain",
      ]);

      let committed = false;
      if (statusOut.trim().length > 0) {
        await execFileAsync("git", [
          "-C",
          input.worktreePath,
          "-c",
          "user.name=Asterism Agent",
          "-c",
          "user.email=asterism@exe.xyz",
          "commit",
          "-m",
          input.message,
        ]);
        committed = true;
      }

      const [{ stdout: shaOut }, { stdout: branchOut }] = await Promise.all([
        execFileAsync("git", [
          "-C",
          input.worktreePath,
          "rev-parse",
          "--short",
          "HEAD",
        ]),
        execFileAsync("git", [
          "-C",
          input.worktreePath,
          "rev-parse",
          "--abbrev-ref",
          "HEAD",
        ]),
      ]);

      return {
        committed,
        commitSha: shaOut.trim(),
        branchName: branchOut.trim(),
        message: input.message,
      };
    },
    catch: (cause) =>
      cause instanceof Error ? cause : new Error(String(cause)),
  });

export interface WorktreeImplementationBundle {
  readonly moduleCode: string;
  readonly testCode: string;
  readonly surfaceHtml: string;
  readonly lineage: unknown;
}

export interface WorktreeImplementationResult {
  readonly moduleRelPath: string;
  readonly testRelPath: string;
  readonly surfaceRelPath: string;
  readonly testPassed: boolean;
  readonly testOutput: string;
  readonly diff: WorktreeDiffSummary;
}

/**
 * Materializes an `IMPLEMENT`-stage node's code, surface, and deterministic test suite
 * inside its isolated Git worktree, runs `node --test`, and returns the live diff + verification output.
 */
export const runWorktreeAgentImplementation = (input: {
  readonly worktreePath: string;
  readonly nodeId: string;
  readonly bundle: WorktreeImplementationBundle;
}): Effect.Effect<WorktreeImplementationResult, Error> =>
  Effect.tryPromise({
    try: async () => {
      const safeSlug = input.nodeId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 48);
      const implDir = path.join(input.worktreePath, "implementations", safeSlug);
      fs.mkdirSync(implDir, { recursive: true });

      const moduleRelPath = path.join("implementations", safeSlug, "index.mjs");
      const testRelPath = path.join("implementations", safeSlug, "verify.test.mjs");
      const surfaceRelPath = path.join("implementations", safeSlug, "surface.html");
      const lineageRelPath = path.join("implementations", safeSlug, "lineage.json");

      fs.writeFileSync(
        path.join(input.worktreePath, moduleRelPath),
        input.bundle.moduleCode,
        "utf8",
      );
      fs.writeFileSync(
        path.join(input.worktreePath, testRelPath),
        input.bundle.testCode,
        "utf8",
      );
      fs.writeFileSync(
        path.join(input.worktreePath, surfaceRelPath),
        input.bundle.surfaceHtml,
        "utf8",
      );
      fs.writeFileSync(
        path.join(input.worktreePath, lineageRelPath),
        JSON.stringify(input.bundle.lineage, null, 2),
        "utf8",
      );

      let testPassed = false;
      let testOutput = "";
      try {
        const { stdout, stderr } = await execFileAsync(
          process.execPath,
          ["--test", testRelPath],
          { cwd: input.worktreePath, timeout: 15_000 },
        );
        testPassed = true;
        testOutput = [stdout, stderr].filter(Boolean).join("\n").trim();
      } catch (err: any) {
        testPassed = false;
        testOutput = [err?.stdout, err?.stderr, err?.message]
          .filter(Boolean)
          .join("\n")
          .trim();
      }

      const diff = await Effect.runPromise(
        inspectWorktreeDiff(input.worktreePath),
      );

      return {
        moduleRelPath,
        testRelPath,
        surfaceRelPath,
        testPassed,
        testOutput: testOutput.slice(0, 8000),
        diff,
      };
    },
    catch: (cause) =>
      cause instanceof Error ? cause : new Error(String(cause)),
  });

export interface CliBinaryProbe {
  readonly id: string;
  readonly binary: string;
  readonly installed: boolean;
  readonly binaryPath: string | null;
}

export const probeAvailableHarnesses = (
  binaries: ReadonlyArray<{ readonly id: string; readonly binary: string }>,
): Effect.Effect<ReadonlyArray<CliBinaryProbe>, never> =>
  Effect.tryPromise({
    try: async () => {
      const extraPaths = [
        "/usr/local/bin",
        "/usr/bin",
        path.join(process.env.HOME || "/home/exedev", ".local", "bin"),
      ];
      const searchDirs = [
        ...(process.env.PATH || "").split(path.delimiter).filter(Boolean),
        ...extraPaths,
      ];

      return binaries.map(({ id, binary }) => {
        for (const dir of searchDirs) {
          const candidate = path.join(dir, binary);
          try {
            if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
              return { id, binary, installed: true, binaryPath: candidate };
            }
          } catch {
            // ignore
          }
        }
        return { id, binary, installed: false, binaryPath: null };
      });
    },
    catch: () => [],
  }).pipe(Effect.orElseSucceed(() => []));

