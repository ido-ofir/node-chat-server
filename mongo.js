var ChatServer = require('./index.js');

// first connect to the database.
require('mongodb').connect('mongodb://localhost:27017/chatserver', function(err, db) {

    // point to a collection holding all chat messages.
    var chats = db.collection('chats');

    // point to a collection of users for authentication.
    var users = db.collection('users');

    // start the chat server.
    var chatServer = new ChatServer({

        port: 4001,
        log: true,

        actions: {
          getUsers(data, callback){

          }
        },

        authorize(data, callback){

            users.findOne({ token: data.token }, callback);

        },

        create(msg, callback){

           chats.insertOne(msg, function (err, res) {
             callback(err, msg);
           });

        },

        get(query, callback){

            // find chat messages to a specific user or group id.
            var findQuery = { to: query.to };
            if (query.from) {  // 'from' will be present for a user but not for a group.
                findQuery.from = query.from;
            }
            var cursor = chats.find(findQuery);

            // sort by ascending creation date. 'createdAt' is added by the chat server to every message.
            cursor.sort({ createdAt: 1 });

            // skip items
            cursor.skip(query.skip);

            // limit items
            cursor.limit(query.limit);

            // execute
            cursor.toArray(callback);

        },

        read(id, callback){

            chats.findOneAndUpdate({ _id: id }, { $set: { read: true }}, {}, callback);

        }
    });

});
