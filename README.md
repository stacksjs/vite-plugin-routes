# vite-plugin-routes

<p align="center"><img src=".github/art/cover.jpg" alt="Social Card of this repo"></p>

[![npm version](https://img.shields.io/npm/v/vite-plugin-routes?style=flat-square)](https://npmjs.com/package/vite-plugin-routes)
[![GitHub Actions](https://img.shields.io/github/actions/workflow/status/stacksjs/vite-plugin-routes/ci.yml?style=flat-square&branch=main)](https://github.com/stacksjs/vite-plugin-routes/actions?query=workflow%3Aci)
[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)
<!-- [![npm downloads][npm-downloads-src]][npm-downloads-href] -->
<!-- [![Codecov][codecov-src]][codecov-href] -->

> File based typed routing for Vue Router with TypeScript support ✨

## Features

- 📁 **File Based** _Routes are automatically generated from your files_
- 🔄 **TypeScript Support** _Full type safety for your routes_
- 🌐 **Multiple Frameworks** _Works with Vite, Webpack, Rollup, and esbuild_
- 🎨 **Meta Configuration** _Configure routes via route blocks in your pages_
- 🔌 **Vue Router Integration** _Seamless integration with Vue Router 4_
- 📱 **HMR Optimized** _Fast hot module replacement_
- 🛠️ **Flexible Configuration** _Customize route patterns, exclusions, and more_

## Install

```bash
npm install -D vite-plugin-routes
# or
yarn add -D vite-plugin-routes
# or
pnpm add -D vite-plugin-routes
# or
bun add -D vite-plugin-routes
```

## Get Started

Add VueRouter plugin **before** Vue plugin:

<details>
<summary>Vite</summary><br>

```ts
// vite.config.ts
import VueRouter from 'vite-plugin-routes/vite'

export default defineConfig({
  plugins: [
    VueRouter({
      /_ options _/
    }),
    // ⚠️ Vue must be placed after VueRouter()
    Vue(),
  ],
})
```

<br></details>

<details>
<summary>Rollup</summary><br>

```ts
// rollup.config.js
import VueRouter from 'vite-plugin-routes/rollup'

export default {
  plugins: [
    VueRouter({
      /_ options _/
    }),
    // ⚠️ Vue must be placed after VueRouter()
    Vue(),
  ],
}
```

<br></details>

<details>
<summary>Webpack</summary><br>

```ts
// webpack.config.js
module.exports = {
  /_ ... _/
  plugins: [
    require('vite-plugin-routes/webpack')({
      /_ options _/
    }),
  ],
}
```

<br></details>

<details>
<summary>Vue CLI</summary><br>

```ts
// vue.config.js
module.exports = {
  configureWebpack: {
    plugins: [
      require('vite-plugin-routes/webpack')({
        /_ options _/
      }),
    ],
  },
}
```

<br></details>

<details>
<summary>esbuild</summary><br>

```ts
// esbuild.config.js
import { build } from 'esbuild'
import VueRouter from 'vite-plugin-routes/esbuild'

build({
  plugins: [VueRouter()],
})
```

<br></details>

## Setup

After installing, **you should run your dev server**(usually `npm run dev`)**to generate the first version of the types**. Then you need to add the types to your `tsconfig.json`.

```json
{
  "include": [
    // ...
    "./typed-router.d.ts"
  ],
  // ...
  "compilerOptions": {
    // ...
    "moduleResolution": "Bundler"
    // ...
  }
}
```

Then, if you have an `env.d.ts` file like the one created by `npm vue create <my-project>`, add the `vite-plugin-routes/client` types to it:

```ts
// env.d.ts
/// <reference types="vite/client" />
/// <reference types="vite-plugin-routes/client" />
```

If you don't have an `env.d.ts` file, you can create one and add the vite-plugin-routes types to it _or_ you can add them to the `types` property in your `tsconfig.json`:

```json
{
  "compilerOptions": {
    // ...
    "types": ["vite-plugin-routes/client"]
  }
}
```

Finally, import the generated routes from `vue-router/auto-routes` and pass them to the router:

```diff
import { createRouter, createWebHistory } from 'vue-router'
+import { routes } from 'vue-router/auto-routes'

createRouter({
  history: createWebHistory(),
  // pass the generated routes written by the plugin 🤖

+ routes,

})
```

## Configuration

```ts
// vite.config.ts
import VueRouter from 'vite-plugin-routes/vite'

export default defineConfig({
  plugins: [
    VueRouter({
      // Customize your routes
      routesFolder: ['src/pages'], // default: 'src/pages'
      exclude: [], // Patterns to exclude from route generation
      // ... other options
    }),
    Vue(),
  ],
})
```

### Available Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `routesFolder` | `string \| string[]` | `'src/pages'` | Path(s) to the pages directory. Supports globs. |
| `exclude` | `string[]` | `[]` | Patterns to exclude from route generation. |
| `filePatterns` | `string[]` | `['**/*.vue']` | File patterns to include for route generation. |

## Testing

```bash
bun test
```

## Changelog

Please see our [releases](https://github.com/stacksjs/vite-plugin-routes/releases) page for more information on what has changed recently.

## Contributing

Please review the [Contributing Guide](https://github.com/stacksjs/contributing) for details.

## Community

For help, discussion about best practices, or any other conversation that would benefit from being searchable:

[Discussions on GitHub](https://github.com/stacksjs/stacks/discussions)

For casual chit-chat with others using this package:

[Join the Stacks Discord Server](https://discord.gg/stacksjs)

## Postcardware

"Software that is free, but hopes for a postcard." We love receiving postcards from around the world showing where `vite-plugin-routes` is being used! We showcase them on our website too.

Our address: Stacks.js, 12665 Village Ln #2306, Playa Vista, CA 90094, United States 🌎

## Sponsors

We would like to extend our thanks to the following sponsors for funding Stacks development. If you are interested in becoming a sponsor, please reach out to us.

- [JetBrains](https://www.jetbrains.com/)
- [The Solana Foundation](https://solana.com/)

## Credits

- [All Contributors](https://github.com/stacksjs/vite-plugin-routes/contributors)

## License

The MIT License (MIT). Please see [LICENSE](https://github.com/stacksjs/stacks/tree/main/LICENSE.md) for more information.

Made with 💙

<!-- Badges -->
<!-- [npm-downloads-src]: https://img.shields.io/npm/dm/vite-plugin-routes?style=flat-square
[npm-downloads-href]: https://npmjs.com/package/vite-plugin-routes -->
<!-- [codecov-src]: https://img.shields.io/codecov/c/gh/stacksjs/vite-plugin-routes/main?style=flat-square
[codecov-href]: https://codecov.io/gh/stacksjs/vite-plugin-routes -->
