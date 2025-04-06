const http = require('http');
const { Server } = require("socket.io");
const cors = require("cors");
const express = require("express");
const app = express();
const allowedOrigins = [
    "https://buzzup-avg.netlify.app",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://localhost:5176",
    "http://localhost:5177",
    "http://localhost:5178"];
app.use(cors({
    origin:allowedOrigins
}))

app.get("/",(req,res)=>{
    res.end("Hello World! This server is Running fine!")
})
const server = http.createServer(app);
const io = new Server(server,
    {
        cors:{
            origin:allowedOrigins,
            methods:["GET","POST"]
        }
    });

const rooms = new Map();

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 9).toUpperCase();
}

io.on("connection", (socket) => {
    socket.on("createRoom", ({ hostName }) => {
        let roomCode = generateRoomCode();
        const room = {
            roomID: roomCode,
            host: hostName,
            hostID: socket.id,
            players: [],
            buzzes: [],
            isGameActive: false
        };
        rooms.set(roomCode, room);
        socket.join(roomCode);
        socket.emit("roomCreated", {
            roomID: roomCode,
            hostName: hostName,
            hostID: socket.id,
            isGameActive: false
        });
    });

    socket.on("joinRoom", ({ roomID, playerName }) => {
        let room = rooms.get(roomID);
        if (!room) {
            socket.emit("error", { message: "Room not found" });
            return;
        }
        room.players.push({ playerID: socket.id, name: playerName });
        socket.join(roomID);
        socket.emit("roomJoined", { roomID: roomID, name: playerName, roomState:room});
        io.to(roomID).emit("roomStateUpdate", { room: { ...room } });
    });

    socket.on("startGame", ({ roomCode }) => {
        let room = rooms.get(roomCode);
        if (!room) {
            socket.emit("error", { message: "Room not found" });
            return;
        }
        if (room.hostID === socket.id) {
            room.isGameActive = true;
            io.to(roomCode).emit("roomStateUpdate", { room: { ...room } });
        }
    });

    socket.on("resetGame", ({ roomCode }) => {
        console.log("reset Game called")
        let room = rooms.get(roomCode);
        if (room && room.hostID === socket.id) {
            room.isGameActive = false;
            room.buzzes = [];
            io.to(roomCode).emit("roomStateUpdate", { room: { ...room } });
            io.to(roomCode).emit("resetGame");
        }
    });

    socket.on("buzz", ({ roomCode, playerName }) => {
        const room = rooms.get(roomCode);
        if (room && room.isGameActive) {
            const newBuzz = {
                playerID: socket.id,
                playerName: playerName,
                timestamp: Date.now()
            };
            room.buzzes.push(newBuzz);

            // Sort buzzes to ensure order is correct
            room.buzzes.sort((a, b) => a.timestamp - b.timestamp);

            io.to(roomCode).emit("newBuzz", newBuzz);
            io.to(roomCode).emit("roomStateUpdate", { room: { ...room } });
            console.log(`${playerName} buzzed in room ${roomCode}`);
        }
    });
    socket.on("killRoom",({roomCode})=>{
        console.log("kill room Called ")
        let room = rooms.get(roomCode);
        if (room && room.hostID === socket.id){
            rooms.delete(roomCode);
            console.log("room Deleted")
            io.to(roomCode).emit("exitRoom");
        }
    })

    socket.on("leaveRoom", ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (!room) {
            socket.emit("error", { message: "Room not found" });
            return;
        }

        const playerIndex = room.players.findIndex(p => p.playerID === socket.id);

        if (playerIndex !== -1) {
            // Remove player from the room
            const [leftPlayer] = room.players.splice(playerIndex, 1);

            // Leave the socket room
            socket.leave(roomCode);

            // If the player was the host, close the room for everyone
            if (socket.id === room.hostID) {
                io.to(roomCode).emit("roomClosed", { message: "Host has left the game" });
                rooms.delete(roomCode);
                console.log(`Room ${roomCode} closed (host left)`);
            } else {
                // For regular players, just update the room state
                io.to(roomCode).emit("roomStateUpdate", { room: { ...room } });
                console.log(`${leftPlayer.name} left room ${roomCode}`);
            }
        } else {
            socket.emit("error", { message: "Player not found in room" });
        }
    });
    socket.on("disconnect", () => {
        let roomCodeToDelete = null;

        rooms.forEach((room, roomCode) => {
            const playerIndex = room.players.findIndex(p => p.playerID === socket.id);

            if (playerIndex !== -1) {
                const playerName = room.players[playerIndex].name;

                if (socket.id === room.hostID) {
                    // Host disconnected - close the room
                    io.to(roomCode).emit("roomClosed", { message: "Host has left the game" });
                    roomCodeToDelete = roomCode; // Mark room for deletion
                    console.log(`Room ${roomCode} closed (host left)`);
                } else {
                    // Regular player disconnected
                    room.players.splice(playerIndex, 1);
                    io.to(roomCode).emit("roomStateUpdate", { room: { ...room } });
                }

                console.log(`${playerName} disconnected from ${roomCode}`);
            }
        });

        if (roomCodeToDelete) {
            rooms.delete(roomCodeToDelete);
        }
    });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
