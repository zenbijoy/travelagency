#!/bin/bash
# ==============================================================================
# scripts/00_provision_and_tune_host.sh
# Provisions Ubuntu 24.04 LTS (ARM64) for High-Concurrency Map & WebSocket Stack
# ==============================================================================
set -euo pipefail

echo "==> 1. Updating base operating system and installing core dependencies..."
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl wget git zstd jq python3-pip python3-venv \
  openjdk-21-jre-headless docker.io docker-compose-v2

sudo usermod -aG docker "$USER"

echo "==> 2. Applying kernel tuning for OpenSearch (Photon 1.0) & 50K+ WebSockets..."
sudo tee /etc/sysctl.d/99-spatial-platform.conf > /dev/null << 'EOF'
# Required by OpenSearch (Photon 1.0) - prevents mmap allocation failure
vm.max_map_count = 262144
vm.swappiness = 1

# High-concurrency WebSocket & API TCP stack tuning
fs.file-max = 2097152
net.core.somaxconn = 65535
net.core.netdev_max_backlog = 16384
net.ipv4.tcp_max_syn_backlog = 16384
net.ipv4.ip_local_port_range = 1024 65535
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_slow_start_after_idle = 0
net.core.default_qdisc = fq
net.ipv4.tcp_congestion_control = bbr

# Sized for 100K+ active + TIME_WAIT connections (~150-200 MB kernel RAM)
net.netfilter.nf_conntrack_max = 524288
EOF
sudo sysctl --system

echo "==> 3. Raising Docker file descriptor limits and capping JSON log sizes..."
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json > /dev/null << 'EOF'
{
  "default-ulimits": {
    "nofile": { "Name": "nofile", "Hard": 131072, "Soft": 131072 }
  },
  "log-driver": "json-file",
  "log-opts": { "max-size": "20m", "max-file": "3" }
}
EOF
sudo systemctl restart docker

mkdir -p ~/spatial-engine/{data,tiles,valhalla_data,vroom,photon_data,typesense_data,tile38_data,centrifugo,nginx,certs,scripts}
echo "==> Host provisioned and tuned successfully!"
