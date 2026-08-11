import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'

import { describe, expect, test, vi } from 'vitest'

import { createCliRunner } from './cli-runner.js'

type FakeChild = EventEmitter & {
  stdout: PassThrough
  stderr: PassThrough
  kill: ReturnType<typeof vi.fn<(signal?: NodeJS.Signals | number) => boolean>>
}

type FakeSpawn = (
  binary: string,
  args: readonly string[],
  options: unknown,
) => FakeChild

function child(): FakeChild {
  return Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => true),
  })
}

function successfulSpawn(stdout: string, stderr = ''): FakeSpawn {
  return () => {
    const process = child()
    queueMicrotask(() => {
      process.stdout.end(stdout)
      process.stderr.end(stderr)
      process.emit('close', 0)
    })
    return process
  }
}

describe('LibTV CLI runner', () => {
  test('runs fixed argument arrays with shell disabled', async () => {
    const spawn = vi.fn(successfulSpawn('{"models":[]}'))
    const runner = createCliRunner({
      binary: '/Users/example/.libtv/libtv',
      spawn,
    })

    await runner.run(['model', 'search', '--type', 'image'])

    expect(spawn).toHaveBeenCalledWith(
      '/Users/example/.libtv/libtv',
      ['model', 'search', '--type', 'image'],
      expect.objectContaining({ shell: false, stdio: ['ignore', 'pipe', 'pipe'] }),
    )
  })

  test('keeps stdout and stderr separate', async () => {
    const runner = createCliRunner({
      binary: '/Users/example/.libtv/libtv',
      spawn: successfulSpawn('{"models":[]}', 'deprecated field'),
    })

    await expect(runner.run(['model', 'search'])).resolves.toEqual({
      stdout: '{"models":[]}',
      stderr: 'deprecated field',
    })
  })

  test('redacts the missing CLI path from ENOENT failures', async () => {
    let process: FakeChild | undefined
    const spawn: FakeSpawn = () => {
      process = child()
      queueMicrotask(() => {
        const error = Object.assign(
          new Error('spawn /Users/example/.libtv/libtv ENOENT PRIVATE_TOKEN=secret'),
          { code: 'ENOENT' },
        )
        process?.emit('error', error)
        process?.emit('close', 0)
      })
      return process
    }
    const runner = createCliRunner({
      binary: '/Users/example/.libtv/libtv',
      spawn,
    })

    const error = await runner.run(['account', 'info']).catch((reason: unknown) => reason)

    expect(error).toEqual(expect.any(Error))
    expect(String(error)).toContain('LibTV CLI is not installed')
    expect(String(error)).not.toContain('/Users/example/.libtv/libtv')
    expect(String(error)).not.toContain('PRIVATE_TOKEN')
    expect(process?.listenerCount('error')).toBe(0)
    expect(process?.listenerCount('close')).toBe(0)
    expect(process?.stdout.destroyed).toBe(true)
    expect(process?.stderr.destroyed).toBe(true)
  })

  test('redacts command and environment details from nonzero exits', async () => {
    const spawn: FakeSpawn = () => {
      const process = child()
      queueMicrotask(() => {
        process.stderr.end('failed: PRIVATE_TOKEN=secret')
        process.emit('close', 1)
      })
      return process
    }
    const runner = createCliRunner({
      binary: '/Users/example/.libtv/libtv',
      spawn,
    })

    await expect(runner.run(['project', 'list'])).rejects.toThrow('LibTV CLI failed')
    await runner.run(['project', 'list']).catch((error: unknown) => {
      expect(String(error)).not.toContain('/Users/example/.libtv/libtv')
      expect(String(error)).not.toContain('project list')
      expect(String(error)).not.toContain('PRIVATE_TOKEN')
    })
  })

  test('rejects output beyond two MiB', async () => {
    let process: FakeChild | undefined
    const spawn: FakeSpawn = () => {
      process = child()
      queueMicrotask(() => {
        process?.stdout.end(Buffer.alloc(2 * 1024 * 1024 + 1, 'x'))
        process?.emit('close', 0)
      })
      return process
    }
    const runner = createCliRunner({
      binary: '/Users/example/.libtv/libtv',
      spawn,
    })

    await expect(runner.run(['--version'])).rejects.toThrow('LibTV CLI output exceeds 2 MiB')
    expect(process?.kill).toHaveBeenCalledTimes(1)
    expect(process?.kill).toHaveBeenCalledWith('SIGKILL')
    expect(process?.stdout.listenerCount('data')).toBe(0)
    expect(process?.stderr.listenerCount('data')).toBe(0)
    expect(process?.listenerCount('error')).toBe(0)
    expect(process?.listenerCount('close')).toBe(0)
    expect(process?.stdout.destroyed).toBe(true)
    expect(process?.stderr.destroyed).toBe(true)
  })

  test('settles overflow once when kill races error and close', async () => {
    const process = child()
    let hadTerminalListenersWhenKilled = false
    process.kill.mockImplementation(() => {
      hadTerminalListenersWhenKilled =
        process.listenerCount('error') === 1 && process.listenerCount('close') === 1
      process.emit('error', Object.assign(new Error('kill race'), { code: 'EIO' }))
      process.emit('close', 1)
      return true
    })
    const spawn: FakeSpawn = () => {
      queueMicrotask(() => {
        process.stdout.end(Buffer.alloc(2 * 1024 * 1024 + 1, 'x'))
      })
      return process
    }
    const runner = createCliRunner({
      binary: '/Users/example/.libtv/libtv',
      spawn,
    })

    await expect(runner.run(['--version'])).rejects.toThrow('LibTV CLI output exceeds 2 MiB')
    expect(hadTerminalListenersWhenKilled).toBe(true)
    expect(process.kill).toHaveBeenCalledTimes(1)
    expect(process.listenerCount('error')).toBe(0)
    expect(process.listenerCount('close')).toBe(0)
  })
})
