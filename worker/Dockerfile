FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV DISPLAY=:99

RUN apt-get update && apt-get install -y \
  # OrcaSlicer AppImage runtime deps
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
  # libbz2 — required by OrcaSlicer v2.3.2 AppImage (missing in base Ubuntu 24.04)
  libbz2-1.0 \
  # Virtual display (required by OrcaSlicer CLI even in headless mode)
  xvfb \
  # DBus (OrcaSlicer needs it at startup)
  dbus \
  libdbus-1-3 \
  # Download tools
  wget \
  ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Download OrcaSlicer v2.3.2 AppImage (amd64, Ubuntu 24.04 build)
# Filename changed in v2.3.1+: now includes Ubuntu2404 in the name
RUN wget -q \
  "https://github.com/OrcaSlicer/OrcaSlicer/releases/download/v2.3.2/OrcaSlicer_Linux_AppImage_Ubuntu2404_V2.3.2.AppImage" \
  -O /usr/local/bin/OrcaSlicer && \
  chmod +x /usr/local/bin/OrcaSlicer

# Extract AppImage so it runs without FUSE (Railway containers lack FUSE support)
RUN cd /opt && \
  /usr/local/bin/OrcaSlicer --appimage-extract && \
  mv squashfs-root orcaslicer && \
  ln -sf /opt/orcaslicer/AppRun /usr/local/bin/orcaslicer-bin

# Wrapper script: starts Xvfb, runs slicer, kills Xvfb
COPY scripts/slice.sh /usr/local/bin/slice.sh
RUN chmod +x /usr/local/bin/slice.sh

WORKDIR /app
COPY package*.json ./
RUN apt-get update && apt-get install -y nodejs npm && rm -rf /var/lib/apt/lists/*
RUN npm ci --omit=dev

COPY . .

CMD ["node", "index.js"]
