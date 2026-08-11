import type { Readable } from 'node:stream'

export interface CliResult {
  stdout: string
  stderr: string
}

export interface CliRunner {
  run(args: readonly string[]): Promise<CliResult>
}

export interface CliProcess {
  readonly stdout: Readable
  readonly stderr: Readable
  once(event: 'error', listener: (error: Error) => void): unknown
  once(event: 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown
  removeListener(event: 'error', listener: (error: Error) => void): unknown
  removeListener(
    event: 'close',
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): unknown
  kill(signal?: NodeJS.Signals | number): boolean
}

export interface CliSpawnOptions {
  shell: false
  stdio: ['ignore', 'pipe', 'pipe']
}

export type CliSpawn = (
  binary: string,
  args: readonly string[],
  options: CliSpawnOptions,
) => CliProcess

export interface CliRunnerOptions {
  binary: string
  spawn: CliSpawn
}
