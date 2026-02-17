#!/usr/bin/env node
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { execSync, spawnSync } from 'node:child_process';

const REQ_FILES = [
  '.ai/spec/spec/backend/requirements-index.md',
  '.ai/spec/spec/frontend/requirements-index.md',
  '.ai/spec/spec/cli/requirements-index.md',
];
const MAP_FILE = '.ai/spec/spec/quality/traceability-map.json';
const ARTIFACT_JSON = 'artifacts/traceability/latest.json';
const ARTIFACT_SUMMARY = 'artifacts/traceability/latest-summary.md';
const EXECUTION_ARTIFACT_JSON = 'artifacts/traceability/latest-test-execution.json';

const getSha = () => {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
};

const parseRequirementIds = (text) => [...text.matchAll(/\bMDC-[A-Z]+-\d{3}\b/g)].map((m) => m[0]);

const loadRequirements = async () => {
  const byId = new Map();
  for (const file of REQ_FILES) {
    const text = await readFile(file, 'utf8');
    const ids = parseRequirementIds(text);
    for (const id of ids) {
      if (!byId.has(id)) byId.set(id, file);
    }
  }
  return [...byId.entries()]
    .map(([id, sourceFile]) => ({ requirementId: id, sourceFile }))
    .sort((a, b) => a.requirementId.localeCompare(b.requirementId));
};

const loadMap = async () => {
  const raw = await readFile(MAP_FILE, 'utf8');
  const parsed = JSON.parse(raw);
  const mappings = Array.isArray(parsed?.mappings) ? parsed.mappings : [];
  return mappings
    .map((m) => ({
      requirementId: String(m.requirementId),
      tests: [...new Set((Array.isArray(m.tests) ? m.tests : []).map(String))].sort(),
      waiver: m.waiver ? String(m.waiver) : undefined,
    }))
    .sort((a, b) => a.requirementId.localeCompare(b.requirementId));
};

const executeMappedTests = async (testFiles) => {
  const sortedTests = [...new Set(testFiles)].sort();
  if (sortedTests.length === 0) {
    return {
      command: null,
      success: true,
      executedAt: new Date().toISOString(),
      suiteByFile: {},
      filesRequested: [],
    };
  }

  await mkdir(dirname(EXECUTION_ARTIFACT_JSON), { recursive: true });
  const command = ['vitest', 'run', ...sortedTests, '--reporter=json', `--outputFile=${EXECUTION_ARTIFACT_JSON}`];
  const proc = spawnSync('npx', command, { encoding: 'utf8' });

  let suiteByFile = {};
  if (existsSync(EXECUTION_ARTIFACT_JSON)) {
    const executionRaw = await readFile(EXECUTION_ARTIFACT_JSON, 'utf8');
    const execution = JSON.parse(executionRaw);
    const rows = Array.isArray(execution?.testResults) ? execution.testResults : [];
    suiteByFile = Object.fromEntries(
      rows.map((row) => {
        const file = String(row?.name ?? '');
        const status = String(row?.status ?? 'failed') === 'passed' ? 'pass' : 'fail';
        return [resolve(file), status];
      }),
    );
  }

  return {
    command: `npx ${command.join(' ')}`,
    success: proc.status === 0,
    executedAt: new Date().toISOString(),
    filesRequested: sortedTests,
    suiteByFile,
  };
};

const build = async () => {
  const requirements = await loadRequirements();
  const mappings = await loadMap();

  const requirementIds = new Set(requirements.map((r) => r.requirementId));
  const mappingByReq = new Map();
  const errors = [];

  for (const mapping of mappings) {
    if (!requirementIds.has(mapping.requirementId)) {
      errors.push(`unknown requirement ID in mapping: ${mapping.requirementId}`);
      continue;
    }
    if (mappingByReq.has(mapping.requirementId)) {
      errors.push(`duplicate mapping entry for requirement: ${mapping.requirementId}`);
      continue;
    }
    mappingByReq.set(mapping.requirementId, mapping);
  }

  const allMappedFiles = [...new Set(mappings.flatMap((m) => m.tests).filter((t) => existsSync(t)))].sort();
  const execution = await executeMappedTests(allMappedFiles);
  if (!execution.success) {
    errors.push('mapped test execution failed');
  }

  const entries = requirements.map((req) => {
    const mapped = mappingByReq.get(req.requirementId);
    const tests = mapped?.tests ?? [];
    const missingFiles = tests.filter((t) => !existsSync(t));

    let lastExecutionStatus = 'not-run';
    if (missingFiles.length > 0) {
      lastExecutionStatus = 'invalid-mapping';
    } else if (tests.length > 0) {
      const statuses = tests
        .map((t) => execution.suiteByFile[resolve(t)] ?? 'not-run')
        .filter((s) => s === 'pass' || s === 'fail' || s === 'not-run');
      if (statuses.includes('fail')) lastExecutionStatus = 'fail';
      else if (statuses.length > 0 && statuses.every((s) => s === 'pass')) lastExecutionStatus = 'pass';
      else if (!execution.success) lastExecutionStatus = 'fail';
      else lastExecutionStatus = 'not-run';
    }

    let coverageStatus = 'covered';
    if (tests.length === 0) coverageStatus = 'missing';
    else if (mapped?.waiver) coverageStatus = 'partial';
    if (missingFiles.length > 0) coverageStatus = 'missing';

    return {
      requirementId: req.requirementId,
      sourceFile: req.sourceFile,
      tests,
      missingFiles,
      lastExecutionStatus,
      coverageStatus,
      waiver: mapped?.waiver,
    };
  });

  const counts = {
    covered: entries.filter((e) => e.coverageStatus === 'covered').length,
    partial: entries.filter((e) => e.coverageStatus === 'partial').length,
    missing: entries.filter((e) => e.coverageStatus === 'missing').length,
  };

  const result = {
    timestamp: new Date().toISOString(),
    gitSha: getSha(),
    requirementSources: REQ_FILES,
    mapFile: MAP_FILE,
    errors,
    execution,
    counts,
    requirements: entries,
    verdict: errors.length > 0 || counts.missing > 0 ? 'FAIL' : 'PASS',
  };

  await mkdir(dirname(ARTIFACT_JSON), { recursive: true });
  await writeFile(ARTIFACT_JSON, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  await writeFile(ARTIFACT_SUMMARY, toSummary(result), 'utf8');

  if (existsSync(EXECUTION_ARTIFACT_JSON)) {
    await rm(EXECUTION_ARTIFACT_JSON, { force: true });
  }

  return result;
};

const toSummary = (result) => {
  const lines = [];
  lines.push('# Traceability Report');
  lines.push('');
  lines.push(`- timestamp: ${result.timestamp}`);
  lines.push(`- git_sha: ${result.gitSha}`);
  lines.push(`- verdict: ${result.verdict}`);
  lines.push(`- covered: ${result.counts.covered}`);
  lines.push(`- partial: ${result.counts.partial}`);
  lines.push(`- missing: ${result.counts.missing}`);
  lines.push(`- test execution command: ${result.execution.command ?? 'none'}`);
  lines.push(`- test execution success: ${result.execution.success}`);
  lines.push('');

  lines.push('## Errors');
  if (result.errors.length === 0) lines.push('- none');
  else for (const err of result.errors) lines.push(`- ${err}`);
  lines.push('');

  lines.push('## Requirements');
  for (const row of result.requirements) {
    const tests = row.tests.length > 0 ? row.tests.join(', ') : 'none';
    lines.push(`- ${row.requirementId} [${row.coverageStatus}] (${row.sourceFile})`);
    lines.push(`  - tests: ${tests}`);
    lines.push(`  - last execution status: ${row.lastExecutionStatus}`);
    if (row.waiver) lines.push(`  - waiver: ${row.waiver}`);
    if (row.missingFiles.length > 0) lines.push(`  - mapping file errors: missing test files -> ${row.missingFiles.join(', ')}`);
  }
  lines.push('');

  return `${lines.join('\n')}\n`;
};

const writeReportFromLatest = async () => {
  const raw = await readFile(ARTIFACT_JSON, 'utf8');
  const parsed = JSON.parse(raw);
  await mkdir(dirname(ARTIFACT_SUMMARY), { recursive: true });
  await writeFile(ARTIFACT_SUMMARY, toSummary(parsed), 'utf8');
};

const mode = process.argv[2] ?? 'build';
if (mode === 'report') {
  await writeReportFromLatest();
  process.exit(0);
}

const result = await build();
if (mode === 'check' && result.verdict === 'FAIL') process.exit(1);
if (mode === 'build' && result.errors.length > 0) process.exit(1);
