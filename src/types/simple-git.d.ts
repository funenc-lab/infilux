import type { SpawnOptions } from 'node:child_process';

declare module 'simple-git' {
  interface SimpleGitOptions {
    spawnOptions?: SpawnOptions;
  }
}
