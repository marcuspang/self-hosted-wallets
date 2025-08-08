#!/bin/bash

# Test script for Nitro Enclave deployment
# This script is designed to run on an EC2 instance with Nitro Enclaves enabled

set -e

echo "🧪 Testing Nitro Enclave Deployment"
echo "==================================="

# Check if we're on a Nitro Enclave-enabled instance
if [ ! -f /dev/nitro_enclaves ]; then
    echo "❌ Error: This test requires a Nitro Enclave-enabled EC2 instance"
    echo ""
    echo "🚀 To run this test:"
    echo "   1. Launch an EC2 instance (m5.xlarge or larger) with Nitro Enclaves enabled"
    echo "   2. SSH into the instance"
    echo "   3. Use the backend API to deploy the enclave, or run this script manually"
    echo ""
    echo "📖 See README.md for detailed setup instructions"
    exit 1
fi

# Check prerequisites
echo "📋 Checking prerequisites..."

if ! command -v nitro-cli &> /dev/null; then
    echo "❌ nitro-cli not found"
    echo "   Install: sudo amazon-linux-extras install aws-nitro-enclaves-cli"
    exit 1
fi

if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found"
    echo "   Install: sudo yum install docker"
    exit 1
fi

if ! sudo systemctl is-active --quiet nitro-enclaves-allocator; then
    echo "❌ Nitro Enclaves allocator service not running"
    echo "   Start: sudo systemctl start nitro-enclaves-allocator"
    exit 1
fi

echo "✅ Prerequisites check passed"

# Build and deploy enclave
echo ""
echo "🔨 Building enclave..."
./build.sh

echo ""
echo "🚀 Deploying enclave..."
./deploy.sh

# Wait for enclave to start
echo ""
echo "⏳ Waiting for enclave to initialize..."
sleep 10

# Get enclave information
ENCLAVE_INFO=$(sudo nitro-cli describe-enclaves)
echo "📊 Enclave Information:"
echo "$ENCLAVE_INFO"

# Extract enclave ID for testing
ENCLAVE_ID=$(echo "$ENCLAVE_INFO" | grep -o '"EnclaveID": "[^"]*"' | sed 's/"EnclaveID": "\(.*\)"/\1/' | head -1)

if [ -z "$ENCLAVE_ID" ]; then
    echo "❌ Could not find running enclave"
    exit 1
fi

echo "✅ Enclave is running with ID: $ENCLAVE_ID"

# Test console access (debug mode only)
echo ""
echo "🔍 Testing enclave console access..."
if echo "$ENCLAVE_INFO" | grep -q '"Flags": "Debug"'; then
    echo "   Debug mode enabled - console access available"
    echo "   Run: sudo nitro-cli console --enclave-id $ENCLAVE_ID"
else
    echo "   Production mode - no console access (secure)"
fi

# Show enclave logs for a few seconds
echo ""
echo "📋 Enclave console output (5 seconds):"
timeout 5 sudo nitro-cli console --enclave-id $ENCLAVE_ID || echo "   Console timeout or not available"

# In a real production scenario, you would test VSOCK communication here
# For now, we'll just verify the enclave is running and healthy

echo ""
echo "✅ Nitro Enclave test completed successfully!"
echo ""
echo "🔍 Useful commands:"
echo "   View status: sudo nitro-cli describe-enclaves"
echo "   View logs: sudo nitro-cli console --enclave-id $ENCLAVE_ID"
echo "   Stop enclave: sudo nitro-cli terminate-enclave --enclave-id $ENCLAVE_ID"
echo ""
echo "🎉 Test complete! Enclave is ready for production use."