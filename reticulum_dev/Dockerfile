ARG BUILD_FROM
FROM ${BUILD_FROM}

RUN apk add --no-cache \
    python3 \
    py3-pip \
    py3-setuptools \
    py3-wheel \
    bash

RUN python3 -m pip install \
    --no-cache-dir \
    --break-system-packages \
    rns==1.5.4 \
    lxmf==1.1.1

COPY rootfs /

RUN chmod +x \
    /etc/services.d/reticulum/run \
    /etc/services.d/reticulum-web/run \
    /etc/services.d/reticulum-node/run \
    /opt/reticulum-web/server.py \
    /opt/reticulum-node/node.py

LABEL \
    io.hass.name="Reticulum" \
    io.hass.description="Reticulum Network Stack for Home Assistant"
