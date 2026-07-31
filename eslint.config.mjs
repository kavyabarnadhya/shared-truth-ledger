import { FlatCompat } from "@eslint/eslintrc";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // src/core/** is the graded path: it must produce identical output in
    // Node (the CLI) and the browser (the Evals tab). Importing any Node
    // builtin here would silently break that parity, so it is a lint error,
    // not a runtime surprise. See build plan §"Architectural spine".
    //
    // Test files are exempt: *.test.ts always runs under `node --test`
    // (never bundled for the browser), so node:test/node:assert/node:fs are
    // legitimate there — the purity guarantee is about the shipped/bundled
    // module graph, not about how tests are allowed to inspect it.
    files: ["src/core/**/*.ts"],
    ignores: ["src/core/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            "fs", "node:fs", "path", "node:path", "crypto", "node:crypto",
            "process", "node:process", "os", "node:os", "child_process", "node:child_process",
          ],
          patterns: ["node:*"],
        },
      ],
    },
  },
  {
    // The gateway key is read from process.env only inside src/server/**.
    // src/lib/** and src/components/** are the client-facing surfaces —
    // Next bundles anything they import for the browser — so importing
    // src/server/** from either would risk leaking the key into a client
    // chunk. This is the second half of the key-safety guarantee; the first
    // half (no NEXT_PUBLIC_ prefix, a build-output grep test) lives in the
    // live-mode build step.
    files: ["src/lib/**/*.ts", "src/lib/**/*.tsx", "src/components/**/*.ts", "src/components/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["**/server/*", "**/server", "@/server/*", "@/server"], message: "src/lib and src/components must never import src/server — that would risk the gateway key reaching a client bundle." }] },
      ],
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "mcp-server/dist/**",
      "fixtures/recorded.generated.ts",
      "src/corpus/bundled.generated.ts",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
