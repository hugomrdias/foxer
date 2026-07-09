export const formatLogDuration = (ms: number) => {
  if (ms < 1000) return `${Math.round(ms)}ms`
  const seconds = Math.floor(ms / 1000)

  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds - h * 3600) / 60)
  const s = seconds - h * 3600 - m * 60
  const secWithMs = ((ms % 60000) / 1000).toFixed(3).replace(/\.?0+$/, '')

  const hstr = h > 0 ? `${h}h ` : ''
  const mstr = m > 0 || h > 0 ? `${m < 10 && h > 0 ? '0' : ''}${m}m ` : ''
  const sstr =
    s > 0 || m > 0 ? `${s < 10 && m > 0 ? '0' : ''}${secWithMs}s` : ''

  return `${hstr}${mstr}${sstr}`
}
