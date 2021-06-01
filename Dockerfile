FROM mhart/alpine-node:16
WORKDIR /test
ADD . /test/
RUN yarn