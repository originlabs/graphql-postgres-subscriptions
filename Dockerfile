FROM node:18-alpine
WORKDIR /test
ADD . /test/
RUN npm install
