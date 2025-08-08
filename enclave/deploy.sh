#!/bin/bash

# Nitro Enclave Deployment Script
# This script runs the enclave with proper configuration

set -e

ENCLAVE_NAME="wallet-enclave"
EIF_FILE="${ENCLAVE_NAME}.eif"
MEMORY_MB=1024
CPU_COUNT=2
CID=10
DEBUG_MODE=true

echo "🚀 Deploying Nitro Enclave"
echo "=========================="

# Check if we're running on a Nitro Enclave-enabled instance
if [ ! -f /dev/nitro_enclaves ]; then
    echo "❌ Error: Not running on a Nitro Enclave-enabled instance"
    echo "   This script must run on an EC2 instance with Nitro Enclaves enabled"
    exit 1
fi

# Check if nitro-cli is installed
if ! command -v nitro-cli &> /dev/null; then
    echo "❌ Error: nitro-cli not found"
    echo "   Install Nitro Enclaves CLI: sudo amazon-linux-extras install aws-nitro-enclaves-cli"
    exit 1
fi

# Check if EIF file exists
if [ ! -f ${EIF_FILE} ]; then
    echo "❌ EIF file not found: ${EIF_FILE}"
    echo "   Run build.sh first to create the enclave image"
    exit 1
fi

# Check if Nitro Enclaves allocator service is running
if ! sudo systemctl is-active --quiet nitro-enclaves-allocator; then
    echo "🔧 Starting Nitro Enclaves allocator service..."
    sudo systemctl start nitro-enclaves-allocator
fi

# Terminate any existing enclaves
echo "🧹 Cleaning up existing enclaves..."
sudo nitro-cli terminate-enclave --all || true

# Wait a moment for cleanup
sleep 2

# Display current enclave allocator configuration
echo "📊 Current allocator configuration:"
cat /etc/nitro_enclaves/allocator.yaml || echo "No allocator config found"

# Start the enclave
echo "🎯 Starting enclave..."
echo "   Memory: ${MEMORY_MB}MB"
echo "   CPUs: ${CPU_COUNT}"
echo "   CID: ${CID}"
echo "   Debug mode: ${DEBUG_MODE}"

if [ "$DEBUG_MODE" = true ]; then
    ENCLAVE_OUTPUT=$(sudo nitro-cli run-enclave \
        --eif-path ${EIF_FILE} \
        --memory ${MEMORY_MB} \
        --cpu-count ${CPU_COUNT} \
        --debug-mode \
        --enclave-cid ${CID} 2>&1)
else
    ENCLAVE_OUTPUT=$(sudo nitro-cli run-enclave \
        --eif-path ${EIF_FILE} \
        --memory ${MEMORY_MB} \
        --cpu-count ${CPU_COUNT} \
        --enclave-cid ${CID} 2>&1)
fi

# Extract enclave ID from output
ENCLAVE_ID=$(echo "$ENCLAVE_OUTPUT" | grep -o '"EnclaveID": "[^"]*"' | sed 's/"EnclaveID": "\(.*\)"/\1/' || true)

if [ -z "$ENCLAVE_ID" ]; then
    echo "❌ Failed to start enclave!"
    echo "Output: $ENCLAVE_OUTPUT"
    exit 1
fi

echo "✅ Enclave started successfully!"
echo "   Enclave ID: ${ENCLAVE_ID}"
echo "   CID: ${CID}"
echo "   Memory: ${MEMORY_MB}MB"
echo "   CPUs: ${CPU_COUNT}"

# Wait a moment for enclave to initialize
sleep 3

# Show enclave status
echo ""
echo "📊 Enclave Status:"
sudo nitro-cli describe-enclaves

# Test enclave connectivity
echo ""
echo "🧪 Testing enclave connectivity..."
if [ "$DEBUG_MODE" = true ]; then
    echo "   In debug mode - console output available"
    echo "   Run: sudo nitro-cli console --enclave-id ${ENCLAVE_ID}"
else
    echo "   Production mode - no console access"
fi

echo ""
echo "🔍 Useful commands:"
echo "   Check status: sudo nitro-cli describe-enclaves"
echo "   View logs: sudo nitro-cli console --enclave-id ${ENCLAVE_ID}"
echo "   Stop enclave: sudo nitro-cli terminate-enclave --enclave-id ${ENCLAVE_ID}"
echo ""
echo "🎉 Deployment complete!"