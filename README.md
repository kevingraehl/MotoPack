# MotoPack

MotoPack is Electric Moto Garage’s free battery layout and electric dirt bike conversion builder. Start with a series/parallel target or the dimensions of a cavity, preview the cells and separators, then review connections and export parts.

## Run locally

With Node.js installed, run these commands from the project directory.

```sh
node bundle.cjs
node conversion-server.cjs
```

Open [the local builder](http://127.0.0.1:8185/MotoPack/). The builder also runs offline by opening the generated **Open Cell Bench.html** file. Change the source files and run the bundle command again to refresh the standalone version.

Bank-local automatic grouping keeps all parallel cells in a series group in one physical bank. The battery wizard previews the draft before creating the project. CAD geometry and electrical layouts are design aids for reviewing real builds.

Bundled libraries have their own notices under `vendor/`. Production account configuration and local project storage are outside this repository.
