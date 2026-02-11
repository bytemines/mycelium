.PHONY: dev stop restart build test typecheck prod clean

# ── Development (full HMR: tsx watch for API, Vite HMR for dashboard) ──

dev: stop ## Start dev servers with auto-reload
	@pnpm build --filter=@mycelish/core 2>/dev/null
	@npx tsx watch packages/cli/src/commands/serve-entry.ts > /tmp/mycelium-api.log 2>&1 &
	@cd packages/dashboard && pnpm dev > /tmp/mycelium-ui.log 2>&1 &
	@cd packages/core && pnpm tsc --watch --preserveWatchOutput > /tmp/mycelium-tsc.log 2>&1 &
	@for i in 1 2 3 4 5; do lsof -ti:3378 >/dev/null 2>&1 && break || sleep 1; done
	@if lsof -ti:3378 >/dev/null 2>&1; then \
		echo "  API:  http://localhost:3378  (auto-restart on changes)"; \
	else \
		echo "  API:  FAILED — check /tmp/mycelium-api.log"; \
		cat /tmp/mycelium-api.log | tail -20; \
	fi
	@if lsof -ti:3377 >/dev/null 2>&1; then \
		echo "  UI:   http://localhost:3377  (HMR)"; \
	else \
		echo "  UI:   FAILED — check /tmp/mycelium-ui.log"; \
		cat /tmp/mycelium-ui.log | tail -20; \
	fi

stop: ## Stop all dev servers
	@-lsof -ti:3377 | xargs kill 2>/dev/null
	@-lsof -ti:3378 | xargs kill 2>/dev/null
	@-pkill -f "tsx watch.*serve-entry" 2>/dev/null
	@-pkill -f "tsc --watch.*core" 2>/dev/null
	@echo "  Stopped."

restart: stop dev ## Restart dev servers

# ── Production (Express serves built dashboard) ──

prod: stop build ## Start production server on :3378
	@node packages/cli/dist/index.js serve &>/dev/null &
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

# ── Help ──

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
