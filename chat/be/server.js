const dotenv = require('dotenv');
const express = require('express');
const mongodb = require('mongodb');
const http = require('http');
const cookieParser = require('cookie-parser');
const { Server } = require('socket.io');
const webpush = require('web-push');
const maxAgeInMilliseconds = 365 * 60 * 60 * 24 * 1000;
const publicKey = 'BLavcK_L2yrLCLCPH0tBeA_dljC6hMEG68imaJvs0DPd4G2R8SdEnkJ6LJeFCXq6T_JpfLsVOaHEXdXKh94Jpqo';
const privateKey = '2QQyhPuDNlcPFlt6UgNMOjrCZzMrm8vkei7tIOfLjZ4';

dotenv.config();

async function run() {
  const userDatabaseClient = await mongodb.MongoClient.connect(
    process.env.USER_DB_URL
  );
  const userDb = userDatabaseClient.db();
  const User = userDb.collection('users');

  const client = await mongodb.MongoClient.connect(process.env.DB_URL);
  const db = client.db();
  const Message = db.collection('messages');
  const Room = db.collection('rooms');
  const UserRoomConfig = db.collection('userroomconfigs');
  const Subscriptions = db.collection('subscriptions');

  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);

  webpush.setVapidDetails(
    'mailto: test@test.org', // change this?
    publicKey,
    privateKey
  )

  app.use(cookieParser());
  app.use(express.json());

  app.use(express.static('../fe/public'));

  app.use((req, res, next) => {
    req.user = req.cookies['user'];
    next();
  });

  app.get('/api/users/self', async (req, res, next) => {
    if (req.user) {
      const user = await User.findOne(
        { _id: mongodb.ObjectId(req.user) },
        { projection: { password: 0 } }
      );
      res.json({ data: user });
    } else {
      res.sendStatus(400);
    }
  });

  app.get('/api/users', async (req, res, next) => {
    if (req.user) {
      const users = await User.find(
        {},
        { projection: { password: 0 } }
      ).toArray();
      res.json({ data: users });
    } else {
      res.sendStatus(400);
    }
  });

  app.post('/api/users/login', async (req, res, next) => {
    const { email, password } = req.body;

    const user = await User.findOne({ email, password });

    if (user) {
      res.cookie('user', user._id, { maxAge: maxAgeInMilliseconds });
      return res.sendStatus(200);
    }

    return res.sendStatus(400);
  });

  app.get('/api/rooms', async (req, res) => {
    const user = req.user;

    const rooms = await Room.find({
      users: mongodb.ObjectId(user),
    }).toArray();

    const userRoomConfigs = await UserRoomConfig.find({
      user: mongodb.ObjectId(user),
    }).toArray();

    const roomsById = {};
    for (const room of rooms) {
      roomsById[room._id] = room;
    }

    for (const userRoomConfig of userRoomConfigs) {
      if (roomsById[userRoomConfig.room]) {
        roomsById[userRoomConfig.room].userRoomConfig = userRoomConfig;
      }
    }

    return res.json({
      data: rooms,
    });
  });

  app.post('/api/userroomconfigs', async (req, res) => {
    const { _id } = req.body;
    if (_id) {
      await UserRoomConfig.updateOne(
        { _id: mongodb.ObjectId(_id) },
        {
          $set: {
            unreadCount: req.body.unreadCount,
          },
        }
      );
    } else {
      await UserRoomConfig.insertOne({
        room: mongodb.ObjectId(req.body.room),
        user: mongodb.ObjectId(req.user),
        unreadCount: req.body.unreadCount,
      });
    }
    res.sendStatus(200);
  });

  app.get('/api/rooms/:id/messages', async (req, res, next) => {
    const id = req.params.id;
    const inputLastMessageId = req.query.lastmessageid;

    const room = await Room.findOne({
      _id: mongodb.ObjectId(id),
      users: mongodb.ObjectId(req.user),
    });
    if (!room) {
      return res.sendStatus(404);
    }
    let messages = [];

    if (!inputLastMessageId) {
      messages = await Message.find(
        {
          room: mongodb.ObjectId(id),
        },
        {
          sort: {
            _id: -1,
          },
        }
      )
        .limit(50)
        .map(function (msg) {
          return { ...msg, createdAt: msg._id.getTimestamp() };
        })
        .toArray();
    } else {
      messages = await Message.find(
        {
          _id: { $lt: mongodb.ObjectId(inputLastMessageId) },
          room: mongodb.ObjectId(id),
        },
        {
          sort: {
            _id: -1,
          },
        }
      )
        .limit(50)
        .map(function (msg) {
          return { ...msg, createdAt: msg._id.getTimestamp() };
        })
        .toArray();
    }

    const userRoomConfig =
      (await UserRoomConfig.findOne({
        user: mongodb.ObjectId(req.user),
        room: mongodb.ObjectId(id),
      })) || {};

    res.json({
      data: {
        messages,
        userRoomConfig,
      },
    });
  });

  // TODO: re-do logic to send push notifications
  app.post('/api/rooms/:id/messages', async (req, res, next) => {
    console.log(req.user);
    const { id } = req.params;
    const { insertedId } = await Message.insertOne({
      room: new mongodb.ObjectId(id),
      body: req.body.body,
      user: mongodb.ObjectId(req.user),
    });

    const newMessage = await Message.findOne({ _id: insertedId });
    newMessage.createdAt = newMessage._id.getTimestamp();

    await UserRoomConfig.updateMany(
      { room: mongodb.ObjectId(id), user: { $ne: mongodb.ObjectId(req.user) } },
      { $inc: { unreadCount: 1 } }
    );

    io.emit('message', newMessage);

    // TODO: clean this up
    const currentRoom = await Room.findOne({
      _id: mongodb.ObjectId(id)
    });
    console.log(currentRoom);

    const subscriptions = await Subscriptions.find({ user: { $in: currentRoom.users, $ne: mongodb.ObjectId(req.user) } }).toArray();
    console.log(subscriptions);

    const userName = await User.findOne({ _id: mongodb.ObjectId(req.user) });
    console.log(userName.name);

    const notifications = [];
    subscriptions.forEach((subscriber) => {
      notifications.push(
        webpush.sendNotification(subscriber.subscription, JSON.stringify(
          {
            title: userName.name,
            body: req.body.body,
            room: req.params,
          }))
      );
    });
    await Promise.all(notifications);


    res.sendStatus(200);
  });

  app.put('/api/rooms/:id/messages', async (req, res, next) => {
    const messageId = req.body.id;
    const newBody = req.body.body;

    await Message
      .updateOne(
        {
          _id: mongodb.ObjectId(messageId)
        },
        {
          $set: {
            body: newBody,
          }
        });

    const editedMessage = await Message.findOne({ _id: mongodb.ObjectId(messageId) });
    io.emit('edited-message', editedMessage)
    res.sendStatus(200);
  })

  app.delete('/api/rooms/:id/messages', async (req, res, next) => {
    const roomId = req.params.id;
    const messageId = req.body.id;

    await db
      .collection('messages')
      .deleteOne({ _id: mongodb.ObjectId(messageId) });

    io.emit('delete-message', {
      type: 'delete-message',
      room: roomId,
      id: messageId,
    });
    res.sendStatus(200);
  });


  // TODO:
  app.post('/api/subscriptions', async (req, res, next) => {
    const currentUser = req.body.user._id;
    const subscriptionInfo = req.body.subscription;
    await Subscriptions.insertOne({
      user: mongodb.ObjectId(currentUser),
      subscription: subscriptionInfo,
    })
  })

  app.delete('/api/subscriptions', async (req, res, next) => {
    const currentUser = req.body.user._id;
    await Subscriptions.deleteOne({
      user: mongodb.ObjectId(currentUser),
    })
  })

  app.get('*', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
  });

  server.listen(1337);
}

run();
