// Dedicated viewer lifecycle only. No PID discovery, killing or stale-lock deletion.
export function attachDebugShutdown(
  server,
  {
    signals = process,
    report = console.error,
    setExitCode = (code) => {
      process.exitCode = code
    }
  } = {}
) {
  let closing
  const shutdown = () => {
    if (!closing)
      closing = (async () => {
        try {
          await server.close()
          setExitCode(0)
        } catch (error) {
          setExitCode(1)
          report(`Viewer cleanup failed; preserve the store for recovery: ${String(error)}`)
        } finally {
          signals.removeListener('SIGINT', shutdown)
          signals.removeListener('SIGTERM', shutdown)
        }
      })()
    return closing
  }
  signals.on('SIGINT', shutdown)
  signals.on('SIGTERM', shutdown)
  return { shutdown }
}
