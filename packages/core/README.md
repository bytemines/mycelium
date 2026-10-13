# Mycelium Core

Shared TypeScript types, validation schemas, tool descriptors and Node.js utilities
for [Mycelium](https://github.com/bytemines/mycelium).

```bash
npm install @mycelish/core
```

```ts
import { ALL_TOOL_IDS, toolIdSchema } from "@mycelish/core";

const tool = toolIdSchema.parse("opencode");
console.log(tool, ALL_TOOL_IDS);
```

Filesystem and home-directory helpers are Node-oriented; do not call them in a browser.
See the repository documentation for supported configurations and tool capabilities.

MIT license; the package includes the project license in `dist/LICENSE`.
