import { debounce } from 'debounce-micro'

type Fn = () => void

/**
 * Hook.
 */
export interface Hook {
  trigger(): void
  onmount?(): void
  onunmount?(): void
}

/**
 * Value.
 */
export class Value<T> {
  #provider: Provider
  #hooks: Set<Hook> = new Set()

  value: T

  constructor(provider: Provider, initialValue: T | (() => T)) {
    this.#provider = provider
    this.value = typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue
  }

  get() {
    const hook = this.#provider.hook
    if (hook) this.#hooks.add(hook)
    return this.value
  }

  set(newValue: T | (() => T)) {
    this.value = typeof newValue === 'function' ? (newValue as () => T)() : newValue
    this.trigger()
  }

  get current(): T {
    return this.value
  }

  set current(value: T | (() => T)) {
    this.set(value)
  }

  trigger = debounce(() => this.#hooks.forEach(hook => hook.trigger()))
}

/**
 * HookValues.
 */
export class HookValues {
  #provider: Provider
  #values: Value<any>[] = []
  #cleanups: Fn[] = []
  #count = 0

  constructor(provider: Provider) {
    this.#provider = provider
  }

  initCount() {
    this.#count = 0
  }

  cleanup = () => {
    this.#cleanups.forEach(fn => fn())
  }

  getNext(initialValue: any, cleanup?: Fn) {
    if (this.#count < this.#values.length) {
      return this.#values[this.#count++]
    }

    const value = this.#provider.useValue(initialValue)
    if (cleanup) this.#cleanups.push(cleanup)
    this.#values.push(value)
    this.#count++
    return value
  }
}

/**
 * Provider.
 */
export class Provider {
  #values: Map<Hook, HookValues> = new Map()
  #hook: Hook | null = null

  get hook() {
    return this.#hook
  }

  set hook(hook: Hook | null) {
    this.#hook = hook
    if (hook) this.initHook(hook)
  }

  initHook(hook: Hook) {
    let values

    if (!this.#values.has(hook)) {
      values = new HookValues(this)
      this.#values.set(hook, values)
      hook.onunmount = values.cleanup
    } else {
      values = this.#values.get(hook)!
    }

    values.initCount()

    return values
  }

  useState = <T>(initialValue: T | (() => T), cleanup?: Fn): Value<T> => {
    const hook = this.hook
    if (!hook) {
      throw new ReferenceError(
        'No hook available - useState can only be called within a hook function'
      )
    }
    const values = this.#values.get(hook)!
    return values.getNext(initialValue, cleanup)
  }

  useValue = <T>(initialValue: T) => new Value(this, initialValue)

  useCallback = (fn: () => any, deps: Value<any>[] = []) => {
    const callback = this.useState(() => fn)
    this.useEffect(() => {
      callback.set(() => fn)
    }, deps)
    return callback.value
  }

  useEffect = (fn: () => Fn | void, deps: Value<any>[] = []) => {
    let cleanupFn: Fn | void
    const cleanup = () => cleanupFn?.()
    const effect = () => {
      const parentHook = this.#hook!
      const values: any[] = []
      let total = -1
      const hook = {
        trigger: () => {
          const parentHook = this.#hook
          this.#hook = hook

          let satisfied = true
          let equal = 0

          deps.forEach((dep, i) => {
            const value = dep.get()
            if (value == null) satisfied = false
            if (total) {
              if (value === values[i]) equal++
              else values[i] = value
            } else {
              values.push(value)
            }
          })

          if (satisfied && equal !== total) {
            total = values.length
            cleanupFn = fn()
          }

          this.#hook = parentHook
        },
      }
      this.#hook = hook
      hook.trigger()
      this.#hook = parentHook
    }
    this.useState(effect, cleanup)
  }

  useCollection = <T, V>(creator: (id: string, initial?: V, prev?: T) => T): Collection<T, V> => {
    return this.useState(() => new Collection<T, V>(creator)).value
  }

  useRef = <T>() => this.useState<T | null>(null)

  useAsyncContext = <T>(initializer: () => Promise<T>) => {
    const state = new AsyncContext(this, initializer)
    return (): AsyncContext<T> => state
  }
}

/**
 * AsyncContext.
 */
export class AsyncContext<T> {
  hasLoaded = false
  isLoading = false
  error?: Error
  value?: T
  promise: Promise<Value<AsyncContext<T>>>
  #resolve!: (value: Value<AsyncContext<T>>) => void
  #reject!: (error: Error) => void

  #provider: Provider
  #value: Value<AsyncContext<T>>
  #initializer: () => Promise<T>

  constructor(provider: Provider, initializer: () => Promise<T>) {
    this.#provider = provider
    this.#initializer = initializer

    this.#value = this.#provider.useValue(this)

    this.promise = new Promise((resolve, reject) => {
      this.#resolve = resolve
      this.#reject = reject
    })
  }

  get() {
    this.load()
    return this.#value.get()
  }

  set(value: T) {
    this.value = value
    this.#value.set(this)
  }

  load() {
    if (!this.hasLoaded && !this.isLoading) {
      this.isLoading = true
      this.#initializer()
        .then(value => {
          this.hasLoaded = true
          this.isLoading = false
          this.value = value
          this.#value.set(this)
          this.#resolve(this.#value)
        })
        .catch((error: Error) => {
          this.isLoading = false
          this.error = error
          this.#reject(error)
        })
    }
  }

  refresh() {
    if (!this.isLoading) {
      this.hasLoaded = false
      this.load()
    }
  }

  async whenLoaded() {
    return (await this.get().promise).value.value
  }
}

/**
 * Collection.
 */
export class Collection<T, V> {
  #creator: (id: string, initial?: V, prev?: T) => T
  #map: Map<string, T> = new Map()

  constructor(creator: (id: string, initial?: V, prev?: T) => T) {
    this.#creator = creator
  }

  get(id: string, initial?: V) {
    let item = this.#map.get(id)
    if (item) return item

    item = this.#creator(id, initial)
    this.#map.set(id, item)
    return item
  }

  upget(id: string, newValue: V) {
    const item = this.#creator(id, newValue, this.#map.get(id))
    this.#map.set(id, item)
    return item
  }

  has(id: string) {
    return this.#map.has(id)
  }

  map(fn: (value: T, key: string, index: number, map: Map<string, T>) => any) {
    return [...this.#map.entries()].map(([key, value], i) => fn(value, key, i, this.#map))
  }
}
