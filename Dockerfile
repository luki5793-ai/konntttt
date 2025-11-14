# Use Apify base image with Playwright support
FROM apify/actor-node-playwright-chrome:20

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --include=optional

# Copy source code
COPY . ./

# Run the actor
CMD npm start
