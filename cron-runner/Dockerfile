FROM alpine:3.20
RUN apk add --no-cache curl bash
WORKDIR /app
COPY run.sh ./
RUN chmod +x run.sh
CMD ["/app/run.sh"]
