var http = require('http');
var WebSocketServer = require('ws').Server;

function copy(a, b) {
  if(!b) b = {};
  for(var m in a){
    b[m] = a[m];
  }
  return b;
}

function ChatServer(options){

    // if(!options) return console.log(`node-chat-server: you must provide an options object.`)
    // if(!options.create) return console.log(`node-chat-server: you must provide a 'create' method in options for creating a new chat message.`)
    // if(!options.authorize) return console.log(`node-chat-server: you must provide an 'authorize' method in options for authorizing connecting sockets.`)
    // if(!options.getMessages) return console.log(`node-chat-server: you must provide a 'getMessages' method in options for retrieving a set of chat messages.`)

    var chatServer = this;
    var context = options.context || chatServer;
    var port = options.port || 8080;
    var httpServer = http.createServer();
    var server = new WebSocketServer({ server: httpServer });

    chatServer.sockets = [];
    chatServer.httpServer = httpServer;
    chatServer.wsServer = server;
    chatServer.copy = copy;
    this.events = {};

    function sendMessage(message, userId, done) {
      userId = userId.toString();
      chatServer.sockets.map(function (socket) {
        if(socket.user && ((socket.user.id || socket.user._id).toString() === userId)){
          socket.action('chatMessage', message);
        }
      });
    }

    var actions = {
      authorize(socket, data, done){
        if(!options.authorize) return done('options.authorize is missing');
        options.authorize.call(context, data, function (err, user) {
          if(err){
            console.log(`node-chat-server: authorization error ${ err.message || err.toString() }`);
            return done(err);
          }
          if(!user){
            return done('authorizationFailed');
          }


          socket.user = user;
          chatServer.sockets.push(socket);
          chatServer.emit('socketAuthorized', socket, chatServer);
          if(options.log){
            console.log(`node-chat-server: authorizing ${user.name || user.id || user._id}. ${chatServer.sockets.length} connected sockets.`)
          }
          done(null, user);

        });
      },
      create(socket, data, done){
        if(!options.create) return done('options.create is missing');
        var message = copy(data);
        if(!message.to) {
          return done(`node-chat-server: a chat message must contain a 'to' property which should be a valid id of a user or a group.`);
        }
        var user = socket.user;
        message.createdAt = new Date();
        message.from = (user.id || user._id).toString();
        if(options.log){
          console.log(`node-chat-server: creating chat message for ${user.name || user.id || user._id}`)
        }
        options.create.call(context, message, function (err, msg) {

          if(err){ return done(err); }

          if(msg.isGroup){
            options.getGroupUserIds.call(context, { groupId: msg.to }, function (err, userIds) {
              if(err){ return done(err); }
              userIds.map(function (userId) {
                sendMessage(msg, userId);
              });
              done(null, msg);
            });
          }
          else{
            sendMessage(msg, msg.to);
            sendMessage(msg, msg.from);
            done(null, msg);
          }
        });
      },
      getMessages(socket, data, done){
        if(!options.getMessages) return done('options.getMessages is missing');
        var query = copy(data);
        query.ids = [(socket.user.id || socket.user._id).toString(), query.with];
        if(!query.skip){
          query.skip = 0;
        }
        if(!query.limit){
          query.limit = 10;
        }
        options.getMessages.call(context, query, done);
      },
      read(socket, data, done){
        if(!options.read) return done('options.read is missing');
        options.read.call(context, data.id, done);
      }
    };

    server.on('connection', function (socket) {           // fired for every incoming socket connection.

      if(options.log){
        console.log(`node-chat-server: connecting socket`)
      }

      socket.action = function(type, data){  // run an action on the client.
          socket.send(JSON.stringify({type: type, data: data}));
      };

      socket.on('message', function(msg){
          try {
              var json = JSON.parse(msg);
              if(!json.type){ return console.error(`json does not have a 'type'`); }

              // is this socket is not authorized and is not trying to authorize..
              if(options.authorize && (json.type !== 'authorize') && (!socket.user || (!socket.user.id && !socket.user._id))){

                // if not authorized, it can use only the open actions.
                if(options.openActions && options.openActions[json.type]){
                  return options.openActions[json.type].call(context, socket, json.data, function(err, res){
                      socket.send(JSON.stringify({id: json.id, error: err, data: res}));
                  }, socket);
                }

                // if unauthorized sockets try to do anything other then
                // requesting authorization or using the open actions - disconnect them immediately.
                else{
                  if(options.log){
                    console.log(`node-chat-server: disconnecting unauthorized socket - `, json.type)
                  }
                  return socket.close();
                }
              }

              if(options.log){
                console.log('node-chat-server: got - ', json);
              }

              var action = actions[json.type] || options.actions[json.type];
              if(action){ // perform a chat server action.
                action.call(context, socket, json.data, function(err, res){
                    socket.send(JSON.stringify({id: json.id, error: err, data: res}));
                }, socket);
              }
              else{
                return console.error(`cannot find action ${json.type}`);
              }

          } catch (e) {
              return console.error(e);
          }
      });

      socket.on('close', function () {
          var index = chatServer.sockets.indexOf(socket);
          if(options.log){
            console.log(`node-chat-server: socket closing`)
          }
          if(index > -1){
            chatServer.sockets.splice(index, 1);
            chatServer.emit('socketClosed', socket, chatServer);
            if(options.log){
              console.log(`node-chat-server: splicing authorized socket. ${chatServer.sockets.length} connected sockets`)
            }
          }
      });

      chatServer.emit('socketConnected', socket, chatServer);
    });

    httpServer.listen(port, function(){
      if(options.log){
        console.log(`node-chat-server: listening at port ${port}`)
      }
      if(options.onOpen){
        options.onOpen.call(context);
      }
    });

}

ChatServer.prototype = {
  on(eventName, listener){  // add a listener to 'eventName', return false in listener to stop the event.

    var event = this.events[eventName];
    if (!event) {
        event = this.events[eventName] = {listeners: []};
    }
    event.listeners.push(listener);
    return this;

  },
  off(eventName, listener){   // remove a listener.

    if (!eventName){   // calling off() with no arguments removes all listeners for all events.
      this.events = {};
    }
    else if (!listener){    // calling off('eventName') with no listener removes all event listeners for 'eventName'.
      delete this.events[eventName];
    }
    else{   // calling off('eventName', listener) will only remove listener.
      var event = this.events[eventName];
      if (event) {
          event.listeners = event.listeners.filter((l)=>{
            return (l === listener);
          });
          if (!event.listeners.length) delete this.events[eventName];
      }
    }
    return this;

  },
  emit(eventName, ...args){  // emit a named event

    if(this.options.log){
      console.log('chat-client - emitting ' + eventName, args);
    }
    var cont, event = this.events[eventName];
    if (!event) return;
    for (var i = 0; i < event.listeners.length; i++) {
        cont = event.listeners[i].apply(null, args);
        if (cont === false) break;  // if a listener returned false, stop here.
    }
    return this;

  }
}

module.exports = ChatServer;
