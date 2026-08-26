FROM node:22-alpine
WORKDIR /opt/hair-growth
COPY server ./server
RUN mkdir -p /data && chown -R node:node /opt/hair-growth /data
USER node
ENV HAIR_HOST=127.0.0.1 \
    HAIR_PORT=4782 \
    HAIR_DATA_FILE=/data/hair-growth.json
EXPOSE 4782
VOLUME ["/data"]
CMD ["node", "server/index.js"]
