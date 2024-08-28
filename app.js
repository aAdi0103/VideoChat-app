const express = require('express');
const app = express();
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const { v4: uuidv4 } = require("uuid");

app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const server = http.createServer(app);
const io = socketIo(server);

let waitingUser = []; // Array to store incoming users
let userConnections = {}; // Object to store room information

io.on('connection', function (socket) {
    socket.on('joinroom', function (username) {
        if (waitingUser.length > 0) {
            let roomname = uuidv4();
            let firstUser = waitingUser.shift();

            // Join users to a common room
            socket.join(roomname);
            firstUser.socket.join(roomname);

            // Storing room info in object
            userConnections[socket.id] = { roomname, pairedUser: firstUser.socket.id, username };
            userConnections[firstUser.socket.id] = { roomname, pairedUser: socket.id, username };

            // Notify both users that they've been paired and joined the room
            io.to(socket.id).emit('joined', firstUser.username, roomname);
            io.to(firstUser.socket.id).emit('joined', username, roomname);
        } else {
            waitingUser.push({ socket, username });
        }
    });

    socket.on("message", function (data) {
        socket.broadcast.to(data.room).emit("message", data.message);
    });

    socket.on("signalingMessage", function (data) {
        socket.broadcast.to(data.room).emit("signalingMessage", data.message);
    });

    socket.on("startVideoCall", function ({ room }) {
        socket.broadcast.to(room).emit("incomingCall");
    });

    socket.on("rejectCall", function ({ room }) {
        socket.broadcast.to(room).emit("callRejected");
    });

    socket.on("acceptCall", function ({ room }) {
        socket.broadcast.to(room).emit("callAccepted");
    });

    socket.on('disconnect', function () {
        let disconnectedUserInfo = userConnections[socket.id];

        if (disconnectedUserInfo) {
            let pairedUserId = disconnectedUserInfo.pairedUser;
            const pairedSocket = io.sockets.sockets.get(pairedUserId);

            // Remove the current user from the connections object
            delete userConnections[socket.id];

            if (pairedSocket) {
                // Notify the paired user that the current user has disconnected
                io.to(pairedUserId).emit('disconnected');

                // Remove the paired user from the connections object
                delete userConnections[pairedUserId];

                // Re-add the paired user to the waiting list
                waitingUser.push({ socket: pairedSocket, username: disconnectedUserInfo.username });

                // Optionally, handle re-pairing the user immediately if another user is waiting
                if (waitingUser.length > 1) {
                    let roomname = uuidv4();
                    let nextUser = waitingUser.shift();

                    pairedSocket.join(roomname);
                    nextUser.socket.join(roomname);

                    userConnections[pairedSocket.id] = { roomname, pairedUser: nextUser.socket.id, username: disconnectedUserInfo.username };
                    userConnections[nextUser.socket.id] = { roomname, pairedUser: pairedSocket.id, username: nextUser.username };

                    io.to(pairedSocket.id).emit('joined', nextUser.username, roomname);
                    io.to(nextUser.socket.id).emit('joined', disconnectedUserInfo.username, roomname);
                }
            }
        }
    });
});

app.get('/', function (req, res) {
    res.render('index');
});

app.get('/chat', function (req, res) {
    res.render('chat');
});

server.listen(3000, () => {
    console.log('Server running on port 3000');
});
