import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import {
  applyReanchor,
  applySuggestion,
  createThread,
  evaluateSidecarRelevance,
  evaluateThreadRelevance,
  MdCollabError,
  proposeSuggestion,
  readSidecarFile,
  rejectSuggestion,
  reopenThread,
  reanchor,
  reply,
  resolveThread,
  serializeDeterministic,
  sidecarPathForDocument,
  validateSidecarResult,
  writeSidecarFileAtomic,
} from './index.js';
import type { Anchor, Author, RelevanceContext, Sidecar, Suggestion, Thread, TimelineKind } from './types.js';

export interface CliRunResult {
  exitCode: number;
  payload: Record<string, unknown>;
}

interface CliIo {
  stdout: (line: string) => void;
  stderr: (line: string) => void;
}

const defaultIo: CliIo = {
  stdout: (line) => console.log(line),
  stderr: (line) => console.error(line),
};

const CODE_TO_EXIT: Record<string, number> = {
  OK: 0,
  SCHEMA_INVALID: 2,
  ANCHOR_INVALID: 2,
  AUTHOR_INVALID: 2,
  BAD_ARGS: 2,
  THREAD_NOT_FOUND: 3,
  MESSAGE_NOT_FOUND: 3,
  SUGGESTION_NOT_FOUND: 3,
  WRITE_CONFLICT: 4,
  ID_CONFLICT: 4,
  PRECHECK_BLOCKED: 5,
  INTERNAL: 10,
};

const parseArgs = (argv: string[]) => {
  const positionals: string[] = [];
  const flags = new Map<string, string | boolean>();

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }

    const [rawKey, inlineValue] = token.slice(2).split('=', 2);
    if (!rawKey) continue;

    if (inlineValue !== undefined) {
      flags.set(rawKey, inlineValue);
      continue;
    }

    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      flags.set(rawKey, next);
      i += 1;
    } else {
      flags.set(rawKey, true);
    }
  }

  return { positionals, flags };
};

const asString = (value: string | boolean | undefined): string | undefined => (typeof value === 'string' ? value : undefined);

const asBoolean = (value: string | boolean | undefined): boolean => {
  if (value === true) return true;
  if (typeof value === 'string') return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
  return false;
};

const fail = (
  command: string,
  code: string,
  message: string,
  details?: Record<string, unknown>,
  data?: Record<string, unknown>,
): CliRunResult => ({
  exitCode: CODE_TO_EXIT[code] ?? 10,
  payload: {
    ok: false,
    command,
    code,
    message,
    details: details ?? {},
    ...(data ? { data } : {}),
  },
});

const ok = (command: string, data: Record<string, unknown>, audit?: Record<string, unknown>): CliRunResult => ({
  exitCode: 0,
  payload: {
    ok: true,
    command,
    code: 'OK',
    data,
    audit: audit ?? {},
  },
});

const readFileUtf8 = (path: string): string => readFileSync(path, 'utf8');

const revForBytes = (bytes: string): string => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

const revForSidecarFile = (sidecarPath: string): string => revForBytes(readFileUtf8(sidecarPath));

const resolvePaths = (flags: Map<string, string | boolean>): { docPath: string; sidecarPath: string } => {
  const docPath = asString(flags.get('doc'));
  const explicitSidecar = asString(flags.get('sidecar'));

  if (!docPath && !explicitSidecar) {
    throw new MdCollabError('BAD_ARGS', 'must provide --doc or --sidecar');
  }

  if (!docPath && explicitSidecar) {
    return { docPath: explicitSidecar.replace(/\.comments\.json$/i, '.md'), sidecarPath: explicitSidecar };
  }

  if (!docPath) {
    throw new MdCollabError('BAD_ARGS', 'doc path missing');
  }

  return { docPath, sidecarPath: explicitSidecar ?? sidecarPathForDocument(docPath) };
};

const readAuthor = (flags: Map<string, string | boolean>): Author => {
  const author_id = asString(flags.get('author-id'));
  const author_label = asString(flags.get('author-label'));
  const verifiedRaw = asString(flags.get('author-verified'));
  const verified =
    verifiedRaw === undefined || verifiedRaw === 'null' ? null : ['true', '1', 'yes', 'on'].includes(verifiedRaw.toLowerCase());

  if (!author_id || !author_label) {
    throw new MdCollabError('BAD_ARGS', 'author fields are required: --author-id --author-label [--author-verified]');
  }

  return { author_id, author_label, verified };
};

const parseIntFlag = (flags: Map<string, string | boolean>, name: string): number => {
  const value = asString(flags.get(name));
  if (!value) throw new MdCollabError('BAD_ARGS', `missing --${name}`);
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) throw new MdCollabError('BAD_ARGS', `invalid --${name}`);
  return parsed;
};

const sidecarCounts = (sidecar: Sidecar) => {
  const counts = {
    total: sidecar.threads.length,
    open: 0,
    resolved: 0,
    active: 0,
    outdated: 0,
    orphaned: 0,
  };

  for (const thread of sidecar.threads) {
    if (thread.status === 'open') counts.open += 1;
    if (thread.status === 'resolved') counts.resolved += 1;
    if (thread.relevance_state === 'active') counts.active += 1;
    if (thread.relevance_state === 'outdated') counts.outdated += 1;
    if (thread.relevance_state === 'orphaned') counts.orphaned += 1;
  }

  return counts;
};

const maybeEmitAudit = (
  flags: Map<string, string | boolean>,
  event: Record<string, unknown>,
  io: CliIo,
): void => {
  const mode = asString(flags.get('audit')) ?? 'none';
  if (mode === 'none') return;
  const line = `${JSON.stringify(event)}\n`;
  if (mode === 'stdout') {
    io.stdout(line.trimEnd());
    return;
  }
  if (mode === 'file') {
    const path = asString(flags.get('audit-file'));
    if (!path) throw new MdCollabError('BAD_ARGS', '--audit=file requires --audit-file <path>');
    appendFileSync(path, line, 'utf8');
    return;
  }
  throw new MdCollabError('BAD_ARGS', 'invalid --audit mode; use none|stdout|file');
};

const baseMutationData = (args: {
  command: string;
  flags: Map<string, string | boolean>;
  sidecarPath: string;
  ids?: Record<string, string | undefined>;
  io: CliIo;
  revBefore: string;
  revAfter: string;
  dryRun: boolean;
  changed: boolean;
}): Record<string, unknown> => {
  const audit = {
    op_id: asString(args.flags.get('op-id')) ?? randomUUID(),
    op_type: args.command,
    timestamp: new Date().toISOString(),
    actor_id: asString(args.flags.get('author-id')),
    actor_label: asString(args.flags.get('author-label')),
    sidecar_path: args.sidecarPath,
    input_ids: args.ids ?? {},
    rev_before: args.revBefore,
    rev_after: args.revAfter,
    dry_run: args.dryRun,
    status: 'OK',
  };

  maybeEmitAudit(args.flags, audit, args.io);

  return {
    changed: args.changed,
    dry_run: args.dryRun,
    sidecar_path: args.sidecarPath,
    rev_before: args.revBefore,
    rev_after: args.revAfter,
    conflict_check: asString(args.flags.get('expect-rev')) ? 'enforced' : 'skipped',
  };
};

const guardRev = (sidecarPath: string, flags: Map<string, string | boolean>, revBefore: string): void => {
  const expected = asString(flags.get('expect-rev'));
  if (!expected) return;
  if (expected !== revBefore) {
    throw new MdCollabError('WRITE_CONFLICT', 'expected rev does not match');
  }
};

const validateStrict = (sidecar: Sidecar): string[] => {
  const errors: string[] = [];
  for (const thread of sidecar.threads) {
    if (!thread.messages || thread.messages.length === 0) {
      errors.push(`/threads/${thread.thread_id}/messages must not be empty`);
    }
    for (const suggestion of thread.suggestions ?? []) {
      if (suggestion.status === 'proposed' && suggestion.decision) {
        errors.push(`/threads/${thread.thread_id}/suggestions/${suggestion.suggestion_id} proposed suggestions must not include decision`);
      }
      if (suggestion.status !== 'proposed' && !suggestion.decision) {
        errors.push(`/threads/${thread.thread_id}/suggestions/${suggestion.suggestion_id} non-proposed suggestions must include decision`);
      }
    }
  }
  return errors;
};

const resolveThreadById = (sidecar: Sidecar, threadId: string): Thread => {
  const thread = sidecar.threads.find((t) => t.thread_id === threadId);
  if (!thread) throw new MdCollabError('THREAD_NOT_FOUND', `thread not found: ${threadId}`);
  return thread;
};

const resolveSuggestionById = (thread: Thread, suggestionId: string): Suggestion => {
  const suggestion = (thread.suggestions ?? []).find((s) => s.suggestion_id === suggestionId);
  if (!suggestion) throw new MdCollabError('SUGGESTION_NOT_FOUND', `suggestion not found: ${suggestionId}`);
  return suggestion;
};

const readSidecarOrThrow = (path: string): Sidecar => {
  if (!existsSync(path)) throw new MdCollabError('BAD_ARGS', `sidecar not found: ${path}`);
  return readSidecarFile(path);
};

const applyMutation = (args: {
  command: string;
  flags: Map<string, string | boolean>;
  sidecarPath: string;
  docPath: string;
  io: CliIo;
  ids?: Record<string, string | undefined>;
  mutate: (current: Sidecar) => Sidecar;
  overrideChanged?: (before: Sidecar, after: Sidecar) => boolean;
}): CliRunResult => {
  const sidecar = readSidecarOrThrow(args.sidecarPath);
  const revBefore = revForSidecarFile(args.sidecarPath);
  guardRev(args.sidecarPath, args.flags, revBefore);

  const next = args.mutate(sidecar);
  const validation = validateSidecarResult(next);
  if (!validation.valid) {
    throw new MdCollabError('SCHEMA_INVALID', `result sidecar invalid: ${validation.errors.join('; ')}`);
  }

  const dryRun = asBoolean(args.flags.get('dry-run'));
  const serializedNext = serializeDeterministic(next);
  const revAfter = revForBytes(serializedNext);
  const changed = args.overrideChanged ? args.overrideChanged(sidecar, next) : serializeDeterministic(sidecar) !== serializedNext;

  if (!dryRun && changed) {
    writeSidecarFileAtomic(args.sidecarPath, next, args.docPath);
  }

  const data = {
    ...baseMutationData({
      command: args.command,
      flags: args.flags,
      sidecarPath: args.sidecarPath,
      io: args.io,
      ids: args.ids,
      revBefore,
      revAfter,
      dryRun,
      changed,
    }),
  };

  return ok(args.command, data);
};

const extractTextByAnchor = (docText: string, anchor: Anchor): { text: string | null; viable: boolean } => {
  const start = anchor.primary.start?.offset_utf16;
  const end = anchor.primary.end?.offset_utf16;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end >= docText.length) {
    return { text: null, viable: false };
  }
  return { text: docText.slice(start, end + 1), viable: true };
};

const hashText = (value: string): string => `sha256:${createHash('sha256').update(value).digest('hex')}`;

export const runCli = (argv: string[], io: CliIo = defaultIo): CliRunResult => {
  const { positionals, flags } = parseArgs(argv);
  const command = positionals.slice(0, 2).join(' ');

  try {
    if (command === 'inspect status') {
      const { sidecarPath } = resolvePaths(flags);
      const sidecar = readSidecarOrThrow(sidecarPath);
      const rev = revForSidecarFile(sidecarPath);
      const threadId = asString(flags.get('thread-id'));
      const openOnly = asBoolean(flags.get('open-only'));
      const resolvedOnly = asBoolean(flags.get('resolved-only'));

      let threads = sidecar.threads;
      if (threadId) threads = threads.filter((t) => t.thread_id === threadId);
      if (openOnly) threads = threads.filter((t) => t.status === 'open');
      if (resolvedOnly) threads = threads.filter((t) => t.status === 'resolved');

      return ok(command, {
        sidecar: {
          schema_version: sidecar.schema_version,
          path: sidecarPath,
        },
        revision_token: rev,
        counts: sidecarCounts(sidecar),
        threads: threads.map((thread) => ({
          id: thread.thread_id,
          status: thread.status,
          relevance: thread.relevance_state,
          updated_at: thread.updated_at,
        })),
      });
    }

    if (command === 'validate sidecar') {
      const { sidecarPath } = resolvePaths(flags);
      const raw = readFileUtf8(sidecarPath);
      const strict = asBoolean(flags.get('strict'));

      let parsedUnknown: unknown;
      try {
        parsedUnknown = JSON.parse(raw);
      } catch {
        return fail(command, 'SCHEMA_INVALID', 'invalid json', {}, { valid: false, strict, errors: ['invalid json'] });
      }

      const schemaValidation = validateSidecarResult(parsedUnknown);
      const strictErrors = schemaValidation.valid && strict ? validateStrict(parsedUnknown as Sidecar) : [];
      const errors = [...schemaValidation.errors, ...strictErrors];

      if (errors.length > 0) {
        return fail(command, 'SCHEMA_INVALID', strictErrors.length > 0 ? 'strict validation failed' : 'schema validation failed', {}, {
          valid: false,
          strict,
          errors,
        });
      }

      return ok(command, { valid: true, strict, errors: [] });
    }

    if (command === 'comment add') {
      const { sidecarPath, docPath } = resolvePaths(flags);
      const text = readFileUtf8(docPath);
      const body = asString(flags.get('body'));
      if (!body) throw new MdCollabError('BAD_ARGS', 'missing --body');
      const startOffsetUtf16 = parseIntFlag(flags, 'start');
      const endOffsetUtf16 = parseIntFlag(flags, 'end');
      const author = readAuthor(flags);

      return applyMutation({
        command,
        flags,
        sidecarPath,
        docPath,
        io,
        mutate: (current) =>
          createThread({
            sidecar: current,
            text,
            startOffsetUtf16,
            endOffsetUtf16,
            body,
            author,
          }),
      });
    }

    if (command === 'comment reply') {
      const { sidecarPath, docPath } = resolvePaths(flags);
      const threadId = asString(flags.get('thread-id'));
      const body = asString(flags.get('body'));
      if (!threadId || !body) throw new MdCollabError('BAD_ARGS', 'missing --thread-id or --body');
      const author = readAuthor(flags);
      return applyMutation({
        command,
        flags,
        sidecarPath,
        docPath,
        io,
        ids: { thread_id: threadId },
        mutate: (current) => reply({ sidecar: current, threadId, body, author }),
      });
    }

    if (command === 'thread resolve' || command === 'thread reopen') {
      const { sidecarPath, docPath } = resolvePaths(flags);
      const threadId = asString(flags.get('thread-id'));
      if (!threadId) throw new MdCollabError('BAD_ARGS', 'missing --thread-id');
      const author = readAuthor(flags);
      return applyMutation({
        command,
        flags,
        sidecarPath,
        docPath,
        io,
        ids: { thread_id: threadId },
        overrideChanged: (before, after) => {
          const oldState = resolveThreadById(before, threadId).status;
          const newState = resolveThreadById(after, threadId).status;
          return oldState !== newState;
        },
        mutate: (current) => {
          const existing = resolveThreadById(current, threadId);
          if (command.endsWith('resolve') && existing.status === 'resolved') return current;
          if (command.endsWith('reopen') && existing.status === 'open') return current;
          return command.endsWith('resolve')
            ? resolveThread({ sidecar: current, threadId, actor: author })
            : reopenThread({ sidecar: current, threadId, actor: author });
        },
      });
    }

    if (command === 'thread reanchor') {
      const { sidecarPath, docPath } = resolvePaths(flags);
      const threadId = asString(flags.get('thread-id'));
      if (!threadId) throw new MdCollabError('BAD_ARGS', 'missing --thread-id');
      const docText = readFileUtf8(docPath);
      return applyMutation({
        command,
        flags,
        sidecarPath,
        docPath,
        io,
        ids: { thread_id: threadId },
        mutate: (current) => {
          const thread = resolveThreadById(current, threadId);
          const result = reanchor(docText, thread.anchor);
          return applyReanchor(current, threadId, result);
        },
      });
    }

    if (command === 'thread refresh-relevance') {
      const { sidecarPath, docPath } = resolvePaths(flags);
      const timelineKind = (asString(flags.get('timeline-kind')) as TimelineKind | undefined) ?? 'workspace';
      const context: RelevanceContext = {
        timelineKind,
        documentText: existsSync(docPath) ? readFileUtf8(docPath) : undefined,
        fileExists: existsSync(docPath),
        workspaceSnapshotId: asString(flags.get('workspace-snapshot-id')),
        workspaceFileHash: asString(flags.get('workspace-file-hash')),
        workspaceFileMtime: asString(flags.get('workspace-file-mtime')),
        workspaceActorSessionId: asString(flags.get('workspace-actor-session-id')),
        currentPath: asString(flags.get('current-path')),
        headCommit: asString(flags.get('head-commit')),
        baseCommit: asString(flags.get('base-commit')),
        headBlobSha: asString(flags.get('head-blob-sha')),
        baseBlobSha: asString(flags.get('base-blob-sha')),
        gitAvailable: !asBoolean(flags.get('git-unavailable')),
      };
      const threadId = asString(flags.get('thread-id'));

      return applyMutation({
        command,
        flags,
        sidecarPath,
        docPath,
        io,
        ids: { thread_id: threadId },
        mutate: (current) => {
          if (threadId) {
            const next = structuredClone(current);
            const thread = resolveThreadById(next, threadId);
            const updated = evaluateThreadRelevance(thread, context);
            const index = next.threads.findIndex((t) => t.thread_id === threadId);
            next.threads[index] = updated;
            return next;
          }
          return evaluateSidecarRelevance(current, context);
        },
      });
    }

    if (command === 'suggestion propose') {
      const { sidecarPath, docPath } = resolvePaths(flags);
      const threadId = asString(flags.get('thread-id'));
      const replacementText = asString(flags.get('replacement-text'));
      if (!threadId || replacementText === undefined) throw new MdCollabError('BAD_ARGS', 'missing --thread-id or --replacement-text');
      const author = readAuthor(flags);
      const start = parseIntFlag(flags, 'start');
      const end = parseIntFlag(flags, 'end');
      const docText = readFileUtf8(docPath);
      const quote = docText.slice(start, end + 1);
      const beforeTextHash = asString(flags.get('before-text-hash')) ?? hashText(quote);

      return applyMutation({
        command,
        flags,
        sidecarPath,
        docPath,
        io,
        ids: { thread_id: threadId },
        mutate: (current) => {
          const thread = resolveThreadById(current, threadId);
          const anchor = thread.anchor;
          return proposeSuggestion({
            sidecar: current,
            threadId,
            author,
            beforeTextHash,
            replacementText,
            anchor,
          });
        },
      });
    }

    if (command === 'suggestion apply') {
      const { sidecarPath, docPath } = resolvePaths(flags);
      const threadId = asString(flags.get('thread-id'));
      const suggestionId = asString(flags.get('suggestion-id'));
      if (!threadId || !suggestionId) throw new MdCollabError('BAD_ARGS', 'missing --thread-id or --suggestion-id');
      const actor = readAuthor(flags);

      const current = readSidecarOrThrow(sidecarPath);
      const thread = resolveThreadById(current, threadId);
      const suggestion = resolveSuggestionById(thread, suggestionId);
      if (suggestion.status !== 'proposed') {
        throw new MdCollabError('PRECHECK_BLOCKED', 'suggestion is not in proposed status');
      }

      const docText = readFileUtf8(docPath);
      const extracted = extractTextByAnchor(docText, suggestion.proposed_edit.anchor);
      const currentHash = extracted.text === null ? null : hashText(extracted.text);
      const expectedHash = suggestion.proposed_edit.before_text_hash;
      const hashMatch = currentHash === expectedHash;
      const viable = extracted.viable;
      const decision = !viable ? 'block' : hashMatch ? 'apply' : 'obsolete';

      const preflight = {
        thread_id: threadId,
        suggestion_id: suggestionId,
        current_text_hash: currentHash,
        expected_before_text_hash: expectedHash,
        anchor_viable: viable,
        replacement_range: viable
          ? {
              start: suggestion.proposed_edit.anchor.primary.start.offset_utf16,
              end: suggestion.proposed_edit.anchor.primary.end.offset_utf16,
            }
          : null,
        decision,
      };

      if (decision === 'block') {
        return fail(command, 'PRECHECK_BLOCKED', 'suggestion apply blocked by preflight', { preflight }, { preflight, decision });
      }

      return applyMutation({
        command,
        flags,
        sidecarPath,
        docPath,
        io,
        ids: { thread_id: threadId, suggestion_id: suggestionId },
        mutate: (sidecar) => applySuggestion({ sidecar, threadId, suggestionId, actor, beforeText: extracted.text ?? undefined }),
      });
    }

    if (command === 'suggestion reject') {
      const { sidecarPath, docPath } = resolvePaths(flags);
      const threadId = asString(flags.get('thread-id'));
      const suggestionId = asString(flags.get('suggestion-id'));
      if (!threadId || !suggestionId) throw new MdCollabError('BAD_ARGS', 'missing --thread-id or --suggestion-id');
      const actor = readAuthor(flags);

      return applyMutation({
        command,
        flags,
        sidecarPath,
        docPath,
        io,
        ids: { thread_id: threadId, suggestion_id: suggestionId },
        overrideChanged: (before, after) => {
          const oldStatus = resolveSuggestionById(resolveThreadById(before, threadId), suggestionId).status;
          const newStatus = resolveSuggestionById(resolveThreadById(after, threadId), suggestionId).status;
          return oldStatus !== newStatus;
        },
        mutate: (sidecar) => {
          const existing = resolveSuggestionById(resolveThreadById(sidecar, threadId), suggestionId);
          if (existing.status === 'rejected') return sidecar;
          return rejectSuggestion({ sidecar, threadId, suggestionId, actor });
        },
      });
    }

    return fail(command || '(none)', 'BAD_ARGS', 'unknown command');
  } catch (err) {
    if (err instanceof MdCollabError) {
      return fail(command || '(none)', err.code, err.message);
    }
    const message = err instanceof Error ? err.message : String(err);
    return fail(command || '(none)', 'INTERNAL', message);
  }
};

export const main = (argv = process.argv.slice(2), io: CliIo = defaultIo): number => {
  const result = runCli(argv, io);
  const output = JSON.stringify(result.payload);
  if (result.exitCode === 0) {
    io.stdout(output);
  } else {
    io.stderr(output);
  }
  return result.exitCode;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main();
}
