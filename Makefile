.PHONY: dev stop restart build test typecheck prod clean

# ── Development (Vite HMR + API backend) ──

dev: stop ## Start dev servers (Vite HMR on :3377, API on :3378)
	@node packages/cli/dist/index.js serve &>/dev/null &
	@cd packages/dashboard && pnpm dev &>/dev/null &
	@sleep 2
	@echo "  API:  http://localhost:3378"
	@echo "  UI:   http://localhost:3377  (HMR)"

stop: ## Stop all dev servers
	@-lsof -ti:3377 | xargs kill 2>/dev/null
	@-lsof -ti:3378 | xargs kill 2>/dev/null
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
