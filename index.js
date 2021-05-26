//############ PACKAGES ############
require("dotenv").config();
const Client = require("hangupsjs");
const Q = require("q");
const logger = require("./logger");
const fs = require("fs");
const TelegramBot = require("node-telegram-bot-api");
//############ USER VARIABLES ############
const userFolder = "./user/";
//############ HELP VARS ############
const creds = () => {
  return { auth: Client.authStdin };
};
const hangoutsOpts = {
  cookiespath: userFolder + "cookies.json",
  rtokenpath: userFolder + "refreshtoken.txt",
};
prepareFiles();
const client = new Client(hangoutsOpts);
const telegramOpts = { parse_mode: "html" };
const tg_token = process.env.TG_TOKEN; //Create a .env file and insert a TG_TOKEN="TOKENINHERE" entry
checkTGToken();
const bot = new TelegramBot(tg_token, { polling: true });
let tg_chatID = ""; //Run setChatID command on telegram bot
let hangoutsSelf = {
  selfID: "",
  selfName: "",
};
let hangoutsOptions = {
  messages: "all", //all, partial
  sendPresenceAfterMessage: "yes",
};

function prepareFiles() {
  const cookiesFile = "cookies.json";
  const envFile = ".env";
  const tgchatidFile = "tg_chatid.txt";
  const refreshtokenFile = "refreshtoken.txt";
  if (!fs.existsSync(userFolder)) {
    fs.mkdirSync(userFolder);
  }
  if (!fs.existsSync(envFile)) {
    fs.writeFileSync(envFile, "TG_TOKEN=");
  }
}

//Handles new chat.google events
client.on("chat_message", async (chat_message) => {
  writeDebug("hangout_event", JSON.stringify(chat_message));
  const senderID = chat_message.sender_id.chat_id;
  const isSelf = checkIfSelf(senderID);
  if (isSelf && hangoutsOptions.messages != "all") {
    return;
  }
  const convID = chat_message.conversation_id.id;
  const message_content = chat_message.chat_message.message_content;
  const timestamp = chat_message.timestamp;
  const name = await getNameFromId(senderID);
  const content = messageContentToString("chat_message", message_content);
  const date = timestampToFormattedDate(timestamp);
  const botMessage = botMessageBuilder(senderID, convID, name, date, content);
  sendTelegramNotification(botMessage);
});

//Handles legacy hangouts events
client.on("hangout_event", async (hangout_event) => {
  writeDebug("hangout_event", JSON.stringify(hangout_event));
  const senderID = hangout_event.sender_id.chat_id;
  const convID = chat_message.conversation_id.id;
  const event_type = hangout_event.hangout_event.event_type;
  const timestamp = hangout_event.timestamp;
  const name = await getNameFromId(senderID);
  const content = messageContentToString("hangout_event", event_type);
  const date = timestampToFormattedDate(timestamp);
  const botMessage = botMessageBuilder(senderID, convID, name, date, content);
  sendTelegramNotification(botMessage);
});

function writeDebug(funcName, funcEvent) {
  logger.debug(funcName + " Start-------");
  logger.debug(funcEvent);
  logger.debug(funcName + " End-------");
}

//Handles commands on telegram bot
bot.on("text", (text_event) => {
  handleBotCommands(text_event);
});

//Handles error on telegram bot
bot.on("polling_error", (err) => {
  logger.error("Telegram polling error: ", err);
});

async function handleBotCommands(text_event) {
  const messageText = text_event.text;
  const messageSplit = messageText.split(" ");
  if (!messageSplit) return;
  const command = messageSplit[0];
  switch (command) {
    case "/setchatid": {
      const chatID = text_event.chat.id;
      setChatID(chatID);
      const message = "Your id is: " + chatID + " And has been setted";
      bot.sendMessage(chatID, message);
      break;
    }
    case "/getchatid": {
      const chatID = await getChatID();
      const message = "Your id is: " + chatID;
      bot.sendMessage(tg_chatID, message);
      break;
    }
    case "/changeoption": {
      const option = messageSplit[1];
      const value = messageSplit[2];
      switch (option) {
        case "messages": {
          if (value === "all" || value === "partial") {
            hangoutsOptions[option] = value;
            sendTelegramNotification(
              "Option changed successfully to: " + value
            );
          } else {
            //ERROR: VALUE NOT VALID
            sendTelegramNotification("Third parameter not recognized");
          }
          break; //option break
        }
        default: {
          sendTelegramNotification("Option not recognized");
          break; //option break
        }
      }
      break; //command break
    }
    case "/sendmessage": {
      tgSendMessage(messageSplit);
      break;
    }
    case "/setpresence": {
      const presence = String(messageSplit[1]);
      if (presence && (presence === "online" || presence === "offline")) {
        await client.setpresence(presence === "online");
        sendTelegramNotification("Presence set to: " + presence, (mood = None));
      } else {
        sendTelegramNotification(
          "Option not recognized: possible values are online or offline"
        );
      }
      break;
    }
    case "/querypresence": {
      const userChatID = messageSplit[1];
      if (userChatID && userChatID.length == 21) {
        checkPresence(userChatID);
      } else {
        sendTelegramNotification("Parameter must be a chat_id");
      }
      break;
    }
    case "/sendeasteregg": {
      /*const conversationID = messageSplit[1];
      const type = messageSplit[2];
      client.sendeasteregg('Ugw7Bm4Cbt7hgtS7g_N4AaABAagB3MOSCg','ponies')*/
      break;
    }
    case "/test": {
      tgTest();
      break;
    }
    default: {
      sendTelegramNotification("Command not recognized");
      break;
    }
  }
}

async function checkPresence(userChatID) {
  const presence = await client.querypresence(userChatID);
  logger.debug(JSON.stringify(presence));
  const h1 = "<b>Presence of " + userChatID + "</b>";
  const h2 = "\n<b>Hangouts name</b>: " + (await getNameFromId(userChatID));
  const h3 =
    "\n<b>Online</b>: " + presence.presenceResult[0].presence.available;
  const h4 =
    "\n<b>Last Seen</b>: " +
    presence.presenceResult[0].presence.lastSeen.lastSeenTimestampUsec;
  const output = h1 + h2 + h3 + h4;
  sendTelegramNotification(output);
}

function checkIfSelf(id) {
  return id === hangoutsSelf.selfID;
}

//Handles the input of /sendmessage command on telegram bot
async function tgSendMessage(messageSplit) {
  if (messageSplit.length < 3) {
    sendTelegramNotification(
      "Insufficient number of arguments for the command supplied \nExpected: /sendmessage {HangoutsConvID} {Message}"
    );
  } else if (messageSplit[1].length == 34) {
    const HangoutsConvID = messageSplit[1];
    const message = messageSplit.slice(2).join(" ");
    await client.sendchatmessage(HangoutsConvID, [[0, message]]);
    sendTelegramNotification("Message successfully sent");
  } else {
    sendTelegramNotification(
      "The length of the ConvID isn't right.\nExpected 34, Got: " +
        messageSplit[1].length
    );
  }
}

//Sends some debug information on the telegram chat
async function tgTest() {
  const h1 = "<b>Hangouts status</b>";
  const h2 = "\n<b>Is inited</b>: " + client.isInited();
  const h3 = "\n<b>Hangouts chat_id</b>: " + hangoutsSelf.selfID;
  const h4 = "\n<b>Hangouts name</b>: " + hangoutsSelf.selfName;
  const h5 = "\n\n<b>Telegram status</b>";
  const h6 = "\n<b>tg_chatid.txt</b>: " + (await getChatID());
  const statusMessage = h1 + h2 + h3 + h4 + h5 + h6;
  bot.sendMessage(tg_chatID, statusMessage, telegramOpts);
}

//Builds some debug information for tgTest()
async function setSelfInfo() {
  const selfInfo = await client.getselfinfo();
  const selfEntity = selfInfo.selfEntity;
  hangoutsSelf.selfID = selfEntity.id.chatId;
  hangoutsSelf.selfName = selfEntity.properties.displayName;
}

//Returns the callback_name of a Hangouts user, given ID
async function getNameFromId(id) {
  if (id === hangoutsSelf.selfID) {
    return "(You) " + hangoutsSelf.selfName;
  }
  const array = [id];
  const result = await client.getentitybyid(array);
  const name = result.entities[0].properties.display_name;
  logger.debug("getNameFromId: " + name);
  return name;
}

//Parses a content of a Hangout event given the type of the event
function messageContentToString(type, incoming_content) {
  switch (type) {
    case "chat_message": {
      const segments = incoming_content.segment;
      if (null != segments) {
        let string = "";
        segments.forEach((segment) => {
          string += segment.text;
          if (segment.type === "LINK") {
            string += "\n" + segment.link_data.link_target;
          }
        });
        logger.debug("messageContentToString(" + type + "): " + string);
        return string;
      } else {
        //TODO: Check t.json
      }
    }
    case "hangout_event": {
      let string = "";
      if (incoming_content === "START_HANGOUT") {
        string = "$$$AUTOMATIC$$$ Sono entrato in una chiamata con te";
      } else if (incoming_content === "ONGOING_HANGOUT") {
        string = "$$$AUTOMATIC$$$ Ho iniziato in una chiamata con te";
      } else if (incoming_content === "END_HANGOUT") {
        string = "$$$AUTOMATIC$$$ Ho chiuso una chiamata con te";
      } else {
        string = "####### UNHANDLED hangout_event incoming #######";
      }
      logger.debug("messageContentToString(" + type + "): " + string);
      return string;
    }
    default: {
      return "####### UNHANDLED EVENT #######";
    }
  }
}

//Builds a human-readable date/time from timestamp
function timestampToFormattedDate(timestamp) {
  //TODO: const date = new Date(timestamp);
  const date = new Date(Date.now());
  const h = (date.getHours() < 10 ? "0" : "") + date.getHours();
  const m = (date.getMinutes() < 10 ? "0" : "") + date.getMinutes();
  const s = (date.getSeconds() < 10 ? "0" : "") + date.getSeconds();
  const formattedTime = h + ":" + m + ":" + s;
  logger.debug("timestampToFormattedDate: " + formattedTime);
  return formattedTime;
}

//Builds a format for sending notification of incoming messages/events on Hangouts
function botMessageBuilder(senderID, convID, name, date, content) {
  const h1 = "<b>Sender Name</b>: " + name;
  const h2 = "\n<b>Date</b>: " + date;
  const h3 = "\n<b>SenderID</b>: " + senderID;
  const h4 = "\n<b>ConvID</b>: <code>" + convID + "</code>\n\n";
  const c = content;
  const botMessage = h1 + h2 + h3 + h4 + c;
  logger.debug("botMessageBuilder: " + botMessage);
  return botMessage;
}

//Given a botMessage, sends a message on a tg_chatid
function sendTelegramNotification(botMessage) {
  bot.sendMessage(tg_chatID, botMessage, telegramOpts).then(() => {
    logger.debug("sendTelegramNotification successful");
  });
}

//Returns the content of tg_chatid.txt
async function getChatID() {
  const chatID = await fs.readFileSync(userFolder + "tg_chatid.txt", "utf8");
  logger.debug("getChatID");
  return chatID;
}

//Writes on the tg_chatid.txt the user's chatID
async function setChatID(chatID) {
  await fs.writeFile(userFolder + "tg_chatid.txt", "" + chatID, () => {});
  tg_chatID = chatID;
  logger.debug("setChatID: ", chatID);
}

function checkTGToken() {
  if (!tg_token) {
    logger.error(
      "TG_TOKEN Variable inside .env file is not defined. Follow the instructions"
    );
    process.exit();
  }
}

//Reconnect in case of expired session/errors with the Hangouts API
const reconnect = function () {
  client.connect(creds).then(async function () {
    logger.info("Connection to the Hangouts API successful");
    setSelfInfo();
    tg_chatID = await getChatID();
  });
};
client.on("connect_failed", function () {
  logger.error("connect_failed");
  Q.Promise(function (rs) {
    setTimeout(rs, 3000);
  }).then(reconnect);
});
//First connect to the Hangouts API
reconnect();
