import { Kysely } from 'kysely';
import { join } from 'path';
import { openDatabase } from './database.js';
import { Database as DatabaseTypes } from './tables.js';

export class Databases {
	private cache: Record<string, Kysely<DatabaseTypes>> = {};
	private closeTimeouts: Record<string, NodeJS.Timeout> = {};
	private openedPreviously: Record<string, boolean> = {};
	private directory;
	private closeTimeout;
	private disableWal = false;

	constructor(config: {
		directory: string;
		closeTimeout?: number;
		disableWal?: boolean;
	}) {
		this.directory = config.directory;
		this.closeTimeout = config.closeTimeout ?? 1000 * 60 * 60;
		this.disableWal = config.disableWal ?? false;
	}

	get = async (libraryId: string): Promise<Kysely<DatabaseTypes>> => {
		if (this.cache[libraryId]) {
			this.enqueueClose(libraryId);
			return this.cache[libraryId];
		}
		const db = await openDatabase(this.directory, libraryId, {
			skipMigrations: this.openedPreviously[libraryId],
			disableWal: this.disableWal,
		});
		this.openedPreviously[libraryId] = true;
		this.cache[libraryId] = db;
		this.enqueueClose(libraryId);
		return db;
	};

	private enqueueClose = (libraryId: string) => {
		clearTimeout(this.closeTimeouts[libraryId]);
		this.closeTimeouts[libraryId] = setTimeout(
			this.close,
			this.closeTimeout,
			libraryId,
		);
	};

	close = (libraryId: string) => {
		clearTimeout(this.closeTimeouts[libraryId]);
		delete this.cache[libraryId];
		this.cache[libraryId]?.destroy();
	};

	destroy = async () => {
		for (const libraryId in this.cache) {
			this.close(libraryId);
		}
	};
}
