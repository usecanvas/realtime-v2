FROM buildpack-deps:xenial

RUN locale-gen en_US.UTF-8
ENV LANG=en_US.UTF-8

WORKDIR /tmp
RUN wget https://nodejs.org/dist/v7.3.0/node-v7.3.0.tar.gz && \
    tar -xzvf node-v7.3.0.tar.gz && \
    cd node-v7.3.0 && \
    ./configure && \
    make && \
    make install
RUN apt-get update
RUN apt-get install -y ruby-full

RUN rm -r /tmp/node-v7.3.0*

ADD . /app
WORKDIR /app

RUN npm install
RUN gem install foreman
CMD foreman start
