FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV DISPLAY=:99

# Instalar todas las deps de una vez con el metapaquete
RUN apt-get update && apt-get install -y \
  ubuntu-desktop-minimal \
  xvfb \
  wget \
  ca-certificates \
  nodejs \
  npm \
  && rm -rf /var/lib/apt/lists/*

RUN wget -q \
  "https://github.com/OrcaSlicer/OrcaSlicer/releases/download/v2.3.2/OrcaSlicer_Linux_AppImage_Ubuntu2404_V2.3.2.AppImage" \
  -O /usr/local/bin/OrcaSlicer && \
  chmod +x /usr/local/bin/OrcaSlicer

RUN cd /opt && \
  /usr/local/bin/OrcaSlicer --appimage-extract && \
  mv squashfs-root orcaslicer && \
  ln -sf /opt/orcaslicer/AppRun /usr/local/bin/orcaslicer-bin

COPY scripts/slice.sh /usr/local/bin/slice.sh
RUN chmod +x /usr/local/bin/slice.sh

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

CMD ["node", "index.js"]