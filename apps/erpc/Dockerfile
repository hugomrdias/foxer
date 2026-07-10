# eRPC hardcodes http.Client.Timeout to 60s, which kills large archive responses
# (e.g. eth_getBlockReceipts) before upstream failsafe timeouts apply.
# Rebuild erpc-server with Timeout: 0 so only request-context deadlines apply.
FROM golang:1.26-alpine AS erpc-builder

WORKDIR /build
RUN apk add --no-cache git

ARG ERPC_COMMIT=45656d6
RUN git clone https://github.com/erpc/erpc.git . \
  && git checkout "${ERPC_COMMIT}"

RUN sed -i \
  -e 's/Timeout: 60 \* time.Second,/Timeout: 0,/' \
  clients/http_json_rpc_client.go \
  clients/proxy_pool_registry.go

RUN go mod download
ENV CGO_ENABLED=0 GOOS=linux
RUN go build -ldflags="-w -s" -o erpc-server ./cmd/erpc/main.go

FROM ghcr.io/erpc/erpc:latest
COPY --from=erpc-builder /build/erpc-server /erpc-server
COPY erpc.ts /root/erpc.ts
# 4000 -> eRPC
# 4001 -> Monitoring
# EXPOSE 4000 4001
EXPOSE 4000
CMD ["/erpc-server"]
