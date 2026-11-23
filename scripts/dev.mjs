/**
 * Runs the Vite dev server and the bundled AI proxy server together, so
 * `npm run dev` exposes /api exactly like the deployed Node service.
 *
 * Without server.js the Vite proxy has no backend, /api returns a non-JSON
 * 500, and AI requests fall back to a direct browser call that providers such
 * as OpenAI block with a confusing CORS error.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const children = [];
let shuttingDown = false;

function spawnChild(args, env) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: 'inherit',
  });
  children.push(child);
  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
    }
  }
  process.exitCode = code;
  // Give the children a moment to flush output before the parent exits.
  setTimeout(() => process.exit(code), 200).unref();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

// The proxy is a convenience in development: if it cannot start (for example
// the port is already taken by another server.js), keep Vite running.
const server = spawnChild(['--watch', 'server.js'], { PORT: process.env.PORT || '8787' });
server.on('exit', (code) => {
  if (!shuttingDown) {
    console.log(`[dev] AI proxy server stopped (code ${code ?? 0}); Vite keeps running.`);
  }
});

const vite = spawnChild([viteBin, '--port=3000', '--host=0.0.0.0'], {});
vite.on('exit', (code) => {
  if (!shuttingDown) shutdown(typeof code === 'number' ? code : 0);
});
vite.on('error', () => shutdown(1));
