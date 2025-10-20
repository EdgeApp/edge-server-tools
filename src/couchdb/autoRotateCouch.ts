import type { ServerScope } from 'nano'

export async function autoRotateCouch<T>(
  connections: ServerScope[],
  work: (connection: ServerScope) => Promise<T>,
  opts: { startIndex?: number } = {}
): Promise<T> {
  const { startIndex = Math.floor(Math.random() * 255) } = opts
  let index = startIndex % connections.length

  for (let i = 0; i < connections.length - 1; ++i) {
    try {
      return await work(connections[index])
    } catch (error) {
      index = (index + 1) % connections.length
    }
  }
  return await work(connections[index])
}
