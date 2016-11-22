
var ChatServer = require('../../index.js');
var mongodb = require('mongodb');
var async = require('async');

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

        port: 4001,   // the port that the chat server will listen on. defaults to 8080.

        log: true,    // log activities to the console. used for debugging purposes.

        authorize(data, callback){  // all connecting sockets will need to authorize before doing anything else.
                                    // the callback is expecting some kind of user object as the second argument.
           users.findOne({ token: data.token }, callback);

        },

        create(message, callback){  // create a new chat message.

          chats.insertOne(message, function (err, res) {
            callback(err, message);
          });

        },

        getMessages(query, callback){  // find chat messages between two users, or a user and a group.

            // find chat messages between two users, or a user and a group.
            // query.ids is an array with two ids in it.
            // the first id belongs to the user that is requesting the mesasges.ng
            // the second id can be a user id or a group id.
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

        getGroupUserIds(data, callback){  // get an array of user ids for a specific group.

          groups.findOne({ _id: mongodb.ObjectId(data.groupId) }, function (err, group) {
            callback(err, group && group.users);
          });

        },

        read(id, callback){  // mark a chat message as having been read by the recipient.

            chats.findOneAndUpdate({ _id: mongodb.ObjectId(id) }, { $set: { read: true }}, {}, callback);

        },

        actions: {  // custom defined actions.

            getUsersAndGroups(socket, data, callback){

                async.parallel([function (cb) {  // get all users.
                  users.find({}).toArray(cb);
                },function (cb) {    // get the groups that the user belongs to.
                  groups.find({ users: socket.user._id.toString() }).toArray(cb);
                }], function (err, results) {
                  var array = results || [];
                  callback(err, { users: array[0], groups: array[1] });
                });

            }

        }

    });

});
