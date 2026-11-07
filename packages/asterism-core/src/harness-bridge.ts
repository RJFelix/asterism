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
