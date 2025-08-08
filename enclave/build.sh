#!/bin/bash

# Nitro Enclave Build Script
# This script builds the enclave container image and converts it to an EIF file

set -e

ENCLAVE_NAME="wallet-enclave"
IMAGE_TAG="latest"
EIF_FILE="${ENCLAVE_NAME}.eif"

echo "🔨 Building Nitro Enclave for Wallet Operations"
echo "================================================"

# Check if we're running on an EC2 instance with Nitro support
if [ ! -f /dev/nitro_enclaves ]; then
    echo "❌ Error: Not running on a Nitro Enclave-enabled instance"
    echo "   This script must run on an EC2 instance with Nitro Enclaves enabled"
    echo "   Use the backend API to deploy enclaves to proper EC2 instances"
    exit 1
fi

# Check if nitro-cli is installed
if ! command -v nitro-cli &> /dev/null; then
    echo "❌ Error: nitro-cli not found"
    echo "   Install Nitro Enclaves CLI: sudo amazon-linux-extras install aws-nitro-enclaves-cli"
    exit 1
fi

# Check if Docker is installed and running
if ! command -v docker &> /dev/null; then
    echo "❌ Error: Docker not found"
    echo "   Install Docker: sudo yum install docker"
    exit 1
fi

if ! sudo systemctl is-active --quiet docker; then
    echo "🐳 Starting Docker service..."
    sudo systemctl start docker
fi

# Build the Docker image
echo "📦 Building Docker image..."
sudo docker build -t ${ENCLAVE_NAME}:${IMAGE_TAG} .

# Check if image was built successfully
if ! sudo docker images | grep -q ${ENCLAVE_NAME}; then
    echo "❌ Error: Docker image build failed"
    exit 1
fi

echo "✅ Docker image built successfully"

# Convert Docker image to EIF (Enclave Image Format)
echo "🔄 Converting to EIF format..."
sudo nitro-cli build-enclave \
    --docker-uri ${ENCLAVE_NAME}:${IMAGE_TAG} \
    --output-file ${EIF_FILE}

# Check if EIF was created successfully
if [ ! -f ${EIF_FILE} ]; then
    echo "❌ Error: EIF file creation failed"
    exit 1
fi

echo "✅ Enclave built successfully!"
echo "   EIF file: ${EIF_FILE}"

# Display enclave measurements
echo ""
echo "🔐 Enclave Measurements:"
sudo nitro-cli describe-eif --eif-path ${EIF_FILE}

# Display EIF file information
echo ""
echo "📊 EIF File Information:"
ls -lh ${EIF_FILE}

echo ""
echo "🚀 Build complete!"
echo "   EIF file ready for deployment"
echo "   Use deploy.sh to run the enclave or the API to deploy remotely"