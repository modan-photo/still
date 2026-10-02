import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Incremental adoption: check staged/working-tree/new frontend files by default.
// Explicit paths are supported; --all is a deliberate repository-wide operation.
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const args = process.argv.slice(2);
const write = args.includes('--write');
const supplied = args.filter((arg) => arg !== '--write' && arg !== '--all');
let files = supplied;
if (args.includes('--all'))
  files = ['src', 'tests', 'scripts', 'package.json', 'eslint.config.mjs', '.prettierrc.json'];
else if (files.length === 0) {
  const git = (...command) =>
    execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, ...command], {
      cwd: root,
      encoding: 'utf8',
    })
      .split('\0')
      .filter(Boolean);
  files = [
    ...new Set([
      ...git('diff', '--name-only', '-z', '--diff-filter=ACMR', 'HEAD'),
      ...git('ls-files', '--others', '--exclude-standard', '-z'),
    ]),
  ].filter(
    (file) =>
      /\.(?:[cm]?js|tsx?|json|css|html)$/.test(file) &&
      !/^(?:docs|src-tauri|node_modules|dist)\//.test(file) &&
      file !== 'package-lock.json' &&
      existsSync(path.join(root, file)),
  );
}
if (files.length === 0) console.log('No changed frontend files to format.');
else {
  try {
    execFileSync(
      process.execPath,
      [
        path.join(root, 'node_modules/prettier/bin/prettier.cjs'),
        write ? '--write' : '--check',
        ...files,
      ],
      { cwd: root, stdio: 'inherit' },
    );
  } catch (error) {
    process.exitCode = error.status ?? 1;
  }
}
