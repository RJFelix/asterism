import * as path from "node:path";
import * as crypto from "node:crypto";
import * as Effect from "effect/Effect";

export const ATTACHMENT_ID_THREAD_SEGMENT_MAX_CHARS = 80;
export const toSafeThreadAttachmentSegment = (segment: string): string | null =>
  segment.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, ATTACHMENT_ID_THREAD_SEGMENT_MAX_CHARS) || null;
export const createAttachmentId = () => crypto.randomUUID();
export const resolveAttachmentPathById = (input: { attachmentsDir: string; attachmentId: string }) =>
  path.join(input.attachmentsDir, input.attachmentId);
export const resolveAttachmentPath = (input: { attachmentsDir: string; attachment: { id: string } }) =>
  path.join(input.attachmentsDir, input.attachment.id);
export const sweepStalePendingAttachments = () => Effect.void;
