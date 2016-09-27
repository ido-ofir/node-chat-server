var ChatServer = require('../../index.js');
var async = require('async');
var mongodb = require('mongodb');
// first connect to the database.
mongodb.connect('mongodb://localhost:27017/chatserver', function(err, db) {

    // point to a collection holding all chat messages.
    var chats = db.collection('chats');

    // point to a collection of users for authentication.
    var users = db.collection('users');

    // point to a collection of groups holding user ids.
    var groups = db.collection('groups');

    // start the chat server.
    var chatServer = new ChatServer({

        port: 4001,
        log: true,

        actions: {
          getUsers(socket, data, callback){
            users.find({}).toArray(callback);
          },
          getGroups(socket, data, callback){
            groups.find({ users: socket.user._id.toString() }).toArray(callback);
          },
          getUsersAndGroups(socket, data, callback){
            async.parallel([function (cb) {
              users.find({}).toArray(cb);
            },function (cb) {
              groups.find({ users: socket.user._id.toString() }).toArray(cb);
            }], function (err, results) {
              var array = results || [];
              callback(err, { users: array[0], groups: array[1] });
            });
          }
        },

        authorize(data, callback){

            users.findOne({ token: data.token }, callback);

        },

        create(message, callback){

          if(message.groupId){
            groups.findOne({ _id: mongodb.ObjectId(message.groupId) }, function (err, group) {
              if (err) { return callback(err); }
              if(!group.users)
              async.map(group.users, function (userId, cb) {
                var msg = {};
                for(var m in message){
                  msg[m] = message[m];
                }
                msg.to = userId;
                chats.insertOne(message, cb);
              }, function (err, results) {
                callback(err, message);
              });
            });
          }
          else{
            chats.insertOne(message, function (err, res) {
              callback(err, message);
            });
          }

        },

        getGroupUserIds(data, callback){

          groups.findOne({ _id: mongodb.ObjectId(data.groupId) }, function (err, group) {
            callback(err, group && group.users);
          });

        },

        getMessages(query, callback){

            // find chat messages between two users, or a user and a group.
            var findQuery = {
              $or: [
                { from: query.ids[0], to: query.ids[1] },
                { from: query.ids[1], to: query.ids[0] }
              ]
            };
            var cursor = chats.find(findQuery);

            // sort by descending creation date. 'createdAt' is added by the chat server to every message.
            cursor.sort({ createdAt: -1 });

            // skip items
            cursor.skip(query.skip);

            // limit items
            cursor.limit(query.limit);

            // execute
            cursor.toArray(callback);

        },

        read(id, callback){

            chats.findOneAndUpdate({ _id: mongodb.ObjectId(id) }, { $set: { read: true }}, {}, callback);

        }
    });

});
