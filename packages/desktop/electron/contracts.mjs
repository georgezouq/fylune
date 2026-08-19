import { z } from "zod";

export const emptySchema = z.undefined().or(z.object({}).strict());
export const projectIdSchema = z.string().uuid();
export const relativePathSchema = z.string().min(1).max(4096);
export const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const projectRequestSchema = z.object({ projectId: projectIdSchema }).strict();
export const projectScanSchema = projectRequestSchema.extend({
  path: z.string().max(4096).optional().default(""),
  recursive: z.boolean().optional().default(false),
  documentsOnly: z.boolean().optional().default(false),
  folderPreviews: z.boolean().optional().default(false),
}).strict();
export const documentRequestSchema = z.object({
  projectId: projectIdSchema,
  path: relativePathSchema,
}).strict();
export const acceptExternalDocumentSchema = documentRequestSchema.extend({
  hash: hashSchema,
}).strict();
export const saveDocumentSchema = documentRequestSchema.extend({
  content: z.string().max(20 * 1024 * 1024),
  expectedHash: hashSchema.nullable().optional(),
}).strict();
export const workspaceFileMutationSchema = documentRequestSchema.extend({
  expectedMtimeMs: z.number().finite().nonnegative().optional(),
}).strict();
export const renameWorkspaceFileSchema = workspaceFileMutationSchema.extend({
  name: z.string().trim().min(1).max(255),
}).strict();
export const saveDraftSchema = documentRequestSchema.extend({
  content: z.string().max(20 * 1024 * 1024),
  baseHash: hashSchema.nullable().optional(),
}).strict();
export const importAssetSchema = z.object({
  projectId: projectIdSchema,
  documentPath: relativePathSchema,
}).strict();
export const importDroppedAssetSchema = importAssetSchema.extend({
  sourcePath: z.string().min(1).max(32768),
}).strict();
export const assetRequestSchema = documentRequestSchema;
export const workbookCellEditSchema = z.object({
  sheet: z.string().min(1).max(255),
  row: z.number().int().positive().max(1048576),
  column: z.number().int().positive().max(16384),
  input: z.string().max(32767).nullable(),
}).strict();
export const workbookStructureEditSchema = z.object({
  type: z.enum(["insertRow", "insertColumn"]),
  sheet: z.string().min(1).max(255),
  index: z.number().int().positive().max(1048576),
}).strict();
export const saveWorkbookSchema = documentRequestSchema.extend({
  edits: z.array(z.union([workbookCellEditSchema, workbookStructureEditSchema])).min(1).max(20000),
  expectedHash: hashSchema,
}).strict();
export const clipboardWriteTextSchema = z.object({
  text: z.string().max(32768),
}).strict();
export const previewSnapshotSchema = documentRequestSchema.extend({
  snapshotId: z.string().uuid(),
}).strict();
export const restoreSnapshotSchema = documentRequestSchema.extend({
  snapshotId: z.string().uuid(),
  expectedHash: hashSchema,
}).strict();
export const signInSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
}).strict();
export const registerSchema = signInSchema.extend({
  password: z.string().min(12).max(128),
}).strict();
const agentMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.string().max(100_000),
}).strict();
export const agentCompletionSchema = z.object({
  messages: z.array(agentMessageSchema).min(1).max(100),
  stream: z.boolean().optional().default(false),
  temperature: z.number().finite().min(0).max(2).optional(),
  max_tokens: z.number().int().min(1).max(32_000).optional(),
  tools: z.array(z.record(z.string(), z.unknown())).max(32).optional(),
}).strict();
