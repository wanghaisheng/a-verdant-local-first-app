import { Server, TokenProvider, ReplicaType } from '@lo-fi/server';
import express from 'express';
import { createServer } from 'http';
import * as fs from 'fs/promises';

const SECRET = 'notsecret';

export async function startTestServer() {
	const port = Math.floor(Math.random() * 9000) + 1000;
	const app = express();
	const httpServer = createServer(app);

	const dbFileName = `test-db-${Math.random().toString(36).slice(2, 9)}.sqlite`;

	const server = new Server({
		databaseFile: dbFileName,
		tokenSecret: SECRET,
		profiles: {
			get: async (userId: string) => {
				return { id: userId };
			},
		},
		httpServer,
	});

	const tokenProvider = new TokenProvider({
		secret: SECRET,
	});

	app.get('/auth/:library', async (req, res) => {
		const library = req.params.library;
		const user = (req.query.user as string) || 'anonymous';
		const type = (req.query.type as any) || ReplicaType.Realtime;
		const token = tokenProvider.getToken({
			libraryId: library,
			userId: user,
			syncEndpoint: `http://localhost:${port}/lofi`,
			type,
		});
		res.json({
			accessToken: token,
		});
	});

	app.post('/lofi', server.handleRequest);

	await new Promise<void>((resolve, reject) => {
		httpServer.listen(port, () => {
			console.log(`Test server listening on port ${port}`);
			resolve();
		});
	});

	return {
		port,
		cleanup: async () => {
			await server.close();
			await fs.unlink(dbFileName);
		},
	};
}
