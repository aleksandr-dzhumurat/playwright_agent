CURRENT_DIR = $(shell pwd)
include .env
export

prepare-dirs:
	mkdir -p ${CURRENT_DIR}/data || true

setup: prepare-dirs
	cd linkedin_automation && npm install
	cd linkedin_automation && CONFIG_DIR=${CURRENT_DIR}/data node linkedin-automation.js setup && cd ..

connections:
	cd linkedin_automation && CONFIG_DIR=${CURRENT_DIR}/data node linkedin-automation.js run && cd ..

scrape-profiles:
	cd linkedin_automation && CONFIG_DIR=${CURRENT_DIR}/data node linkedin-automation.js scrape_profiles $(if $(LIMIT),--limit $(LIMIT),) && cd ..

run:
	DATA_DIR=${CURRENT_DIR}/data uv run python src/search_service.py

italy-clicker:
	uv run python schengen_italy_automation/book_appointment.py

hungary-clicker:
	uv run python schengen_italy_automation/hungary_book_appointment.py
