FROM ghcr.io/erpc/erpc:latest
COPY erpc.ts /root/erpc.ts
# 4000 -> eRPC
# 4001 -> Monitoring
EXPOSE 4000 4001
CMD ["/erpc-server"]