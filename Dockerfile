FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32

ARG BUILD_VERSION=1.0.0
ARG BUILD_REVISION=unavailable
ARG BUILD_CREATED_AT=1970-01-01T00:00:00Z
ARG BASE_IMAGE_INDEX_DIGEST=sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32
ARG BASE_IMAGE_MANIFEST_DIGEST=sha256:76789712cd1ae89a1225eac9077010d68987a423588042dac30446f502f1858c
ARG SOURCE_DATE_EPOCH=0

LABEL org.opencontainers.image.title="Hair Growth API" \
      org.opencontainers.image.description="Private hair growth profile and haircut storage service" \
      org.opencontainers.image.version="${BUILD_VERSION}" \
      org.opencontainers.image.revision="${BUILD_REVISION}" \
      org.opencontainers.image.created="${BUILD_CREATED_AT}" \
      org.opencontainers.image.source="https://github.com/Ding-Ding-Projects/HairGrowthEstimator" \
      org.opencontainers.image.base.name="docker.io/library/node:22-alpine" \
      org.opencontainers.image.base.index.digest="${BASE_IMAGE_INDEX_DIGEST}" \
      org.opencontainers.image.base.digest="${BASE_IMAGE_MANIFEST_DIGEST}" \
      org.opencontainers.image.licenses="MIT" \
      com.dingdingprojects.source-date-epoch="${SOURCE_DATE_EPOCH}"

WORKDIR /opt/hair-growth

COPY --chown=node:node . ./server
RUN mkdir -p /data && chown node:node /data

USER node:node

ENV NODE_ENV=production \
    HAIR_HOST=0.0.0.0 \
    HAIR_PORT=4782 \
    HAIR_VERSION=${BUILD_VERSION} \
    HAIR_DATA_FILE=/data/hair-growth.json

EXPOSE 4782
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["node", "-e", "const http=require('node:http');const request=http.get('http://127.0.0.1:4782/health',(response)=>{response.resume();process.exit(response.statusCode===200?0:1)});request.setTimeout(2000,()=>request.destroy(new Error('timeout')));request.on('error',()=>process.exit(1));"]

STOPSIGNAL SIGTERM
CMD ["node", "server/index.js"]
