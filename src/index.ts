import express from "express";
import { v4 as uuidv4 } from "uuid";
import cors from "cors";

type SendMessageForm = {
  message: string;
  nick: string;
};

const PORT = process.env["PORT"] || undefined;

const CORS_ALLOWED_ORIGIN =
  process.env["CORS_ALLOWED_ORIGIN"] || "http://localhost:3001";

if (PORT === undefined) {
  throw Error("Missing PORT");
}

const app = express();
let openConnections: { [key: string]: express.Response } = {};

let messages: string[] = [];

app.use(cors({ origin: CORS_ALLOWED_ORIGIN }));

app.get("/health", (req, res) => {
  res.send("ok");
});

app.post("/sendMessage", (req, res) => {
  const inputData = JSON.parse(req.body) as SendMessageForm;

  messages = [...messages.slice(1), inputData.message];

  sendMessageToClients(inputData.message);
});

app.get("/subscribe", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    Connection: "keep-alive",
    "Cache-Control": "no-cache",
  });

  // Send stored chats
  messages.forEach((chat) => {
    res.write(`id: chat-${Date.now()}\n`);
    res.write(`event: newChat\n`);
    res.write(`message: ${chat}\n\n`);
  });

  const clientId = uuidv4();
  openConnections[clientId] = res;

  // Remove connection on close
  req.on("close", () => {
    delete openConnections[clientId];
  });
});

const sendMessageToClients = (chat: string): void => {
  const messageId = Date.now();

  Object.keys(openConnections).forEach((clientId) => {
    openConnections[clientId].write(
      `id: chat-${messageId}\nevent: newChat\nmessage: ${chat}\n\n`
    );
  });
};

const init = async () => {
  app.listen(PORT, () => console.log(`Listening at http://localhost:${PORT}`));
};

init();
