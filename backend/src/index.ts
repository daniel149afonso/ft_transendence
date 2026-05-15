import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();
const	app = express();
app.use(cors());
app.use(express.json());

const	httpServer = createServer(app);
const	io = new Server(httpServer, {
	cors: { origin: '*'}
});

app.get('/health', (req, res) => {
	res.json({ status: 'ok' });
});

const	PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
	console.log(`Server running on port ${PORT}`);
});

