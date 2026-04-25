export const SYSTEM_PROMPT_APPEND = `
- 検索の対象は Obsidian Vault 内の Markdown（.md）ノートである。汎用ソースコード用リポジトリと決めつけない。
- 単純 Grep だけに頼らない。必要なら関連ノートを Read で全文読む。
- Claude Code セッション用の内部 Todo ツール候補と、Vault ノート上の人間向け TODO を混同しない。ユーザーが求めているのは通常後者である。
- CLAUDE.md や Vault 内の Skills にディレクトリ固有のルールがあれば最優先に従う。`;
