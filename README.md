# Chat Server

Storage agnostic chat server.

## Installation

```
npm install node-chat-server
```

## Client

There is a complimentary client side module on npm called <a href="https://github.com/ido-ofir/chat-client">chat-client</a> which is the easiest way to set up a working chat with this server.

## Usage

This module handles chat server logic in a storage agnostic way.

Implementation should be storage specific and handle the following:

 1. authenticating a connecting socket by providing a user object for it.
 2. saving a new, single chat message.
 3. retrieving a set of chat messages, usually by descending creation dates.
 4. marking an existing chat message as having been read by it's recipient.

All functions provided to the chat server will get a callback as the last argument ( see example below ). these callbacks follow the node function paradigm, that is, they all expect an error ( or null ) as the first argument and if the error is truthy they will fail.

The following example is using mongodb as the storage layer:

```js

var ChatServer = require('node-chat-server');

// first connect to the database.
require('mongodb').connect('mongodb://localhost:27017/myproject', function(err, db) {

    // point to a collection holding all chat messages.
    var chats = db.collection('chats');

    // point to a collection of users for authentication.
    var users = db.collection('users');

    // start the chat server.
    var chatServer = new ChatServer({

        port: 4001,   // the port that the chat server will listen on. defaults to 8080.
        
        log: true,    // log activities to the console. used for debugging purposes.

        authorize(data, callback){  // all connecting sockets will need to authorize before doing anything else.
                                    // the callback is expecting some kind of user object as the second argument.
            users.findOne({ token: data.token }, callback);

        },

        create(msg, callback){  // create a new chat message.

           chats.insertOne(msg, function (err, res) {
             callback(err, msg);
           });

        },

        getMessages(query, callback){

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
          
          // data.groupId is the id of the group.
          groups.findOne({ _id: mongodb.ObjectId(data.groupId) }, function (err, group) {
            callback(err, group && group.users);
          });

        },

        read(id, callback){  // mark a chat message as having been read by the recipient.

            chats.findOneAndUpdate({ _id: id }, { $set: { read: true }}, {}, callback);

        },
        
        actions: {    // you can define some custom actions here,
                      // and then call them from the client.
          getUsers(socket, data, callback){
             
             users.find(data || {}, callback);
             
          }
          
        }
    });

});


```

As you can see from the example the chat server api consists of an object that you create and pass to the constructor.
This object is expected to contain the following:

* **port** - Number - the port at which the socket server will be listening. defaults to 8080.
* **log** - Boolean - an optional flag for debugging purposes. if true the server will log some info about it's activities to the console.
* **authorize** - Function(data: Object, callback: Function) - used to authorize newly connected sockets. the first argument to this function will be an object that came from the connected client, usually containing some kind of access token. the chat server is agnostic as to how exactly you authorize your users, and you are free to require no authorization at all. however this function will still run for each connecting socket and it is expected to return some sort of user object to the callback. this user object can have any structure but it must contain an `id` or `_id` field which should be unique. the user object will be attached to the socket and the chat server will pass any messages addressed to this user's id through the socket.
* **create** - Function(message: Object, callback: Function) - create a new chat message. the first argument to this function is a 'message' object, which was sent from the client to the chat server. the chat server will add a 'createdAt' date to the message object as well as a 'from' property which will always be the id ( or _id ) of the user that is attached to the socket that sent the message. the message object sent from the client must have one property named 'to' which should be a valid user id. the 'to' property on the message will be used to propagate the message to the correct user.
* **getMessages** - Function(query: Object, callback: Function) - a function used to get a set of chat messages to the client. as the chat server is storage agnostic, only the basic query parameters are normalized, but you can pass anything you like from the client to select a more specific set of chat messages. normal client usage will usually require only these fields in the query:
    * **limit** - the number of messages to fetch. defaults to 10.
    * **skip** - an offset from the last message, used for pagination. defaults to 0.
* **getGroupUserIds** - Function(data: Object, callback: Function) - get an array of user ids for a specific group. `data` will contain a 'groupId' field. 
* **read** - Function(id: String, callback: Function) - a function used to mark a chat message as having been read by it's recipient. the first argument is the id of the chat message that was read, and it should arrive from the client ( the chat server has no idea about ids of chat messages ).
* **actions** - Object - user defined actions. this is an object containing a set of functions that can be called by the client. this is just a useful helper tool as the chat server does not use these actions at all. it is only there to provide a way for you to use the chat server's transport to communicate between your server and client.
