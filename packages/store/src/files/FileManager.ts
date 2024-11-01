import { FileData } from '@verdant-web/common';
import { Context } from '../context/context.js';
import { Sync } from '../sync/Sync.js';
import { EntityFile, MARK_FAILED, UPDATE } from './EntityFile.js';

export class FileManager {
	private sync;
	private context;

	private cache = new Map<string, EntityFile>();

	constructor({ sync, context }: { sync: Sync; context: Context }) {
		this.sync = sync;
		this.context = context;
	}

	add = async (file: FileData) => {
		// immediately cache the file
		let entityFile = this.cache.get(file.id);
		if (!entityFile) {
			entityFile = new EntityFile(file.id, { ctx: this.context });
			this.cache.set(file.id, entityFile);
		}

		if (!file.remote) {
			// immediately update local files.
			entityFile[UPDATE](file);
		}
		// this will download any original remote file and trigger a re-upload to the
		// new file's identity, in addition to storing it on disk
		const processedFile = await this.context.files.add(file);
		entityFile[UPDATE](processedFile);
	};

	/**
	 * Immediately returns an EntityFile to use, then either loads
	 * the file from cache, local database, or the server.
	 */
	get = (id: string, options: { downloadRemote?: boolean; ctx: Context }) => {
		if (this.cache.has(id)) {
			return this.cache.get(id)!;
		}
		const file = new EntityFile(id, options);
		this.cache.set(id, file);
		this.load(file);
		return file;
	};

	private load = async (file: EntityFile) => {
		const fileData = await this.context.files.get(file.id);
		if (fileData) {
			file[UPDATE](fileData);
		} else {
			// maybe we don't have it yet, it might be on the server still.
			try {
				// if not online, enqueue this for whenever we go online.
				if (this.sync.status !== 'active') {
					this.context.log(
						'info',
						'Sync is not active, waiting for online to load file',
						file.id,
						file.name,
					);
					const unsub = this.sync.subscribe('onlineChange', (online) => {
						if (online) {
							unsub();
							this.load(file);
						}
					});
					return;
				}

				const result = await this.sync.getFile(file.id);
				if (result.success) {
					file[UPDATE](result.data);
					await this.context.files.add(result.data);
				} else {
					this.context.log('error', 'Failed to load file', result);
					file[MARK_FAILED]();
				}
			} catch (err) {
				this.context.log('error', 'Failed to load file', err);
				file[MARK_FAILED]();
			}
		}
	};
}
