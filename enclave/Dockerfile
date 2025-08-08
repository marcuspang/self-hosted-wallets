# Nitro Enclave Application Dockerfile
FROM public.ecr.aws/amazonlinux/amazonlinux:2

# Install dependencies
RUN yum update -y && \
    yum install -y nodejs npm git gcc-c++ make python3 && \
    yum clean all

# Set up working directory
WORKDIR /app

# Copy package.json first for better caching
COPY package.json package-lock.json* ./

# Install Node.js dependencies
RUN npm ci --only=production

# Copy application code
COPY src/ ./src/
COPY tsconfig.json ./

# Build TypeScript
RUN npm run build

# Create non-root user for security
RUN useradd -m -s /bin/bash enclaveuser
USER enclaveuser

# Expose the internal communication port
EXPOSE 8080

# Start the enclave application
CMD ["node", "dist/index.js"]