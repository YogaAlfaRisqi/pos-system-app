FROM node:latest

WORKDIR /packages/backend

COPY package.json .

RUN pnpm install


COPY . .


EXPOSE 3000


CMD [ "pnpm", "run", "dev" ]
