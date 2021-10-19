import express from "express";
import Twitter from "twitter";
import {
  Column,
  DataType,
  Model,
  Sequelize,
  Table
} from "sequelize-typescript";
import { v4 as uuidv4 } from "uuid";
import cors from "cors";

@Table
class Tweet extends Model<Tweet> {
  @Column(DataType.TEXT)
  text!: string;

  @Column(DataType.TEXT)
  authorUsername!: string;

  @Column(DataType.TEXT)
  profilePictureUrl!: string;
}

@Table
class Client extends Model<Client> {
  @Column(DataType.TEXT)
  clientId!: string;
}

const TWITTER_SEARCH_TERM = "javascript";

const DATABASE_URL = process.env["DATABASE_URL"];
const PORT = process.env["PORT"];

const TWITTER_CONSUMER_KEY = process.env["TWITTER_CONSUMER_KEY"];
const TWITTER_CONSUMER_SECRET = process.env["TWITTER_CONSUMER_SECRET"];
const TWITTER_ACCESS_TOKEN_KEY = process.env["TWITTER_ACCESS_TOKEN_KEY"];
const TWITTER_ACCESS_TOKEN_SECRET = process.env["TWITTER_ACCESS_TOKEN_SECRET"];

const CORS_ALLOWED_ORIGIN =
  process.env["CORS_ALLOWED_ORIGIN"] || "http://localhost:3001";

if (DATABASE_URL === undefined) {
  throw Error("Missing DATABASE_URL");
}

if (PORT === undefined) {
  throw Error("Missing PORT");
}

if (TWITTER_CONSUMER_KEY === undefined) {
  throw Error("Missing TWITTER_CONSUMER_KEY");
} else if (TWITTER_CONSUMER_SECRET === undefined) {
  throw Error("Missing TWITTER_CONSUMER_SECRET");
} else if (TWITTER_ACCESS_TOKEN_KEY === undefined) {
  throw Error("Missing TWITTER_ACCESS_TOKEN_KEY");
} else if (TWITTER_ACCESS_TOKEN_SECRET === undefined) {
  throw Error("Missing TWITTER_ACCESS_TOKEN_SECRET");
}

const sequelize = new Sequelize(DATABASE_URL, {
  dialect: "postgres",
  models: [Tweet, Client]
});

const twitterClient = new Twitter({
  consumer_key: TWITTER_CONSUMER_KEY,
  consumer_secret: TWITTER_CONSUMER_SECRET,
  access_token_key: TWITTER_ACCESS_TOKEN_KEY,
  access_token_secret: TWITTER_ACCESS_TOKEN_SECRET
});

const app = express();
let openConnections: { [key: string]: express.Response } = {};

app.use(cors({ origin: CORS_ALLOWED_ORIGIN }));

app.get("/health", (req, res) => {
  res.send("ok");
});

app.get("/tweets/subscribe", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    Connection: "keep-alive",
    "Cache-Control": "no-cache"
  });

  // Send start of stream (the x last tweets)
  Tweet.findAll({ order: [["createdAt", "DESC"]], limit: 3 }).then(tweets => {
    tweets.reverse().forEach(tweet => {
      res.write(`id: tweet-${tweet.id}\n`);
      res.write(`event: newTweet\n`);
      res.write(`data: ${JSON.stringify(tweet.toJSON())}\n\n`);
    });
  });

  const clientId = uuidv4();

  const newClient = Client.build({ clientId });
  newClient.save();

  openConnections[clientId] = res;

  // On request close remove the client row from the db
  req.on("close", () => {
    Client.destroy({ where: { clientId } });
  });
});

const sendTweetToClient = async (tweet: Tweet): Promise<Client[]> => {
  /*
   * Loop through all client rows in the db, find the open connection
   * and write to it.
   */
  return Client.findAll().then(clients => {
    clients.forEach(client => {
      if (openConnections[client.clientId] === undefined) {
        // Connection destroyed for client in db, removing db row
        Client.destroy({ where: { clientId: client.clientId } });
      }

      openConnections[client.clientId].write(
        `id: tweet-${tweet.id}\nevent: newTweet\ndata: ${JSON.stringify(
          tweet.toJSON()
        )}\n\n`
      );
    });

    return clients;
  });
};

const pruneOpenConnections = () => {
  Object.keys(openConnections).forEach(clientId => {
    Client.findOne({ where: { clientId } }).then(client => {
      if (!client) {
        // Client has been removed from the db - remove the connection from the in-memory array
        console.log(`Removing connection ${clientId} from array`);
        delete openConnections[clientId];
      }
    });
  });

  setTimeout(pruneOpenConnections, 10 * 1000);
};

const init = async () => {
  await sequelize.sync();

  twitterClient.stream(
    "statuses/filter",
    { track: TWITTER_SEARCH_TERM },
    stream => {
      stream.on("data", event => {
        Tweet.build({
          text: event.text,
          authorUsername: event.user.name,
          profilePictureUrl: event.user.profile_image_url_https
        })
          .save()
          .then(savedTweet => {
            sendTweetToClient(savedTweet);
          });
      });

      stream.on("error", function(error) {
        console.error(error);
      });
    }
  );

  app.listen(PORT, () => console.log(`Listening at http://localhost:${PORT}`));

  pruneOpenConnections();
};

init();
