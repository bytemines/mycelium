---
"@mycelish/cli": patch
---

Stop deleting other machines' plugin items on sync. `cleanOrphanedTakeovers` judged a takeover "orphaned" by `fs.access(cachePath)`, but `cachePath` is an absolute path on the machine that captured the plugin (e.g. `/Users/alice/.claude/plugins/cache/...`). On any other machine that path never exists, so `mycelium sync`/`pull` deleted the plugin's manifest entries and `~/.mycelium/global/` source files — and a later `push` propagated the loss to every machine. Takeovers now record the capturing machine's `hostname`, and cleanup only reconciles takeovers owned by the current host (falling back to a cachePath-under-`$HOME` check for legacy records) — so items from other machines stay intact, including on fleets that share an identical home path. Genuine same-machine orphans are still cleaned.
