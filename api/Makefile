EMULATOR_IMAGE   ?= gcr.io/google.com/cloudsdktool/google-cloud-cli:emulators
EMULATOR_PORT    ?= 8085
EMULATOR_NAME    ?= delivery-firestore-emulator
EMULATOR_PROJECT ?= delivery-local

# Unit packages only; the store suite needs the emulator (see test-integration).
UNIT_PKGS := ./internal/domain/... ./internal/config/... ./internal/auth/... \
	./internal/handlers/... ./internal/httpx/... ./internal/media/... ./cmd/seed/...

.PHONY: help run build fmt vet lint tidy test test-race bench test-integration \
	emulator emulator-stop emulator-logs rules-test image loadtest seed-admin

help:                ## list targets
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-18s %s\n", $$1, $$2}'

run:                 ## run the API locally
	go run ./cmd/server

build:               ## build the server binary
	CGO_ENABLED=0 go build -trimpath -o bin/server ./cmd/server

fmt:                 ## format sources
	gofmt -w .

vet:                 ## go vet
	go vet ./...

lint: vet            ## vet + staticcheck (if installed)
	@command -v staticcheck >/dev/null && staticcheck ./... || echo "staticcheck not installed, skipped"

tidy:                ## go mod tidy
	go mod tidy

test:                ## unit tests
	go test $(UNIT_PKGS)

test-race:           ## unit tests with the race detector
	go test -race $(UNIT_PKGS)

bench:               ## HTTP layer benchmarks
	go test ./internal/handlers/... -bench=. -benchmem -run='^$$'

test-integration:    ## full suite against the Firestore emulator (run `make emulator` first)
	FIRESTORE_EMULATOR_HOST=localhost:$(EMULATOR_PORT) GOOGLE_CLOUD_PROJECT=$(EMULATOR_PROJECT) \
		go test ./... -count=1

emulator:            ## start the Firestore emulator in Docker
	@docker rm -f $(EMULATOR_NAME) >/dev/null 2>&1 || true
	docker run -d --name $(EMULATOR_NAME) -p $(EMULATOR_PORT):$(EMULATOR_PORT) $(EMULATOR_IMAGE) \
		gcloud emulators firestore start --host-port=0.0.0.0:$(EMULATOR_PORT) --project=$(EMULATOR_PROJECT)
	@for i in $$(seq 1 60); do nc -z localhost $(EMULATOR_PORT) 2>/dev/null && { echo "emulator ready on :$(EMULATOR_PORT)"; exit 0; }; sleep 1; done; \
		echo "emulator did not start; see make emulator-logs" >&2; exit 1

emulator-stop:       ## stop the emulator
	@docker rm -f $(EMULATOR_NAME) >/dev/null 2>&1 || true

emulator-logs:       ## emulator logs
	docker logs $(EMULATOR_NAME)

rules-test:          ## security-rules tests (needs a JDK)
	npm test --prefix ../rules-tests

image:               ## build the linux/amd64 image: make image IMAGE=<registry>/<name>:<tag>
	docker build --platform linux/amd64 -t $(IMAGE) .

loadtest:            ## read-only load: make loadtest BASE_URL=... TOKEN=...
	go run ./cmd/loadtest -base-url=$(BASE_URL) -token=$(TOKEN) \
		-concurrency=$(or $(CONCURRENCY),10) -duration=$(or $(DURATION),30s)

seed-admin:          ## create the first superadmin; password is read from stdin
	GOOGLE_CLOUD_PROJECT=$(GOOGLE_CLOUD_PROJECT) go run ./cmd/seed -email=$(EMAIL)
