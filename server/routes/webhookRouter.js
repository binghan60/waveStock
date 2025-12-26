import * as line from '@line/bot-sdk';
import express from 'express';
import axios from 'axios';
import 'dotenv/config';

export default (config) => {
  const router = express.Router();
  const client = new line.Client(config);

  router.post('/', async (req, res) => {
    try {
      const events = req.body.events;
      const results = await Promise.all(events.map((event) => handleEvent(event, client)));
      res.json(results);
    } catch (err) {
      console.error(err);
      await sendErrorEmail('🤖 LINE BOT 崩潰了！', err);
      res.status(500).end();
    }
  });

  return router;
};

async function handleEvent(event, client) {
  const sourceType = event.source.type;
  let groupId;

  if (sourceType === 'user') {
    groupId = event.source.userId;
  } else if (sourceType === 'group') {
    groupId = event.source.groupId;
  } else if (sourceType === 'room') {
    groupId = event.source.roomId;
  }

  if (event.type === 'message' && event.message.type === 'text') {
    return handleTextMessage(event, groupId, client);
  }

  if (event.type === 'join' || event.type === 'follow') {
    return handleJoinEvent(event, groupId, client);
  }

  return Promise.resolve(null);
}

async function handleTextMessage(event, groupId, client) {
  const msg = event.message.text.trim();

  if (msg === '/h') {
  }

  return Promise.resolve(null);
}

// 加入 群組 或 好友時
async function handleJoinEvent(event, groupId, client) {

  const welcomeMessage = `🎉 歡迎使用午餐抽獎機器人！`;

  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: welcomeMessage,
  });
}