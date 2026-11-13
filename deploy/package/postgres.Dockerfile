ARG POSTGRES_BASE_IMAGE=postgres:16.15-alpine@sha256:ac838714b7d794185a866e5a6b479b954e7d8a070568aa0acac6fe07c3070bf5
FROM ${POSTGRES_BASE_IMAGE} AS postgres-rootfs

USER root
RUN apk upgrade --no-cache \
  && apk add --no-cache su-exec \
  && rm -f /usr/local/bin/gosu \
  && ln -s /sbin/su-exec /usr/local/bin/gosu

FROM scratch
COPY --from=postgres-rootfs / /

ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  LANG=en_US.utf8 \
  PG_MAJOR=16 \
  PG_VERSION=16.15 \
  PGDATA=/var/lib/postgresql/data

STOPSIGNAL SIGINT
EXPOSE 5432
VOLUME /var/lib/postgresql/data
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["postgres"]
