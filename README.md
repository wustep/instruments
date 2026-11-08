# Piano Model

A real-time, physically modelled acoustic piano in the browser. Nothing is sampled:
every note is computed — felt hammers, stiff steel strings and a shared wooden
soundboard — in an AudioWorklet.

**Live:** https://piano-model-wustep.vercel.app

Work in progress; full documentation follows.

```sh
pnpm install
pnpm dev        # http://localhost:5199
pnpm test       # DSP unit tests
pnpm e2e        # Playwright (uses installed Google Chrome)
```
