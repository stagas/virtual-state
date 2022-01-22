import { debounce } from 'debounce-micro'
import { Provider } from '../src'

describe('Provider', () => {
  it('creates a Provider', () => {
    const provider = new Provider()
    expect(provider).toBeInstanceOf(Provider)
  })

  describe('hooks', () => {
    let provider

    beforeEach(() => {
      provider = new Provider()
    })

    it('inits with null hook', () => {
      expect(provider.hook).toBeNull()
    })

    it('accepts a hook object', () => {
      const hook = {
        trigger: () => {
          //
        },
      }
      provider.hook = hook
      expect(provider.hook).toBe(hook)
    })
  })

  describe('useValue', () => {
    let provider
    let hook
    beforeEach(() => {
      hook = {
        trigger: () => {
          //
        },
      }
      provider = new Provider()
      provider.hook = hook
    })

    it('useValue single hook', () => {
      hook.trigger = jest.fn()
      const value = provider.useValue()
      value.get()
      expect(hook.trigger).toBeCalledTimes(0)
      value.set('hi')
      expect(hook.trigger).toBeCalledTimes(0)
      queueMicrotask(() => {
        expect(hook.trigger).toBeCalledTimes(1)
        value.set('other')
        queueMicrotask(() => {
          expect(hook.trigger).toBeCalledTimes(2)
        })
      })
    })

    it('useValue multiple hooks', () => {
      const hooks = []
      hook.trigger = jest.fn()
      hooks.push(hook)

      const value = provider.useValue()
      value.get()

      const secondHook = {
        trigger: jest.fn(),
      }
      hooks.push(secondHook)
      provider.hook = secondHook
      value.get()

      expect(hooks[0].trigger).toBeCalledTimes(0)
      expect(hooks[1].trigger).toBeCalledTimes(0)
      value.set('hi')
      expect(hooks[0].trigger).toBeCalledTimes(0)
      expect(hooks[1].trigger).toBeCalledTimes(0)
      queueMicrotask(() => {
        expect(hooks[0].trigger).toBeCalledTimes(1)
        expect(hooks[1].trigger).toBeCalledTimes(1)
        value.set('other')
        queueMicrotask(() => {
          expect(hooks[0].trigger).toBeCalledTimes(2)
          expect(hooks[1].trigger).toBeCalledTimes(2)
        })
      })
    })
  })

  describe('useState', () => {
    let provider
    const hook = {
      trigger: () => {
        //
      },
    }

    let called = 0
    beforeEach(() => {
      called = 0
      provider = new Provider()
      provider.hook = hook
      hook.trigger = debounce(() => called++)
    })

    it('useState()', () => {
      const a = provider.useState('a')
      const b = provider.useState('b')

      a.get()
      b.get()

      a.set('x')
      b.set('y')

      queueMicrotask(() => {
        queueMicrotask(() => {
          expect(a.value).toEqual('x')
          expect(b.value).toEqual('y')
          expect(called).toEqual(1)

          provider.hook = hook

          const ax = provider.useState('a')
          const bx = provider.useState('b')

          expect(ax).toBe(a)
          expect(bx).toBe(b)
          expect(ax.value).toEqual('x')
          expect(bx.value).toEqual('y')

          a.set('z')

          queueMicrotask(() => {
            queueMicrotask(() => {
              expect(called).toEqual(2)
              expect(ax.value).toEqual('z')
              expect(bx.value).toEqual('y')
            })
          })
        })
      })
    })
  })

  describe('useEffect', () => {
    let provider
    const hook = {
      trigger: () => {
        //
      },
      onunmount: () => {
        //
      },
    }

    let called = 0
    beforeEach(() => {
      called = 0
      provider = new Provider()
      provider.hook = hook
      hook.trigger = debounce(() => called++)
    })

    it('is called when all dependencies are satisfied', () => {
      const a = provider.useState(null)
      const b = provider.useState('b')
      const fn = jest.fn()
      provider.useEffect(fn, [a, b])

      expect(fn).toBeCalledTimes(0)
      queueMicrotask(() => {
        expect(fn).toBeCalledTimes(0)
        a.set('a')
        queueMicrotask(() => {
          expect(fn).toBeCalledTimes(1)
        })
      })
    })

    it('is called immediately when no dependencies', () => {
      const fn = jest.fn()
      provider.useEffect(fn)
      expect(fn).toBeCalledTimes(1)
    })

    it('its cleanup is called when hook is unmounted', () => {
      const cleanup = jest.fn()
      const fn = () => cleanup
      provider.useEffect(fn)
      expect(cleanup).toBeCalledTimes(0)
      hook.onunmount()
      expect(cleanup).toBeCalledTimes(1)
    })
  })

  describe('useRef', () => {
    let provider
    const hook = {
      trigger: () => {
        //
      },
      onunmount: () => {
        //
      },
    }

    let called = 0
    beforeEach(() => {
      called = 0
      provider = new Provider()
      provider.hook = hook
      hook.trigger = debounce(() => called++)
    })

    it('triggers effect when current is filled', () => {
      const ref = provider.useRef(null)
      const fn = jest.fn()
      provider.useEffect(fn, [ref])
      expect(fn).toBeCalledTimes(0)
      ref.current = 'hello'
      queueMicrotask(() => {
        expect(fn).toBeCalledTimes(1)
      })
    })
  })
})
