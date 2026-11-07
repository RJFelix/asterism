import * as NodeCrypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as PubSub from "effect/PubSub";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";

export const CanvasNodeStage = Schema.Literals([
  "note",
  "brainstorm",
  "refine",
  "design",
  "implement",
]);
export type CanvasNodeStage = typeof CanvasNodeStage.Type;

export const AsterismEffectRequest = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("surface.mutate"),
    nodeId: Schema.String,
    instruction: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal("surface.speculate"),
    nodeId: Schema.String,
    prompt: Schema.String,
    count: Schema.Number,
  }),
  Schema.Struct({
    type: Schema.Literal("train.advance"),
    nodeId: Schema.String,
    targetStage: CanvasNodeStage,
    instruction: Schema.optional(Schema.String),
  }),
  Schema.Struct({
    type: Schema.Literal("harness.run-turn"),
    nodeId: Schema.String,
    provider: Schema.String,
    model: Schema.String,
    prompt: Schema.String,
    cwd: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal("peer.delegate"),
    nodeId: Schema.String,
    environmentId: Schema.String,
    task: Schema.String,
  }),
]);
export type AsterismEffectRequest = typeof AsterismEffectRequest.Type;

export interface StoredAsterismEvent {
  readonly sequence: number;
  readonly commandId: string;
  readonly streamId: string;
  readonly eventType: string;
  readonly payload: unknown;
  readonly createdAt: string;
}

export interface OutboxEffectRecord {
  readonly id: string;
  readonly commandId: string;
  readonly streamId: string;
  readonly request: AsterismEffectRequest;
  readonly status: "pending" | "running" | "succeeded" | "failed" | "cancelled";
  readonly attemptCount: number;
  readonly leaseOwner: string | null;
  readonly availableAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastError: string | null;
}

export interface CommandCommitInput {
  readonly commandId: string;
  readonly streamId: string;
  readonly commandType: string;
  readonly events: ReadonlyArray<{
    readonly eventType: string;
    readonly payload: unknown;
  }>;
  readonly effects?: ReadonlyArray<{
    readonly id?: string;
    readonly request: AsterismEffectRequest;
  }>;
}

export interface CommandCommitResult {
  readonly committed: boolean;
  readonly commandId: string;
  readonly resultSequence: number;
  readonly storedEvents: ReadonlyArray<StoredAsterismEvent>;
  readonly enqueuedEffectIds: ReadonlyArray<string>;
}

export class AsterismOutboxError extends Schema.TaggedError<AsterismOutboxError>()(
  "AsterismOutboxError",
  {
    operation: Schema.String,
    detail: Schema.String,
  },
) {}

export interface AsterismEventSinkShape {
  readonly commitCommand: (
    input: CommandCommitInput,
  ) => Effect.Effect<CommandCommitResult, AsterismOutboxError>;
  readonly claimNextEffect: (
    workerId: string,
  ) => Effect.Effect<Option.Option<OutboxEffectRecord>, AsterismOutboxError>;
  readonly completeEffect: (input: {
    readonly effectId: string;
    readonly workerId: string;
  }) => Effect.Effect<boolean, AsterismOutboxError>;
  readonly failEffect: (input: {
    readonly effectId: string;
    readonly workerId: string;
    readonly error: string;
    readonly retryDelayMs?: number;
  }) => Effect.Effect<boolean, AsterismOutboxError>;
  readonly reconcileAfterProcessLoss: Effect.Effect<
    { readonly requeued: number },
    AsterismOutboxError
  >;
  readonly readEventsAfter: (
    afterSequence?: number,
  ) => Effect.Effect<ReadonlyArray<StoredAsterismEvent>, AsterismOutboxError>;
  readonly liveEvents: Stream.Stream<StoredAsterismEvent>;
  readonly awaitOutboxAvailable: Effect.Effect<void>;
}

export class AsterismEventSink extends Context.Service<
  AsterismEventSink,
  AsterismEventSinkShape
>()("@asterism/core/AsterismEventSink") {}

const decodeEffectRequest = Schema.decodeUnknownSync(
  Schema.fromJsonString(AsterismEffectRequest),
);
const encodeEffectRequest = Schema.encodeSync(
  Schema.fromJsonString(AsterismEffectRequest),
);

export const makeSqliteEventSink = (dbPath: string) =>
  Effect.gen(function* () {
    const db = new DatabaseSync(dbPath);
    db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;

      CREATE TABLE IF NOT EXISTS asterism_command_receipts (
        command_id TEXT PRIMARY KEY,
        stream_id TEXT NOT NULL,
        command_type TEXT NOT NULL,
        result_sequence INTEGER NOT NULL,
        status TEXT NOT NULL,
        accepted_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS asterism_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        command_id TEXT NOT NULL,
        stream_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS asterism_effect_outbox (
        effect_id TEXT PRIMARY KEY,
        command_id TEXT NOT NULL,
        stream_id TEXT NOT NULL,
        effect_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        lease_owner TEXT,
        available_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        last_error TEXT
      );
    `);

    const publishLane = yield* Semaphore.make(1);
    const eventPubSub = yield* PubSub.unbounded<StoredAsterismEvent>();
    const outboxWake = yield* Queue.dropping<void>(64);

    const notifyOutbox = (count = 1) =>
      Queue.offerAll(
        outboxWake,
        Array.from({ length: Math.min(32, Math.max(1, count)) }, () => undefined),
      ).pipe(Effect.asVoid);

    const commitCommand: AsterismEventSinkShape["commitCommand"] = (input) =>
      publishLane.withPermits(1)(
        Effect.gen(function* () {
          const now = new Date().toISOString();
          let committed = false;
          let resultSequence = 0;
          const storedEvents: Array<StoredAsterismEvent> = [];
          const enqueuedEffectIds: Array<string> = [];

          try {
            db.exec("BEGIN IMMEDIATE");
            const existing = db
              .prepare(
                "SELECT result_sequence FROM asterism_command_receipts WHERE command_id = ?",
              )
              .get(input.commandId) as { result_sequence: number } | undefined;

            if (existing !== undefined) {
              const rows = db
                .prepare(
                  "SELECT sequence, command_id, stream_id, event_type, payload_json, created_at FROM asterism_events WHERE command_id = ? ORDER BY sequence ASC",
                )
                .all(input.commandId) as Array<{
                sequence: number;
                command_id: string;
                stream_id: string;
                event_type: string;
                payload_json: string;
                created_at: string;
              }>;
              db.exec("COMMIT");
              return {
                committed: false,
                commandId: input.commandId,
                resultSequence: existing.result_sequence,
                storedEvents: rows.map((r) => ({
                  sequence: r.sequence,
                  commandId: r.command_id,
                  streamId: r.stream_id,
                  eventType: r.event_type,
                  payload: JSON.parse(r.payload_json),
                  createdAt: r.created_at,
                })),
                enqueuedEffectIds: [],
              };
            }

            const insertEvent = db.prepare(`
              INSERT INTO asterism_events (command_id, stream_id, event_type, payload_json, created_at)
              VALUES (?, ?, ?, ?, ?)
              RETURNING sequence
            `);

            for (const ev of input.events) {
              const row = insertEvent.get(
                input.commandId,
                input.streamId,
                ev.eventType,
                JSON.stringify(ev.payload),
                now,
              ) as { sequence: number };
              resultSequence = row.sequence;
              storedEvents.push({
                sequence: row.sequence,
                commandId: input.commandId,
                streamId: input.streamId,
                eventType: ev.eventType,
                payload: ev.payload,
                createdAt: now,
              });
            }

            const insertOutbox = db.prepare(`
              INSERT INTO asterism_effect_outbox (
                effect_id, command_id, stream_id, effect_type, payload_json,
                status, attempt_count, available_at, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?)
            `);

            for (const eff of input.effects ?? []) {
              const effectId = eff.id ?? `eff-${NodeCrypto.randomUUID()}`;
              insertOutbox.run(
                effectId,
                input.commandId,
                input.streamId,
                eff.request.type,
                encodeEffectRequest(eff.request),
                now,
                now,
                now,
              );
              enqueuedEffectIds.push(effectId);
            }

            db.prepare(`
              INSERT INTO asterism_command_receipts (
                command_id, stream_id, command_type, result_sequence, status, accepted_at
              ) VALUES (?, ?, ?, ?, 'accepted', ?)
            `).run(
              input.commandId,
              input.streamId,
              input.commandType,
              resultSequence,
              now,
            );

            db.exec("COMMIT");
            committed = true;
          } catch (cause) {
            try {
              db.exec("ROLLBACK");
            } catch {
              // ignore rollback error
            }
            return yield* new AsterismOutboxError({
              operation: "commitCommand",
              detail: cause instanceof Error ? cause.message : String(cause),
            });
          }

          if (committed) {
            if (storedEvents.length > 0) {
              yield* PubSub.publishAll(eventPubSub, storedEvents);
            }
            if (enqueuedEffectIds.length > 0) {
              yield* notifyOutbox(enqueuedEffectIds.length);
            }
          }

          return {
            committed,
            commandId: input.commandId,
            resultSequence,
            storedEvents,
            enqueuedEffectIds,
          };
        }),
      );

    const claimNextEffect: AsterismEventSinkShape["claimNextEffect"] = (workerId) =>
      Effect.try({
        try: () => {
          const now = new Date().toISOString();
          // Per-stream FIFO ordering: do not claim a later effect for a stream that already has a running or earlier pending effect.
          const row = db
            .prepare(`
              UPDATE asterism_effect_outbox
              SET status = 'running',
                  attempt_count = attempt_count + 1,
                  lease_owner = ?,
                  updated_at = ?
              WHERE effect_id = (
                SELECT candidate.effect_id
                FROM asterism_effect_outbox AS candidate
                WHERE candidate.status = 'pending'
                  AND candidate.available_at <= ?
                  AND NOT EXISTS (
                    SELECT 1
                    FROM asterism_effect_outbox AS active
                    WHERE active.stream_id = candidate.stream_id
                      AND (
                        active.status = 'running'
                        OR (active.status = 'pending' AND active.rowid < candidate.rowid)
                      )
                  )
                ORDER BY candidate.available_at ASC, candidate.rowid ASC
                LIMIT 1
              )
              RETURNING *
            `)
            .get(workerId, now, now) as
            | {
                effect_id: string;
                command_id: string;
                stream_id: string;
                payload_json: string;
                status: OutboxEffectRecord["status"];
                attempt_count: number;
                lease_owner: string | null;
                available_at: string;
                created_at: string;
                updated_at: string;
                last_error: string | null;
              }
            | undefined;

          if (row === undefined) return Option.none();
          return Option.some({
            id: row.effect_id,
            commandId: row.command_id,
            streamId: row.stream_id,
            request: decodeEffectRequest(row.payload_json),
            status: row.status,
            attemptCount: row.attempt_count,
            leaseOwner: row.lease_owner,
            availableAt: row.available_at,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            lastError: row.last_error,
          });
        },
        catch: (cause) =>
          new AsterismOutboxError({
            operation: "claimNextEffect",
            detail: cause instanceof Error ? cause.message : String(cause),
          }),
      });

    const completeEffect: AsterismEventSinkShape["completeEffect"] = ({
      effectId,
      workerId,
    }) =>
      Effect.gen(function* () {
        const now = new Date().toISOString();
        const changes = db
          .prepare(`
            UPDATE asterism_effect_outbox
            SET status = 'succeeded',
                lease_owner = NULL,
                completed_at = ?,
                updated_at = ?,
                last_error = NULL
            WHERE effect_id = ? AND status = 'running' AND lease_owner = ?
          `)
          .run(now, now, effectId, workerId).changes;
        if (changes > 0) yield* notifyOutbox(1);
        return changes > 0;
      });

    const failEffect: AsterismEventSinkShape["failEffect"] = ({
      effectId,
      workerId,
      error,
      retryDelayMs,
    }) =>
      Effect.gen(function* () {
        const now = new Date();
        const nowIso = now.toISOString();
        if (retryDelayMs !== undefined) {
          const nextAvailable = new Date(
            now.getTime() + Math.max(0, retryDelayMs),
          ).toISOString();
          const changes = db
            .prepare(`
              UPDATE asterism_effect_outbox
              SET status = 'pending',
                  lease_owner = NULL,
                  available_at = ?,
                  updated_at = ?,
                  last_error = ?
              WHERE effect_id = ? AND status = 'running' AND lease_owner = ?
            `)
            .run(nextAvailable, nowIso, error, effectId, workerId).changes;
          if (changes > 0) yield* notifyOutbox(1);
          return changes > 0;
        }
        const changes = db
          .prepare(`
            UPDATE asterism_effect_outbox
            SET status = 'failed',
                lease_owner = NULL,
                completed_at = ?,
                updated_at = ?,
                last_error = ?
            WHERE effect_id = ? AND status = 'running' AND lease_owner = ?
          `)
          .run(nowIso, nowIso, error, effectId, workerId).changes;
        if (changes > 0) yield* notifyOutbox(1);
        return changes > 0;
      });

    const reconcileAfterProcessLoss: AsterismEventSinkShape["reconcileAfterProcessLoss"] =
      Effect.sync(() => {
        const now = new Date().toISOString();
        const res = db
          .prepare(`
            UPDATE asterism_effect_outbox
            SET status = 'pending',
                lease_owner = NULL,
                available_at = ?,
                updated_at = ?,
                last_error = 'Requeued after server restart'
            WHERE status = 'running'
          `)
          .run(now, now);
        return { requeued: Number(res.changes) };
      });

    const readEventsAfter: AsterismEventSinkShape["readEventsAfter"] = (
      afterSequence = 0,
    ) =>
      Effect.sync(() => {
        const rows = db
          .prepare(`
            SELECT sequence, command_id, stream_id, event_type, payload_json, created_at
            FROM asterism_events
            WHERE sequence > ?
            ORDER BY sequence ASC
          `)
          .all(afterSequence) as Array<{
          sequence: number;
          command_id: string;
          stream_id: string;
          event_type: string;
          payload_json: string;
          created_at: string;
        }>;
        return rows.map((r) => ({
          sequence: r.sequence,
          commandId: r.command_id,
          streamId: r.stream_id,
          eventType: r.event_type,
          payload: JSON.parse(r.payload_json),
          createdAt: r.created_at,
        }));
      });

    return AsterismEventSink.of({
      commitCommand,
      claimNextEffect,
      completeEffect,
      failEffect,
      reconcileAfterProcessLoss,
      readEventsAfter,
      liveEvents: Stream.fromPubSub(eventPubSub),
      awaitOutboxAvailable: Queue.take(outboxWake),
    });
  });

export const layerSqliteEventSink = (dbPath: string) =>
  Layer.effect(AsterismEventSink, makeSqliteEventSink(dbPath));
