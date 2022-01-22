import { Provider } from '../src'

describe('Provider', () => {
  it('creates a Provider', () => {
    const provider = new Provider()
    expect(provider).toBeInstanceOf(Provider)
  })
})
