.PHONY: dev stop restart build test typecheck prod clean logs release release-minor release-major

# ── Development (full HMR: tsx watch for API, Vite HMR for dashboard) ──

dev: stop ## Start dev servers with auto-reload
	@pnpm build --filter=@mycelish/core 2>/dev/null
	@npx tsx watch packages/cli/src/commands/serve-entry.ts > /tmp/mycelium-api.log 2>&1 &
	@cd packages/dashboard && pnpm dev > /tmp/mycelium-ui.log 2>&1 &
	@cd packages/core && pnpm tsc --watch --preserveWatchOutput > /tmp/mycelium-tsc.log 2>&1 &
	@n=0; while [ $$n -lt 5 ] && ! lsof -ti:3378 >/dev/null 2>&1; do sleep 1; n=$$((n+1)); done
	@if lsof -ti:3378 >/dev/null 2>&1; then \
		echo "  API:  http://localhost:3378  (auto-restart on changes)"; \
	else \
		echo "  API:  FAILED — see: make logs"; \
	fi
	@if lsof -ti:3377 >/dev/null 2>&1; then \
		echo "  UI:   http://localhost:3377  (HMR)"; \
	else \
		echo "  UI:   FAILED — see: make logs"; \
	fi

stop: ## Stop all dev servers
	@lsof -ti:3377 | xargs kill 2>/dev/null || true
	@lsof -ti:3378 | xargs kill 2>/dev/null || true
	@pkill -f "tsx watch.*serve-entry" 2>/dev/null || true
	@pkill -f "tsc --watch.*core" 2>/dev/null || true
	@echo "  Stopped."

restart: stop dev ## Restart dev servers

logs: ## Show dev server logs
	@echo "── API ──" && tail -30 /tmp/mycelium-api.log 2>/dev/null || echo "  (no log)"
	@echo "── UI ──" && tail -30 /tmp/mycelium-ui.log 2>/dev/null || echo "  (no log)"
	@echo "── TSC ──" && tail -10 /tmp/mycelium-tsc.log 2>/dev/null || echo "  (no log)"

# ── Production (Express serves built dashboard) ──

prod: stop build ## Start production server on :3378
	@node packages/cli/dist/index.js serve > /tmp/mycelium-prod.log 2>&1 &
	@sleep 2
	@echo "  Production: http://localhost:3378"

# ── Build & Test ──

build: ## Build all packages
	@pnpm build

test: ## Run all tests
	@pnpm test

typecheck: ## Typecheck all packages
	@pnpm typecheck

clean: ## Clean all dist folders
	@rm -rf packages/cli/dist packages/core/dist packages/dashboard/dist
	@echo "  Cleaned."

# ── Release (AI writes changelog to /tmp/mycelium-changelog.md first) ──

release: test typecheck ## Release patch: test → version → build → push (GH Actions publishes)
	@./scripts/release.sh patch /tmp/mycelium-changelog.md

release-minor: test typecheck ## Release minor bump
	@./scripts/release.sh minor /tmp/mycelium-changelog.md

release-major: test typecheck ## Release major bump
	@./scripts/release.sh major /tmp/mycelium-changelog.md

# ── Help ──

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
