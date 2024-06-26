import express from "express";
import { v4 as uuidv4 } from "uuid";
import cors from "cors";
import sha256 from "crypto-js/sha256";

type SendMessageForm = {
  message: string;
  nick: string;
  avatarUrl: string;
};

type Message = {
  text: string;
  sender: string;
  messageID: string;
  avatarUrl: string;
};

type Event = {
  id: string;
  name: EventType;
  data: string;
};

enum EventType {
  MESSAGE = "messageReceived",
  ACTIVE_CLIENTS = "activeClients",
  PING = "ping",
}

const PORT = process.env["PORT"] || undefined;
const API_CODE = process.env["API_CODE"] || "abc123";

const CORS_ALLOWED_ORIGINS = [
  "http://localhost:8000",
  "http://192.168.1.238:8000",
];

if (process.env["CORS_ALLOWED_ORIGIN"]) {
  CORS_ALLOWED_ORIGINS.push(process.env["CORS_ALLOWED_ORIGIN"]);
}

if (PORT === undefined) {
  throw Error("Missing PORT");
}

const app = express();
let openConnections: { [key: string]: express.Response } = {};

let messages: Message[] = [];

app.use(cors({ origin: CORS_ALLOWED_ORIGINS }));
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

app.get("/subscribe/1", (req, res) => {
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

  sendEventToClients(constructActiveClientsEvent());

  // Remove connection on close
  req.on("close", () => {
    openConnections[clientId].end();
    delete openConnections[clientId];

    sendEventToClients(constructActiveClientsEvent());

    console.log(`Dropped client '${clientId}'`);
  });
});

const sendMessageToClients = (message: Message): void => {
  Object.keys(openConnections).forEach((clientId) => {
    sendMessage(message, clientId);
  });
};

const sendEventToClients = (event: Event): void => {
  Object.keys(openConnections).forEach((clientId) => {
    sendEvent(event, clientId);
  });
};

const constructActiveClientsEvent = (): Event => {
  return {
    id: sha256(`active-clients-${Date.now()}`).toString(),
    name: EventType.ACTIVE_CLIENTS,
    data: `${Object.keys(openConnections).length}`,
  };
};

const constructMessage = (form: SendMessageForm): Message => {
  return {
    text: form.message,
    sender: form.nick,
    avatarUrl: form.avatarUrl || "/default_avatar.png",
    messageID: sha256(`${Date.now()}-${form.nick}-${form.message}`).toString(),
  };
};

const sendMessage = (message: Message, clientId: string) => {
  openConnections[clientId].write(
    `id: ${message.messageID}\nevent: messageReceived\ndata: ${JSON.stringify(
      message
    )}\n\n`
  );
};

const sendEvent = (event: Event, clientId: string) => {
  openConnections[clientId].write(
    `id: ${event.id}\nevent: ${event.name}\ndata: ${event.data}\n\n`
  );
};

const sendKeepAlive = () => {
  Object.keys(openConnections).forEach((clientId) => {
    openConnections[clientId].write(
      `id: ${sha256(
        `ping-${Date.now()}`
      ).toString()}\nevent: ping\ndata: ok\n\n`
    );
  });

  setTimeout(sendKeepAlive, 30 * 1000);
};

const logActiveClients = () => {
  const noOpenConnections = Object.keys(openConnections).length;
  console.log(`Currently ${noOpenConnections} open connections`);

  setTimeout(logActiveClients, 5 * 1000);
};

const init = async () => {
  app.listen(PORT, () => console.log(`Listening at http://localhost:${PORT}`));

  logActiveClients();
  sendKeepAlive();
};

init();
