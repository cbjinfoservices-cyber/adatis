#!/usr/bin/env node
/**
 * Lance scripts/package.sh avec le bon bash.
 *
 *   npm run package
 *   TAG=1.2.0 npm run package
 *
 * Sous Windows, « bash » désigne le lanceur WSL (sans /bin/bash si la seule
 * distribution est docker-desktop) : on utilise Git Bash à la place.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function findBash() {
  if (process.platform !== 'win32') return 'bash';
  const candidates = [
    process.env.GIT_BASH,
    path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'bin', 'bash.exe'),
    path.join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Git', 'bin', 'bash.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'Git', 'bin', 'bash.exe'),
  ];
  const found = candidates.find((p) => p && fs.existsSync(p));
  if (!found) {
    console.error('✖ Git Bash introuvable : installe Git for Windows ou définis GIT_BASH');
    process.exit(1);
  }
  return found;
}

const result = spawnSync(findBash(), [path.join(ROOT, 'scripts', 'package.sh'), ...process.argv.slice(2)], {
  cwd: ROOT,
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
