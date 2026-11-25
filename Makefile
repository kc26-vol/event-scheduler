ENV ?= staging
.DEFAULT_GOAL := help
.PHONY: help install dev build test preview deploy init-local

help:
	@echo "make install | dev | build | test | preview | deploy ENV=staging"

install:
	cd web && npm ci

init-local:
	cd web && npx --no-install wrangler d1 migrations apply DB --local
	cd web && node scripts/seed-admin.mjs --local

dev: init-local
	cd web && npm run dev

build:
	cd web && npm run build:worker

test:
	cd web && npm run typecheck && npm test

preview: build init-local
	cd web && npm run preview

deploy:
	gh workflow run deploy.yml --ref main -f target="$(ENV)"
