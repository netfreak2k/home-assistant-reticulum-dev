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
    rns

COPY rootfs /

RUN chmod +x \
    /etc/services.d/reticulum/run \
    /etc/services.d/reticulum-web/run \
    /opt/reticulum-web/server.py

LABEL \
    io.hass.name="Reticulum" \
    io.hass.description="Reticulum Network Stack for Home Assistant"
