# Build stage
FROM node:20-alpine AS build

WORKDIR /app

# Receive the API URL at build time so Vite can bake it into the bundle.
# VITE_* variables are public — never pass secrets here.
ARG VITE_API_BASE_URL=http://localhost:8000
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

COPY package.json .
RUN npm install

COPY . .
RUN npm run build

# Serve stage — minimal nginx to serve the static files
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
