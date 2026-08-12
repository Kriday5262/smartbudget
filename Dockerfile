FROM node:22-slim

WORKDIR /app

COPY .output ./.output

ENV DB_PATH=/data/budget.db
ENV HOST=0.0.0.0
ENV PORT=9119

EXPOSE 9119
VOLUME /data

CMD ["node", ".output/server/index.mjs"]
