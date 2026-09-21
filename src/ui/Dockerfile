# Production image: build the bundle, then serve it from a tiny nginx.
# The site used to run the Vite dev server in prod, which made every visit
# fetch ~130 unbundled modules + dev React before any image was requested.
# For local development run `npm run dev` directly (port 5173).
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
