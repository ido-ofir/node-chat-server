# Chat Server

Storage agnostic chat server.

## Usage

This module handles chat server logic in a storage agnostic way.

Implementation should be storage specific and handle the following:

 1. saving a new, single chat message.
 2. retrieving a set of chat messages, usually by descending dates.
 3. marking an existing chat message as being 'read'.

The following example is using mongodb as the storage layer:

```js
var ChatServer = require('core-chat-server');

// first connect to the database.
require('mongodb').connect('mongodb://localhost:27017/myproject', function(err, db) {

    // point to a collection holding all chat messages.
    var chats = db.collection('chats');

    // point to a collection of users for authentication.
    var users = db.collection('users');

    // start the chat server.
    var chatServer = new ChatServer({

        port: 4000,
        log: true,

        authorize(data, callback){

            users.findOne({ authToken: data.token }, callback);

        },

        create(msg, callback){

           chats.insertOne(msg, callback);

        },

        get(query, callback){

            // find chat messages to a specific user or group id.
            var findQuery = { to: query.to };
            if (query.from) {  // 'from' will be present for a user but not for a group.
                findQuery.from = query.from;
            }
            var cursor = chats.find(findQuery);

            // sort by descending creation date. 'createdAt' is added by the chat server to every message.
            cursor.sort({ createdAt: -1 });

            // skip items            
            cursor.skip(query.skip);

            // execute                        
            cursor.toArray(callback);

        },

        read(id, callback){

            chats.findOneAndUpdate({ _id: id }, { $set: { read: true }}, {}, callback);

        }
    });

});


```
