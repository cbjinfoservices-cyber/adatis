ARG GO_IMAGE=golang:1.26.10-alpine@sha256:87c65a688975c0b1d4585d204874c45ca78354670e3a5f11368c5a492303d696
FROM --platform=$BUILDPLATFORM ${GO_IMAGE} AS builder

ARG TARGETARCH
ARG LOCAL_PATH_COMMIT=49b2be8e26d6d34c9afaa21fa33108d2e82f8955

RUN apk add --no-cache git
WORKDIR /src
RUN git init \
  && git remote add origin https://github.com/rancher/local-path-provisioner.git \
  && git fetch --depth 1 origin "${LOCAL_PATH_COMMIT}" \
  && git checkout --detach FETCH_HEAD \
  && test "$(git rev-parse HEAD)" = "${LOCAL_PATH_COMMIT}"

RUN GOFLAGS=-mod=mod go get \
    github.com/klauspost/compress@v1.18.7 \
    golang.org/x/net@v0.62.0 \
    golang.org/x/text@v0.43.0 \
  && go mod vendor \
  && go test ./... \
  && mkdir -p /out \
  && CGO_ENABLED=0 GOOS=linux GOARCH="${TARGETARCH}" \
    go build -mod=vendor \
      -ldflags "-X main.VERSION=v0.0.37-asp1 -extldflags -static -s -w" \
      -o /out/local-path-provisioner

FROM alpine:3.24@sha256:f59abe656b692d901e184be3445e084786602108599d2a51d229c0f5a48c71bf AS certificates
RUN apk add --no-cache ca-certificates

FROM scratch
COPY --from=certificates /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=builder /out/local-path-provisioner /usr/bin/local-path-provisioner

ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
LABEL org.opencontainers.image.source="https://github.com/rancher/local-path-provisioner" \
  org.opencontainers.image.revision="49b2be8e26d6d34c9afaa21fa33108d2e82f8955" \
  org.opencontainers.image.version="v0.0.37-asp1"

CMD ["/usr/bin/local-path-provisioner"]
