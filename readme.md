# simple-chat-api

This is a small backend service for serving a simple chat application
using Server-Sent events.

## Running

```shell
$ npm install
$ npm start
```

## Testing locally

You can test the application by running it locally:

```shell
$ npm install
$ npm run dev
```

Subscribe to the chat messages in one window:

```shell
$ curl localhost:3000/subscribe
```

Then use a different window to send chat messages:

```shell
$ curl -H 'Content-Type:application/json' -X POST -d '{"nick":"yourCoolNickname","message":"Test!"}' localhost:3000/sendMessage
```
