FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV DISPLAY=:99

RUN apt-get update && apt-get install -y \
  libgl1 \
  libglu1-mesa \
  libxrender1 \
  libxi6 \
  libxext6 \
  libx11-6 \
  libxrandr2 \
  libxinerama1 \
  libxcursor1 \
  libfuse2 \
  libbz2-1.0 \
  libpango-1.0-0 \
  libpangoft2-1.0-0 \
  libpangocairo-1.0-0 \
  libcairo2 \
  libatk1.0-0 \
  libgdk-pixbuf-2.0-0 \
  libgtk-3-0 \
  libglib2.0-0 \
  libgstreamer-1.0-0 \
  libgstreamer-plugins-base1.0-0 \
  libwebkit2gtk-4.1-0 \
  libsoup-3.0-0 \
  libjpeg-turbo8 \
  libpng16-16 \
  libfreetype6 \
  libfontconfig1 \
  libharfbuzz0b \
  libwayland-client0 \
  libwayland-egl1 \
  libwayland-cursor0 \
  libxkbcommon0 \
  libxkbcommon-x11-0 \
  xvfb \
  dbus \
  libdbus-1-3 \
  wget \
  ca-certificates \
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
RUN apt-get update && apt-get install -y nodejs npm && rm -rf /var/lib/apt/lists/*
RUN npm ci --omit=dev

COPY . .

CMD ["node", "index.js"]