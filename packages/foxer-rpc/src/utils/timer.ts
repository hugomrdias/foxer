export function startClock() {
  const start = performance.now()
  return () => performance.now() - start
}
