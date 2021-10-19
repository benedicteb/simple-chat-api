import express from "express";
import { v4 as uuidv4 } from "uuid";
import cors from "cors";
import sha256 from "crypto-js/sha256";

type SendMessageForm = {
  message: string;
  nick: string;
};

type Message = {
  text: string;
  sender: string;
  messageID: string;
};

const PORT = process.env["PORT"] || undefined;
const API_CODE = process.env["API_CODE"] || "abc123";

const CORS_ALLOWED_ORIGIN =
  process.env["CORS_ALLOWED_ORIGIN"] || "http://localhost:3001";

if (PORT === undefined) {
  throw Error("Missing PORT");
}

const app = express();
let openConnections: { [key: string]: express.Response } = {};

let messages: Message[] = [];

app.use(cors({ origin: CORS_ALLOWED_ORIGIN }));
app.use(express.json());

app.get("/health", (req, res) => {
  res.send("ok");
});

app.post("/sendMessage", (req, res) => {
  const authorizationCode = req.header("Authorization");

  if (authorizationCode != API_CODE) {
    res.status(401);
    res.send("Unauthorized");
    res.end();

    return;
  }

  const inputData = req.body as SendMessageForm;

  if (inputData.nick === undefined || inputData.message === undefined) {
    res.status(400);
    res.send("Malformed request");
    res.end();

    return;
  }

  const message = constructMessage(inputData);

  messages = [...messages.slice(1), message];

  sendMessageToClients(message);

  res.write("ok");
  res.end();
});

app.get("/subscribe", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    Connection: "keep-alive",
    "Cache-Control": "no-cache",
  });
  res.flushHeaders();

  const clientId = uuidv4();
  openConnections[clientId] = res;

  // Send stored chats
  messages.forEach((message) => {
    sendMessage(message, clientId);
  });

  // Remove connection on close
  req.on("close", () => {
    openConnections[clientId].end();
    delete openConnections[clientId];

    console.log(`Dropped client '${clientId}'`);
  });
});

const sendMessageToClients = (message: Message): void => {
  Object.keys(openConnections).forEach((clientId) => {
    sendMessage(message, clientId);
  });
};

const constructMessage = (form: SendMessageForm): Message => {
  return {
    text: form.message,
    sender: form.nick,
    messageID: sha256(`${Date.now()}-${form.nick}-${form.message}`).toString(),
  };
};

const sendMessage = (message: Message, clientId: string) => {
  openConnections[clientId].write(
    `id: chat-${message.messageID}\nevent: messageReceived\nnickname: ${message.sender}\nmessage: ${message.text}\n\n`
  );
};

const logActiveClients = () => {
  const noOpenConnections = Object.keys(openConnections).length;
  console.log(`Currently ${noOpenConnections} open connections`);

  setTimeout(logActiveClients, 5 * 1000);
};

const init = async () => {
  app.listen(PORT, () => console.log(`Listening at http://localhost:${PORT}`));

  logActiveClients();
};

init();
