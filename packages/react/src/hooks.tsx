import {
	CollectionIndexFilter,
	stableStringify,
	StorageSchema,
} from '@verdant-web/common';
import {
	Query,
	SyncTransportMode,
	StorageDescriptor,
	UserInfo,
	Entity,
	ClientWithCollections,
	EntityFile,
	Client,
	QueryStatus,
} from '@verdant-web/store';
import {
	createContext,
	ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from 'react';
import { suspend } from 'suspend-react';
import { useSyncExternalStoreWithSelector } from 'use-sync-external-store/with-selector.js';

function isQueryCurrentValid(query: Query<any>) {
	return !(query.status === 'initial' || query.status === 'initializing');
}
function useLiveQuery(liveQuery: Query<any> | null, disableSuspense = false) {
	// suspend if the query doesn't have a valid result set yet.
	if (!disableSuspense && liveQuery && !isQueryCurrentValid(liveQuery)) {
		suspend(() => liveQuery.resolved, [liveQuery]);
	}
	return useSyncExternalStore(
		(callback) => {
			if (liveQuery) {
				return liveQuery.subscribe('change', callback);
			} else {
				return () => {};
			}
		},
		() => {
			return liveQuery ? liveQuery.current : null;
		},
	);
}
function useLiveQueryStatus(liveQuery: Query<any> | null): QueryStatus {
	return useSyncExternalStore(
		(callback) => {
			if (liveQuery) {
				return liveQuery.subscribe('statusChange', callback);
			} else {
				return () => {};
			}
		},
		() => {
			return liveQuery?.status ?? 'initial';
		},
	);
}

function capitalize<T extends string>(str: T) {
	return (str.charAt(0).toUpperCase() + str.slice(1)) as Capitalize<T>;
}

function useStableIndex(index: CollectionIndexFilter | undefined) {
	const indexRef = useRef(index);
	const mismatch = stableStringify(indexRef.current) !== stableStringify(index);
	if (mismatch) {
		indexRef.current = index;
	}
	return indexRef.current;
}

type HookName = `use${string}`;

export function createHooks<Presence = any, Profile = any>(
	schema: StorageSchema<any>,
	options: {
		/** you can provide your own context to use instead of the generated one */
		Context?: React.Context<StorageDescriptor<Presence, Profile> | null>;
	} = {},
) {
	const Context =
		options.Context ??
		createContext<StorageDescriptor<Presence, Profile> | null>(null);

	function useStorage(): ClientWithCollections {
		const ctx = useContext(Context);
		if (!ctx) {
			throw new Error('No verdant provider was found');
		}
		return suspend(() => ctx.readyPromise, ['lofi_' + ctx.namespace]) as any;
	}

	function useWatch(
		liveObject: Entity | EntityFile | null,
		options?: { deep?: boolean },
	) {
		return useSyncExternalStore(
			(handler) => {
				if (liveObject) {
					if ('isFile' in liveObject) {
						return liveObject.subscribe('change', handler);
					} else {
						if (options?.deep) {
							return liveObject.subscribe('change', handler);
						} else {
							return liveObject.subscribe('change', handler);
						}
					}
				}
				return () => {};
			},
			() => {
				if (liveObject) {
					if (liveObject instanceof EntityFile) {
						return liveObject.url;
					} else {
						return liveObject.getAll();
					}
				}

				return undefined;
			},
		);
	}

	function useOnChange(
		liveObject: Entity | EntityFile | null,
		handler: (info: { isLocal?: boolean; target?: Entity }) => void,
		options?: { deep?: boolean },
	) {
		const handlerRef = useRef(handler);
		handlerRef.current = handler;

		return useEffect(() => {
			if (!liveObject) return;

			if ('isFile' in liveObject) {
				return liveObject?.subscribe('change', () => {
					handlerRef.current({});
				});
			} else {
				if (options?.deep) {
					return liveObject?.subscribe('changeDeep', (target, info) => {
						handlerRef.current({ ...info, target: target as Entity });
					});
				}
				return liveObject?.subscribe('change', (info) => {
					info.isLocal ??= false;
					handlerRef.current(info);
				});
			}
		}, [liveObject, handlerRef]);
	}

	function useSelf() {
		const storage = useStorage();
		return useSyncExternalStore(
			(callback) => storage.sync.presence.subscribe('selfChanged', callback),
			() => storage.sync.presence.self,
		);
	}

	function usePeerIds() {
		const storage = useStorage();
		return useSyncExternalStore(
			(callback) => storage.sync.presence.subscribe('peersChanged', callback),
			() => storage.sync.presence.peerIds,
		);
	}

	function usePeer(peerId: string | null) {
		const storage = useStorage();
		return useSyncExternalStore(
			(callback) => {
				const unsubs: (() => void)[] = [];
				unsubs.push(
					storage.sync.presence.subscribe('peerChanged', (id, user) => {
						if (id === peerId) {
							callback();
						}
					}),
				);
				unsubs.push(
					storage.sync.presence.subscribe('peerLeft', (id) => {
						if (id === peerId) {
							callback();
						}
					}),
				);

				return () => {
					unsubs.forEach((unsub) => unsub());
				};
			},
			() => (peerId ? storage.sync.presence.peers[peerId] ?? null : null),
		);
	}

	function useFindPeer(
		query: (peer: UserInfo<any, any>) => boolean,
		options?: { includeSelf: boolean },
	) {
		const storage = useStorage();
		return useSyncExternalStore(
			(callback) => {
				const unsubs: (() => void)[] = [];
				unsubs.push(
					storage.sync.presence.subscribe('peerChanged', (id, user) => {
						if (query(user)) {
							callback();
						}
					}),
				);
				unsubs.push(
					storage.sync.presence.subscribe('peerLeft', (id) => {
						if (query(storage.sync.presence.peers[id])) {
							callback();
						}
					}),
				);
				if (options?.includeSelf) {
					unsubs.push(
						storage.sync.presence.subscribe('selfChanged', (user) => {
							if (query(user)) {
								callback();
							}
						}),
					);
				}

				return () => {
					unsubs.forEach((unsub) => unsub());
				};
			},
			() => {
				const peers = Object.values(storage.sync.presence.peers);
				if (options?.includeSelf) {
					peers.push(storage.sync.presence.self);
				}
				return peers.find(query) || null;
			},
		);
	}

	function useFindPeers(
		query: (peer: UserInfo<any, any>) => boolean,
		options?: { includeSelf: boolean },
	) {
		const storage = useStorage();
		return useSyncExternalStoreWithSelector(
			(callback) => {
				const unsubs: (() => void)[] = [];
				unsubs.push(
					storage.sync.presence.subscribe('peerChanged', (id, user) => {
						if (user && query(user)) {
							callback();
						}
					}),
				);
				unsubs.push(
					storage.sync.presence.subscribe('peerLeft', (id) => {
						callback();
					}),
				);
				if (options?.includeSelf) {
					unsubs.push(
						storage.sync.presence.subscribe('selfChanged', (user) => {
							if (query(user)) {
								callback();
							}
						}),
					);
				}

				return () => {
					unsubs.forEach((unsub) => unsub());
				};
			},
			() => {
				const peers = Object.values(storage.sync.presence.peers).filter(
					Boolean,
				);
				if (options?.includeSelf) {
					peers.push(storage.sync.presence.self);
				}
				return peers.filter((p) => !!p).filter(query);
			},
			() => [] as UserInfo<any, any>[],
			(peers) => peers,
			(a, b) => a.length === b.length && a.every((peer, i) => peer === b[i]),
		);
	}

	function useSyncStatus() {
		const storage = useStorage();
		return useSyncExternalStore(
			(callback) => storage.sync.subscribe('onlineChange', callback),
			() => storage.sync.isConnected,
		);
	}

	function useUndo() {
		const storage = useStorage();

		return useCallback(() => storage.undoHistory.undo(), [storage]);
	}

	function useRedo() {
		const storage = useStorage();

		return useCallback(() => storage.undoHistory.redo(), [storage]);
	}

	function useCanUndo() {
		const storage = useStorage();

		return useSyncExternalStore(
			(callback) => storage.undoHistory.subscribe('change', callback),
			() => storage.undoHistory.canUndo,
		);
	}

	function useCanRedo() {
		const storage = useStorage();
		return useSyncExternalStore(
			(callback) => storage.undoHistory.subscribe('change', callback),
			() => storage.undoHistory.canRedo,
		);
	}

	function useUnsuspendedClient() {
		const desc = useContext(Context);

		const client = desc?.current;

		const [_, forceUpdate] = useState(0);
		useEffect(() => {
			if (desc && !client) {
				desc.readyPromise.then(() => forceUpdate((n) => n + 1));
			}
		}, [desc, client]);

		return client || null;
	}

	/**
	 * Non-suspending hook which allows declarative sync start/stop
	 * control.
	 *
	 * You can optionally configure parameters as part of this as well.
	 */
	function useSync(
		isOn: boolean,
		config: { mode?: SyncTransportMode; pullInterval?: number } = {},
	) {
		const client = useUnsuspendedClient();

		useEffect(() => {
			if (client) {
				if (isOn) {
					client.sync.start();
				} else {
					client.sync.stop();
				}
			}
		}, [client, isOn]);

		useEffect(() => {
			if (client) {
				if (config.mode !== undefined) {
					client.sync.setMode(config.mode);
				}
			}
		}, [client, config.mode]);

		useEffect(() => {
			if (client) {
				if (config.pullInterval !== undefined) {
					client.sync.setPullInterval(config.pullInterval);
				}
			}
		}, [client, config.pullInterval]);
	}

	function SyncController({ isOn }: { isOn: boolean }) {
		useSync(isOn);
		return null;
	}

	const hooks: Record<string, any> = {
		useStorage,
		useClient: useStorage,
		useUnsuspendedClient,
		useWatch,
		useOnChange,
		useSelf,
		usePeerIds,
		usePeer,
		useFindPeer,
		useFindPeers,
		useSyncStatus,
		useUndo,
		useRedo,
		useCanUndo,
		useCanRedo,
		useSync,
		Context,
		Provider: ({
			value,
			children,
			sync,
			...rest
		}: {
			children?: ReactNode;
			value: StorageDescriptor;
			sync?: boolean;
		}) => {
			// auto-open storage when used in provider
			useMemo(() => {
				value.open();
			}, [value]);
			return (
				<Context.Provider value={value} {...rest}>
					{children}
					{sync !== undefined && <SyncController isOn={sync} />}
				</Context.Provider>
			);
		},
	};

	const collectionNames = Object.keys(schema.collections);
	for (const pluralName of collectionNames) {
		const collection = schema.collections[pluralName];
		const getOneHookName = `use${capitalize(collection.name)}`;
		hooks[getOneHookName] = function useIndividual(
			id: string,
			{ skip }: { skip?: boolean } = {},
		) {
			const storage = useStorage();
			const liveQuery = useMemo(() => {
				return skip ? null : storage[pluralName].get(id);
			}, [id, skip]);
			const data = useLiveQuery(liveQuery);

			return data;
		};
		hooks[getOneHookName + 'Unsuspended'] = function useIndividualUnsuspended(
			id: string,
			{ skip }: { skip?: boolean } = {},
		) {
			const storage = useStorage();
			const liveQuery = useMemo(() => {
				return skip ? null : storage[pluralName].get(id);
			}, [id, skip]);
			const data = useLiveQuery(liveQuery, true);
			const status = useLiveQueryStatus(liveQuery);

			return { data, status };
		};

		const findOneHookName = `useOne${capitalize(collection.name)}`;
		hooks[findOneHookName] = function useOne({
			skip,
			index: unstableIndex,
			key,
		}: {
			index?: CollectionIndexFilter;
			skip?: boolean;
			key?: string;
		} = {}) {
			const storage = useStorage();
			const index = useStableIndex(unstableIndex);
			const liveQuery = useMemo(() => {
				return skip ? null : storage[pluralName].findOne({ index, key });
			}, [index, skip]);
			const data = useLiveQuery(liveQuery);
			return data;
		};
		hooks[findOneHookName + 'Unsuspended'] = function useOneUnsuspended({
			skip,
			index: unstableIndex,
			key,
		}: {
			index?: CollectionIndexFilter;
			skip?: boolean;
			key?: string;
		} = {}) {
			const storage = useStorage();
			const index = useStableIndex(unstableIndex);
			const liveQuery = useMemo(() => {
				return skip ? null : storage[pluralName].findOne({ index, key });
			}, [index, skip]);
			const data = useLiveQuery(liveQuery, true);
			const status = useLiveQueryStatus(liveQuery);

			return { data, status };
		};

		const getAllHookName = `useAll${capitalize(pluralName)}`;
		hooks[getAllHookName] = function useAll({
			index: unstableIndex,
			skip,
			key,
		}: {
			index?: CollectionIndexFilter;
			skip?: boolean;
			key?: string;
		} = {}) {
			const storage = useStorage();
			const index = useStableIndex(unstableIndex);
			// assumptions: this query getter is fast and returns the same
			// query identity for subsequent calls.
			const liveQuery = useMemo(
				() => (skip ? null : storage[pluralName].findAll({ index, key })),
				[index, skip],
			);
			const data = useLiveQuery(liveQuery);
			return data || [];
		};
		hooks[getAllHookName + 'Unsuspended'] = function useAllUnsuspended({
			index: unstableIndex,
			skip,
			key,
		}: {
			index?: CollectionIndexFilter;
			skip?: boolean;
			key?: string;
		} = {}) {
			const storage = useStorage();
			const index = useStableIndex(unstableIndex);
			// assumptions: this query getter is fast and returns the same
			// query identity for subsequent calls.
			const liveQuery = useMemo(
				() => (skip ? null : storage[pluralName].findAll({ index, key })),
				[index, skip],
			);
			const data = useLiveQuery(liveQuery, true) || [];
			const status = useLiveQueryStatus(liveQuery);

			return { data, status };
		};

		const getAllPaginatedHookName = `useAll${capitalize(pluralName)}Paginated`;
		hooks[getAllPaginatedHookName] = function useAllPaginated({
			index: unstableIndex,
			skip,
			pageSize = 10,
			key,
			suspend,
		}: {
			index?: CollectionIndexFilter;
			skip?: boolean;
			pageSize?: number;
			key?: string;
			suspend?: false;
		} = {}) {
			const storage = useStorage();
			const index = useStableIndex(unstableIndex);
			// assumptions: this query getter is fast and returns the same
			// query identity for subsequent calls.
			const liveQuery = useMemo(
				() =>
					skip
						? null
						: storage[pluralName].findPage({
								index,
								pageSize,
								page: 0,
								key: key || getAllPaginatedHookName,
						  }),
				[index, skip, pageSize],
			);
			const data = useLiveQuery(liveQuery, suspend === false);
			const status = useLiveQueryStatus(liveQuery);

			const tools = useMemo(
				() => ({
					next: () => liveQuery?.nextPage(),
					previous: () => liveQuery?.previousPage(),
					setPage: (page: number) => liveQuery?.setPage(page),

					get hasPrevious() {
						return liveQuery?.hasPreviousPage;
					},

					get hasNext() {
						return liveQuery?.hasNextPage;
					},

					status,
				}),
				[liveQuery, status],
			);

			return [data, tools] as const;
		};
		const getAllInfiniteHookName = `useAll${capitalize(pluralName)}Infinite`;
		hooks[getAllInfiniteHookName] = function useAllInfinite({
			index: unstableIndex,
			skip,
			pageSize = 10,
			key,
			suspend,
		}: {
			index?: CollectionIndexFilter;
			skip?: boolean;
			pageSize?: number;
			key?: string;
			suspend?: false;
		} = {}) {
			const storage = useStorage();
			const index = useStableIndex(unstableIndex);
			// assumptions: this query getter is fast and returns the same
			// query identity for subsequent calls.
			const liveQuery = useMemo(
				() =>
					skip
						? null
						: storage[pluralName].findAllInfinite({
								index,
								pageSize,
								key: key || getAllInfiniteHookName,
						  }),
				[index, skip, pageSize],
			);
			const data = useLiveQuery(liveQuery, suspend === false);
			const status = useLiveQueryStatus(liveQuery);

			const tools = useMemo(
				() => ({
					loadMore: () => liveQuery?.loadMore(),

					get hasMore() {
						return liveQuery?.hasMore;
					},

					status,
				}),
				[liveQuery, status],
			);

			return [data, tools] as const;
		};
	}

	hooks.withMutations = <
		Mutations extends {
			[key: HookName]: (client: Client, ...args: any[]) => any;
		},
	>(
		mutations: Mutations,
	) => {
		const augmentedHooks = {
			...hooks,
		};
		for (const [name, subHook] of Object.entries(mutations)) {
			augmentedHooks[name] = (...args: any[]) => {
				const client = hooks.useClient();
				return subHook(client, ...args);
			};
		}
		return augmentedHooks;
	};

	return hooks as any;
}
