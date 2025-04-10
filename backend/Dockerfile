FROM node:18

WORKDIR /backend


COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 7000

CMD ["node","server.js"]

