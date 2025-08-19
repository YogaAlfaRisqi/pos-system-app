
FROM node:latest

# Set the working directory in the container
WORKDIR /packages/web-pos

# Copy the client package.json
COPY package.json .

# install dependencies 
RUN pnpm install

# copy everything from my code to the dockerimage
COPY . .


EXPOSE 5174


CMD ["npm","run", "dev"]