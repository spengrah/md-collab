#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { execSync } from 'node:child_process';

const REQ_FILES = ['spec/backend/requirements-index.md', 'spec/frontend/requirements-index.md'];
const MAP_FILE = 'spec/quality/traceability-map.json';
const ARTIFACT_JSON = 'artifacts/traceability/latest.json';
const ARTIFACT_SUMMARY = 'artifacts/traceability/latest-summary.md';

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

  const entries = requirements.map((req) => {
    const mapped = mappingByReq.get(req.requirementId);
    const tests = mapped?.tests ?? [];
    const missingFiles = tests.filter((t) => !existsSync(t));
    const lastExecutionStatus = missingFiles.length > 0 ? 'invalid-mapping' : tests.length > 0 ? 'not-run' : 'not-run';
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
    counts,
    requirements: entries,
    verdict: errors.length > 0 || counts.missing > 0 ? 'FAIL' : 'PASS',
  };

  await mkdir(dirname(ARTIFACT_JSON), { recursive: true });
  await writeFile(ARTIFACT_JSON, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  await writeFile(ARTIFACT_SUMMARY, toSummary(result), 'utf8');

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
