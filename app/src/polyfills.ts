import { Buffer } from 'buffer';

// @ton/core expects a global Buffer (Node API) in the browser
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer ??= Buffer;
