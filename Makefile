.PHONY: release help

help:
	@echo "Usage:"
	@echo "    make release"

release: VERSION:=$(shell jq -r '.version' manifest.json)
release:
	@echo "Releasing $(VERSION)"
	zip -r tab-stats-v$(VERSION).zip \
		LICENSE \
		abouttabs.css \
		abouttabs.html \
		abouttabs.js \
		background.js \
		manifest.json \
		tab-white.svg \
		tab.svg \
		template.js \
		util.js
