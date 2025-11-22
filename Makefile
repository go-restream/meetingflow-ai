# Makefile for MeetingFlow AI - Enterprise Meeting Assistant for Obsidian
# Author: Claude
# Updated: 2025-10-31
# Description: Build system with i18n optimization and development/production modes

# Variables
PLUGIN_DIR := /Users/yyc/Documents/Obsidian/WorkSpace/.obsidian/plugins/samples-code
DIST_DIR := dist
NODE_ENV ?= production

# Default target
.PHONY: all
all: build

# Build the plugin (production mode by default)
.PHONY: build
build:
	@echo "Building plugin in $(NODE_ENV) mode..."
	@if [ "$(NODE_ENV)" = "development" ]; then \
		yarn dev; \
	else \
		yarn build; \
	fi
	@echo "Build completed successfully!"

# Development build with watch mode
.PHONY: dev
dev:
	@echo "Starting development build with watch mode..."
	NODE_ENV=development yarn dev

# Production build (same as build)
.PHONY: prod
prod:
	@echo "Building plugin in production mode with i18n optimization..."
	NODE_ENV=production yarn build

# Type checking only
.PHONY: check
check:
	@echo "Running TypeScript type checking..."
	yarn tsc -noEmit -skipLibCheck
	@echo "Type checking completed!"

# Clean the dist directory and i18n bundles
.PHONY: clean
clean:
	@echo "Cleaning dist directory and i18n bundles..."
	@if [ -d "$(DIST_DIR)" ]; then \
		rm -rf "$(DIST_DIR)"/*; \
		echo "Dist directory cleaned!"; \
	else \
		echo "Dist directory does not exist, nothing to clean."; \
	fi
	@echo "Cleaning i18n bundles..."
	@if [ -f "src/i18n/i18n-bundle.ts" ]; then \
		rm -f "src/i18n/i18n-bundle.ts"; \
		echo "i18n bundle cleaned!"; \
	fi

# Deploy plugin to Obsidian plugins directory
.PHONY: deploy
deploy: build
	@echo "Deploying plugin to Obsidian..."
	@if [ ! -d "$(PLUGIN_DIR)" ]; then \
		echo "Creating plugin directory: $(PLUGIN_DIR)"; \
		mkdir -p "$(PLUGIN_DIR)"; \
	fi
	@if [ -d "$(DIST_DIR)" ]; then \
		echo "Copying files from $(DIST_DIR) to $(PLUGIN_DIR)"; \
		cp -r "$(DIST_DIR)"/* "$(PLUGIN_DIR)"/; \
		echo "Deployment completed successfully!"; \
		echo "Please restart Obsidian to load the updated plugin."; \
	else \
		echo "Error: $(DIST_DIR) directory does not exist. Run 'make build' first."; \
		exit 1; \
	fi

# Clean and rebuild
.PHONY: rebuild
rebuild: clean build

# Clean, build and deploy
.PHONY: redeploy
redeploy: clean build deploy

# i18n specific targets
.PHONY: i18n-check
i18n-check:
	@echo "Checking i18n translation completeness..."
	@echo "🇨🇳 Chinese translations:"
	@wc -l src/i18n/locales/zh-CN.json | awk '{print "  Lines: " $$1}'
	@echo "🇺🇸 English translations:"
	@wc -l src/i18n/locales/en-US.json | awk '{print "  Lines: " $$1}'
	@echo "✅ i18n check completed!"

.PHONY: i18n-validate
i18n-validate:
	@echo "Validating i18n configuration..."
	@if command -v node >/dev/null 2>&1; then \
		node -e "try { require('./src/i18n/i18n.ts'); console.log('✅ i18n module loaded successfully'); } catch(e) { console.error('❌ i18n validation failed:', e.message); process.exit(1); }"; \
	else \
		echo "⚠️  Node.js not found, skipping i18n module validation"; \
	fi

# Quick development deploy (skip type checking for faster iteration)
.PHONY: dev-deploy
dev-deploy:
	@echo "Quick development deploy (type check skipped)..."
	@NODE_ENV=development node esbuild.config.mjs production && node build.mjs
	@echo "Dev build completed, deploying..."
	@$(MAKE) deploy-only

# Deploy only (skip build)
.PHONY: deploy-only
deploy-only:
	@echo "Deploying to Obsidian..."
	@if [ ! -d "$(PLUGIN_DIR)" ]; then \
		echo "Creating plugin directory: $(PLUGIN_DIR)"; \
		mkdir -p "$(PLUGIN_DIR)"; \
	fi
	@if [ -d "$(DIST_DIR)" ]; then \
		echo "Copying files from $(DIST_DIR) to $(PLUGIN_DIR)"; \
		cp -r "$(DIST_DIR)"/* "$(PLUGIN_DIR)"/; \
		echo "Deployment completed successfully!"; \
		echo "Please restart Obsidian to load the updated plugin."; \
	else \
		echo "Error: $(DIST_DIR) directory does not exist."; \
		exit 1; \
	fi

# Show build information
.PHONY: info
info:
	@echo "=== Obsidian Plugin Build Information ==="
	@echo "Plugin Directory: $(PLUGIN_DIR)"
	@echo "Dist Directory: $(DIST_DIR)"
	@echo "Node Environment: $(NODE_ENV)"
	@echo "Available Build Targets:"
	@echo "  dev        - Development build with watch mode"
	@echo "  build/prod - Production build with i18n optimization"
	@echo "  check      - TypeScript type checking only"
	@echo "  deploy     - Build and deploy to Obsidian"
	@echo "  dev-deploy - Quick development deploy"
	@echo "  i18n-check - Check i18n translation completeness"
	@echo "  i18n-validate - Validate i18n configuration"
	@echo "======================================="

# Show help
.PHONY: help
help:
	@echo "=== Obsidian Plugin Makefile Help ==="
	@echo "Build Targets:"
	@echo "  dev           - Development build with watch mode"
	@echo "  build         - Production build with i18n optimization (default)"
	@echo "  prod          - Explicit production build"
	@echo "  check         - TypeScript type checking only"
	@echo ""
	@echo "Deployment Targets:"
	@echo "  deploy        - Build and deploy to Obsidian plugins directory"
	@echo "  dev-deploy    - Quick development deploy (no type check)"
	@echo "  deploy-only   - Deploy existing build without rebuilding"
	@echo ""
	@echo "Maintenance Targets:"
	@echo "  clean         - Clean dist directory and i18n bundles"
	@echo "  rebuild       - Clean and rebuild"
	@echo "  redeploy      - Clean, build and deploy"
	@echo ""
	@echo "i18n Targets:"
	@echo "  i18n-check    - Check i18n translation completeness"
	@echo "  i18n-validate - Validate i18n configuration"
	@echo ""
	@echo "Information:"
	@echo "  info          - Show build configuration and targets"
	@echo "  help          - Show this help message"
	@echo ""
	@echo "Plugin Directory: $(PLUGIN_DIR)"
	@echo "Dist Directory: $(DIST_DIR)"
	@echo "Current Environment: $(NODE_ENV)"
	@echo "======================================"