FROM node:13-alpine

MAINTAINER Benedicte Emilie Brækken <b@brkn.io>

RUN apk update && apk add curl

WORKDIR /usr/src/app

COPY package.json /usr/src/app/
COPY package-lock.json /usr/src/app/
COPY tsconfig.json /usr/src/app/

RUN cd /usr/src/app && npm install

COPY src /usr/src/app/src

HEALTHCHECK --interval=5s --timeout=3s \
    CMD curl -f http://localhost:$PORT/health || exit 1

CMD [ "npm", "start" ]
