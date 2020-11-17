export let supportsPassive = false

export function interleave<T, U> ([x, ...xs]: T[], ys: U[]): (T | U)[] {
  if (!x) return ys
  return [x, ...interleave(xs, ys)]
}

export function getRandomString (length = 16): string {
  let s = ''
  
  do { s += Math.random().toString(36).substr(2) } while (s.length < length)

  return s
}

if (typeof window !== 'undefined') {
  supportsPassive = false
  try {
    const opts = Object.defineProperty({}, 'passive', {
      get () {
        supportsPassive = true
      }
    })
    window.addEventListener('test', null!, opts)
  } catch (e) {}
}
