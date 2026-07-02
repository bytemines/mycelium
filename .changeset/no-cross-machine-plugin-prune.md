---
"@mycelish/cli": patch
---

Stop deleting other machines' plugin items on sync. `cleanOrphanedTakeovers` judged a takeover "orphaned" by `fs.access(cachePath)`, but `cachePath` is an absolute path on the machine that captured the plugin (e.g. `/Users/alice/.claude/plugins/cache/...`). On any other machine that path never exists, so `mycelium sync`/`pull` deleted the plugin's manifest entries and `~/.mycelium/global/` source files — and a later `push` propagated the loss to every machine. Cleanup now skips takeovers whose `cachePath` isn't under the current machine's home, so cross-platform configs stay intact; genuine same-machine orphans are still cleaned.
