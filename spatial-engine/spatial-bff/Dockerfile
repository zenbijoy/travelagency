# Multi-stage build for ShopnoJatra Spatial BFF (Go 1.23 ARM64/AMD64)
FROM golang:1.23-alpine AS builder

WORKDIR /app

RUN apk add --no-cache git ca-certificates build-base

COPY go.mod ./
# Download dependencies
RUN go mod tidy

COPY . .

# Build static binary
RUN CGO_ENABLED=1 GOOS=linux go build -ldflags="-s -w" -o spatial-bff .

# Minimal runtime image
FROM alpine:3.20

WORKDIR /app
RUN apk add --no-cache ca-certificates tzdata

COPY --from=builder /app/spatial-bff /app/spatial-bff

EXPOSE 8080

ENTRYPOINT ["/app/spatial-bff"]
