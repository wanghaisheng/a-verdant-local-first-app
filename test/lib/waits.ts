import { expect, Mock } from 'vitest';
import { AnyEntity, Client, Query } from '../client/index.js';
import { ClientWithCollections } from '@verdant-web/store';
import { stableStringify } from '@verdant-web/common';

export async function waitForMockCall(mock: Mock, calls = 1) {
	return waitForCondition(() => {
		if (mock.mock.calls.length >= calls) {
			return true;
		}
		return false;
	});
}

export async function waitForOnline(
	client: Client | ClientWithCollections,
	online = true,
) {
	return new Promise<void>((resolve) => {
		if (client.sync.isConnected === online) {
			resolve();
			return;
		}
		client.sync.subscribe('onlineChange', (isOnline) => {
			if (isOnline === online) resolve();
		});
	});
}

export function waitForPeerCount(
	client: Client | ClientWithCollections,
	count: number,
	gte = false,
) {
	return new Promise<void>((resolve, reject) => {
		if (client.sync.presence.peerIds.length === count) {
			resolve();
			return;
		}
		const timeout = setTimeout(() => {
			reject(new Error('Timed out waiting for connections ' + count));
		}, 15000);
		const unsubscribe = client.sync.presence.subscribe(
			'peersChanged',
			(peers) => {
				if (
					client.sync.presence.peerIds.length === count ||
					(gte && client.sync.presence.peerIds.length >= count)
				) {
					unsubscribe();
					clearTimeout(timeout);
					resolve();
				}
			},
		);
	});
}

export async function waitForQueryResult(
	query: Query<any>,
	predicate: (value: any) => boolean = (value) => {
		return !!value && (Array.isArray(value) ? value.length > 0 : true);
	},
	timeoutMs = 15000,
	debug?: boolean,
) {
	await new Promise<void>((resolve, reject) => {
		if (query.status !== 'initial' && predicate(query.current)) {
			resolve();
			return;
		}

		const timeout = setTimeout(() => {
			if (debug) {
				debugger;
			}
			reject(new Error('Timed out waiting for query ' + query.key));
		}, timeoutMs);
		const unsubscribe = query.subscribe('change', (result) => {
			if (predicate(query.current)) {
				unsubscribe();
				clearTimeout(timeout);
				resolve();
			}
		});
	});

	expect(predicate(query.current)).toBe(true);
}

export async function waitForEverythingToRebase(client: Client) {
	await waitForCondition(async () => {
		if ((await client.stats()).meta.operationsSize.count === 0) {
			return true;
		}
		return false;
	});
}

export async function waitForBaselineCount(client: Client, count = 1) {
	await waitForCondition(async () => {
		const stats = await client.stats();
		if (stats.meta.baselinesSize.count >= count) {
			return true;
		}
		return false;
	});
}

export async function waitForCondition(
	condition: () => boolean | Promise<boolean>,
	timeout?: number,
	debugName?: string | (() => string),
) {
	await new Promise<void>((resolve, reject) => {
		if (timeout) {
			setTimeout(() => {
				reject(
					new Error(
						'Timed out waiting for condition ' +
							(typeof debugName === 'function' ? debugName() : debugName),
					),
				);
			}, timeout);
		}

		async function run() {
			try {
				let result = condition();
				if (result instanceof Promise) {
					result = await result;
				}
				if (result) {
					resolve();
				} else {
					setTimeout(run, 300);
				}
			} catch (e) {
				reject(e);
			}
		}
		run();
	});
}

export async function waitForEntityCondition<
	T extends AnyEntity<any, any, any>,
>(
	entity: T,
	condition: (entity: T) => boolean | Promise<boolean>,
	timeout = 10000,
	debugName?: string,
) {
	return new Promise<void>((resolve, reject) => {
		if (timeout) {
			setTimeout(() => {
				reject(new Error('Timed out waiting for condition ' + debugName));
			}, timeout);
		}

		if (condition(entity)) {
			resolve();
		} else {
			entity.subscribe('change', () => {
				if (condition(entity)) {
					resolve();
				}
			});
		}
	});
}

export async function waitForEntitySnapshot(
	entity: any,
	snapshot: any,
	timeout = 10000,
	onFail?: (entity: any) => void,
) {
	expect(entity, 'Entity snapshot watcher needs a defined entity').not.toBe(
		null,
	);
	return new Promise<void>((resolve, reject) => {
		let timer = setTimeout(() => {
			onFail?.(entity);
			expect(entity.getSnapshot()).toEqual(snapshot);
			reject(new Error('Timed out waiting for snapshot'));
		}, timeout);

		if (stableStringify(entity.getSnapshot()) === stableStringify(snapshot)) {
			clearTimeout(timer);
			resolve();
		} else {
			entity.subscribe('change', () => {
				if (
					stableStringify(entity.getSnapshot()) === stableStringify(snapshot)
				) {
					clearTimeout(timer);
					resolve();
				}
			});
		}
	});
}

export async function waitForPeerPresence(
	client: Client | ClientWithCollections,
	peerId: string,
	predicate: (presence: any) => boolean = (presence) => {
		return !!presence;
	},
) {
	await new Promise<void>((resolve, reject) => {
		if (predicate(client.sync.presence.peers[peerId]?.presence)) {
			resolve();
			return;
		}

		const timeout = setTimeout(() => {
			reject(new Error('Timed out waiting for peer presence'));
		}, 15000);
		const unsubscribe = client.sync.presence.subscribe(
			'peerChanged',
			(otherId, info) => {
				if (peerId === otherId && predicate(info?.presence)) {
					unsubscribe();
					clearTimeout(timeout);
					resolve();
				}
			},
		);
	});
	expect(predicate(client.sync.presence.peers[peerId]?.presence)).toBe(true);
}

export async function waitForTime(ms: number) {
	return new Promise<void>((resolve) => {
		setTimeout(resolve, ms);
	});
}
