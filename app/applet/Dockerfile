FROM node:22-slim

# Set the working directory
WORKDIR /app

# Copy the entire monorepo into the container
COPY . .

# Install all dependencies (including devDependencies required for the build)
RUN npm ci

# Run the build process for all workspaces
RUN npm run build

# Set environment variables for production
ENV NODE_ENV=production
ENV PORT=8080

# Expose port 8080 for Google Cloud Run
EXPOSE 8080

# Start the API server
CMD ["npm", "start"]
