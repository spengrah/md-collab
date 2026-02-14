#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { execSync } from 'node:child_process';
import {
  applySuggestion,
  createThread,
  evaluateSidecarRelevance,
  parseSidecar,
  proposeSuggestion,
  rejectSuggestion,
} from '../dist/index.js';

const ARTIFACT_JSON = 'artifacts/acceptance/latest.json';
const ARTIFACT_SUMMARY = 'artifacts/acceptance/latest-summary.md';
const FIXED_TS = '2026-02-14T00:00:00.000Z';
const author = { author_id: 'u1', author_label: 'User 1', verified: null };

const sha256 = (v) => `sha256:${createHash('sha256').update(v).digest('hex')}`;
const baseSidecar = () => parseSidecar('{"schema_version":"0.1.0","document":{"path":"doc.md"},"threads":[]}');

const cases = [
  {
    id: 'ACPT-DMODEL-001',
    group: 'data-model-acceptance',
    smoke: false,
    run: () => {
      const valid = {
        schema_version: '0.1.0',
        document: { path: 'doc.md' },
        threads: [],
      };
      const parsed = parseSidecar(JSON.stringify(valid));
      if (parsed.schema_version !== '0.1.0') throw new Error('schema_version mismatch for valid sidecar');

      let threw = false;
      try {
        parseSidecar('{"schema_version":"0.1.0","document":{"path":"doc.md"}}');
      } catch (err) {
        threw = String(err?.code ?? '').includes('SCHEMA_INVALID') || String(err?.message ?? '').includes('SCHEMA_INVALID');
      }
      if (!threw) throw new Error('expected SCHEMA_INVALID for malformed sidecar shape');
    },
  },
  {
    id: 'ACPT-DMODEL-002',
    group: 'data-model-acceptance',
    smoke: false,
    run: () => {
      const legacy = {
        schema_version: '0.1.0',
        document: { path: 'legacy.md' },
        threads: [
          {
            thread_id: 'legacy-thread',
            status: 'open',
            anchor: {
              primary: {
                start: { line: 1, column: 1, offset_utf16: 0 },
                end: { line: 1, column: 5, offset_utf16: 4 },
              },
              fallback: {
                quote: 'hello',
                prefix: '',
                suffix: ' world',
                quote_hash: sha256('hello'),
                context_hash: sha256('hello world'),
              },
              anchor_confidence: 'high',
            },
            author,
            messages: [
              {
                message_id: 'legacy-msg',
                author,
                body: 'legacy body',
                created_at: FIXED_TS,
                edited_at: null,
              },
            ],
            created_at: FIXED_TS,
            updated_at: FIXED_TS,
          },
        ],
      };
      const parsed = parseSidecar(JSON.stringify(legacy));
      if (parsed.threads.length !== 1) throw new Error('legacy sidecar parse failed');
      if (parsed.threads[0].thread_id !== 'legacy-thread') throw new Error('legacy thread id mismatch');
    },
  },
  {
    id: 'ACPT-TIME-001',
    group: 'timeline-modes',
    smoke: true,
    run: () => {
      const s = createThread({
        sidecar: baseSidecar(),
        text: 'hello world',
        startOffsetUtf16: 0,
        endOffsetUtf16: 4,
        body: 'note',
        author,
        threadId: 't1',
        messageId: 'm1',
        timelineKind: 'workspace',
        workspaceSnapshotId: 'ws-1',
        now: FIXED_TS,
      });
      const wk = s.threads[0].thread_version_context?.kind;
      const g = createThread({
        sidecar: baseSidecar(),
        text: 'hello world',
        startOffsetUtf16: 0,
        endOffsetUtf16: 4,
        body: 'note',
        author,
        threadId: 't1',
        messageId: 'm1',
        timelineKind: 'git',
        baseCommit: 'a',
        headCommit: 'a',
        filePathAtCreate: 'doc.md',
        now: FIXED_TS,
      });
      const gt = g.threads[0].thread_version_context?.kind;
      const h = createThread({
        sidecar: baseSidecar(),
        text: 'hello world',
        startOffsetUtf16: 0,
        endOffsetUtf16: 4,
        body: 'note',
        author,
        threadId: 't1',
        messageId: 'm1',
        timelineKind: 'hybrid',
        workspaceSnapshotId: 'ws-1',
        baseCommit: 'a',
        headCommit: 'a',
        filePathAtCreate: 'doc.md',
        now: FIXED_TS,
      });
      const hy = h.threads[0].thread_version_context?.kind;
      if (wk !== 'workspace' || gt !== 'git' || hy !== 'hybrid') throw new Error(`unexpected kinds: ${wk}/${gt}/${hy}`);
    },
  },
  {
    id: 'ACPT-REL-001',
    group: 'relevance-behavior',
    smoke: true,
    run: () => {
      const created = createThread({
        sidecar: baseSidecar(),
        text: 'hello world',
        startOffsetUtf16: 0,
        endOffsetUtf16: 4,
        body: 'note',
        author,
        threadId: 't1',
        messageId: 'm1',
        timelineKind: 'workspace',
        workspaceSnapshotId: 'ws-1',
        workspaceFileHash: 'sha256:a',
        filePathAtCreate: 'doc.md',
        now: FIXED_TS,
      });
      const noWorkspace = evaluateSidecarRelevance(created, { timelineKind: 'workspace' }, FIXED_TS);
      const changed = evaluateSidecarRelevance(
        created,
        { timelineKind: 'workspace', workspaceSnapshotId: 'ws-2', workspaceFileHash: 'sha256:b', currentPath: 'doc.md' },
        FIXED_TS,
      );
      if (noWorkspace.threads[0].relevance_reason !== 'WORKSPACE_CONTEXT_UNAVAILABLE') throw new Error('missing no-workspace signal');
      if (changed.threads[0].relevance_reason !== 'CONTENT_CHANGED') throw new Error('missing content-changed signal');
    },
  },
  {
    id: 'ACPT-SUG-001',
    group: 'suggestion-mismatch-safety',
    smoke: true,
    run: () => {
      const created = createThread({
        sidecar: baseSidecar(),
        text: 'hello world',
        startOffsetUtf16: 0,
        endOffsetUtf16: 4,
        body: 'note',
        author,
        threadId: 't1',
        messageId: 'm1',
        now: FIXED_TS,
      });
      const proposed = proposeSuggestion({
        sidecar: created,
        threadId: 't1',
        suggestionId: 's1',
        author,
        anchor: created.threads[0].anchor,
        beforeTextHash: sha256('hello'),
        replacementText: 'HELLO',
        now: FIXED_TS,
      });
      const next = applySuggestion({
        sidecar: proposed,
        threadId: 't1',
        suggestionId: 's1',
        actor: author,
        beforeText: 'goodbye',
        now: FIXED_TS,
      });
      if (next.threads[0].suggestions?.[0].status !== 'obsolete') throw new Error('suggestion not marked obsolete');
      if (!next.threads[0].messages.at(-1)?.body.includes('obsolete')) throw new Error('no audit message for obsolete');
    },
  },
  {
    id: 'ACPT-SUG-002',
    group: 'suggestion-lifecycle',
    smoke: false,
    run: () => {
      const created = createThread({
        sidecar: baseSidecar(),
        text: 'hello world',
        startOffsetUtf16: 0,
        endOffsetUtf16: 4,
        body: 'note',
        author,
        threadId: 't1',
        messageId: 'm1',
        now: FIXED_TS,
      });
      const proposedApply = proposeSuggestion({
        sidecar: created,
        threadId: 't1',
        suggestionId: 's-apply',
        author,
        anchor: created.threads[0].anchor,
        beforeTextHash: sha256('hello'),
        replacementText: 'HELLO',
        now: FIXED_TS,
      });
      const applied = applySuggestion({
        sidecar: proposedApply,
        threadId: 't1',
        suggestionId: 's-apply',
        actor: author,
        beforeText: 'hello',
        now: FIXED_TS,
      });
      if (applied.threads[0].suggestions?.find((s) => s.suggestion_id === 's-apply')?.status !== 'applied') {
        throw new Error('suggestion apply state not recorded');
      }

      const proposedReject = proposeSuggestion({
        sidecar: applied,
        threadId: 't1',
        suggestionId: 's-reject',
        author,
        anchor: applied.threads[0].anchor,
        beforeTextHash: sha256('hello'),
        replacementText: 'Hello there',
        now: FIXED_TS,
      });
      const rejected = rejectSuggestion({
        sidecar: proposedReject,
        threadId: 't1',
        suggestionId: 's-reject',
        actor: author,
        decisionReason: 'not desired',
        now: FIXED_TS,
      });
      if (rejected.threads[0].suggestions?.find((s) => s.suggestion_id === 's-reject')?.status !== 'rejected') {
        throw new Error('suggestion reject state not recorded');
      }
      if (!rejected.threads[0].messages.at(-1)?.body.includes('rejected')) throw new Error('no audit message for rejected');
    },
  },
  {
    id: 'ACPT-CONF-001',
    group: 'conflict-guard',
    smoke: true,
    run: () => {
      let threw = false;
      try {
        createThread({
          sidecar: baseSidecar(),
          text: 'hello world',
          startOffsetUtf16: 0,
          endOffsetUtf16: 4,
          body: 'note',
          author,
          threadId: 'dup',
          messageId: 'm1',
          now: FIXED_TS,
        });
        const once = createThread({
          sidecar: baseSidecar(),
          text: 'hello world',
          startOffsetUtf16: 0,
          endOffsetUtf16: 4,
          body: 'note',
          author,
          threadId: 'dup',
          messageId: 'm2',
          now: FIXED_TS,
        });
        createThread({
          sidecar: once,
          text: 'hello world',
          startOffsetUtf16: 0,
          endOffsetUtf16: 4,
          body: 'note',
          author,
          threadId: 'dup',
          messageId: 'm3',
          now: FIXED_TS,
        });
      } catch (err) {
        threw = String(err?.code ?? '').includes('ID_CONFLICT') || String(err?.message ?? '').includes('ID_CONFLICT');
      }
      if (!threw) throw new Error('expected ID_CONFLICT guard');
    },
  },
].sort((a, b) => a.id.localeCompare(b.id));

const getSha = () => {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
};

const ensureDir = async (p) => mkdir(dirname(p), { recursive: true });

const buildSummary = (result) => {
  const lines = [];
  lines.push('# Acceptance Report');
  lines.push('');
  lines.push(`- suite: ${result.suite}`);
  lines.push(`- timestamp: ${result.timestamp}`);
  lines.push(`- git_sha: ${result.gitSha}`);
  lines.push(`- verdict: ${result.verdict}`);
  lines.push(`- total: ${result.cases.length}, passed: ${result.cases.filter((c) => c.status === 'PASS').length}, failed: ${result.cases.filter((c) => c.status === 'FAIL').length}`);
  lines.push('');
  lines.push('## Groups');
  for (const g of result.groups) {
    lines.push(`- ${g.group}: ${g.status}`);
  }
  lines.push('');
  lines.push('## Cases');
  for (const c of result.cases) {
    lines.push(`- ${c.id} (${c.group}): ${c.status}${c.message ? ` — ${c.message}` : ''}`);
  }
  lines.push('');
  lines.push('## Waivers / Partials');
  if ((result.waivers ?? []).length === 0) lines.push('- none');
  else for (const w of result.waivers) lines.push(`- ${w}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
};

const runSuite = async (suite) => {
  const selected = suite === 'smoke' ? cases.filter((c) => c.smoke) : cases;
  const caseResults = [];
  for (const c of selected) {
    try {
      c.run();
      caseResults.push({ id: c.id, group: c.group, status: 'PASS' });
    } catch (err) {
      caseResults.push({ id: c.id, group: c.group, status: 'FAIL', message: String(err?.message ?? err) });
    }
  }
  const groupMap = new Map();
  for (const c of caseResults) {
    const prev = groupMap.get(c.group) ?? 'PASS';
    groupMap.set(c.group, prev === 'FAIL' || c.status === 'FAIL' ? 'FAIL' : 'PASS');
  }
  const groups = [...groupMap.entries()].map(([group, status]) => ({ group, status })).sort((a, b) => a.group.localeCompare(b.group));
  const verdict = caseResults.some((c) => c.status === 'FAIL') ? 'FAIL' : 'PASS';
  const result = {
    suite,
    timestamp: new Date().toISOString(),
    gitSha: getSha(),
    verdict,
    groups,
    cases: caseResults,
    waivers: [],
  };

  await ensureDir(ARTIFACT_JSON);
  await writeFile(ARTIFACT_JSON, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  await writeFile(ARTIFACT_SUMMARY, buildSummary(result), 'utf8');
  return result;
};

const writeReportFromLatest = async () => {
  const raw = await readFile(ARTIFACT_JSON, 'utf8');
  const parsed = JSON.parse(raw);
  await ensureDir(ARTIFACT_SUMMARY);
  await writeFile(ARTIFACT_SUMMARY, buildSummary(parsed), 'utf8');
};

const mode = process.argv[2] ?? 'full';
if (mode === 'report') {
  await writeReportFromLatest();
  process.exit(0);
}

const suite = mode === 'smoke' ? 'smoke' : 'full';
const result = await runSuite(suite);
if (result.verdict === 'FAIL') process.exit(1);
