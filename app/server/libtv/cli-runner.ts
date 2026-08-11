import { spawn as nodeSpawn } from 'node:child_process'

import type {
  CliProcess,
  CliResult,
  CliRunner,
  CliRunnerOptions,
  CliSpawn,
} from './types.js'

const MAX_OUTPUT_BYTES = 2 * 1024 * 1024

const spawnWithNode: CliSpawn = (binary, args, options) =>
  nodeSpawn(binary, [...args], options)

export function createCliRunner(options: Partial<CliRunnerOptions> & Pick<CliRunnerOptions, 'binary'>): CliRunner {
  return new SpawnCliRunner(options.binary, options.spawn ?? spawnWithNode)
}

class SpawnCliRunner implements CliRunner {
  private readonly binary: string
  private readonly spawn: CliSpawn

  constructor(binary: string, spawn: CliSpawn) {
    this.binary = binary
    this.spawn = spawn
  }

  run(args: readonly string[]): Promise<CliResult> {
    return new Promise((resolve, reject) => {
      let process: CliProcess
      try {
        process = this.spawn(this.binary, [...args], {
          shell: false,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      } catch (error) {
        reject(startError(error))
        return
      }

      const stdoutChunks: Buffer[] = []
      const stderrChunks: Buffer[] = []
      let outputBytes = 0
      let settled = false

      const cleanup = () => {
        process.stdout.removeListener('data', onStdoutData)
        process.stderr.removeListener('data', onStderrData)
        process.removeListener('error', onError)
        process.removeListener('close', onClose)
        process.stdout.destroy()
        process.stderr.destroy()
      }

      const finish = (callback: () => void, kill: boolean) => {
        if (settled) {
          return
        }
        settled = true
        if (kill) {
          try {
            process.kill('SIGKILL')
          } catch {
            // The process may already have exited between overflow detection and cleanup.
          }
        }
        cleanup()
        callback()
      }

      const capture = (chunks: Buffer[], chunk: string | Buffer) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        outputBytes += buffer.byteLength
        if (outputBytes > MAX_OUTPUT_BYTES) {
          finish(() => reject(new Error('LibTV CLI output exceeds 2 MiB')), true)
          return
        }
        chunks.push(buffer)
      }

      const onStdoutData = (chunk: string | Buffer) => capture(stdoutChunks, chunk)
      const onStderrData = (chunk: string | Buffer) => capture(stderrChunks, chunk)
      const onError = (error: Error) => finish(() => reject(startError(error)), false)
      const onClose = (code: number | null) => {
        if (code !== 0) {
          finish(() => reject(new Error('LibTV CLI failed')), false)
          return
        }
        finish(() =>
          resolve({
            stdout: Buffer.concat(stdoutChunks).toString('utf8'),
            stderr: Buffer.concat(stderrChunks).toString('utf8'),
          }),
          false,
        )
      }

      process.stdout.on('data', onStdoutData)
      process.stderr.on('data', onStderrData)
      process.once('error', onError)
      process.once('close', onClose)
    })
  }
}

function startError(error: unknown): Error {
  if (isErrno(error, 'ENOENT')) {
    return new Error('LibTV CLI is not installed')
  }
  return new Error('LibTV CLI could not start')
}

function isErrno(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  )
}
