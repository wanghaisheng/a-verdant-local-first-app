import { expect, it } from 'vitest';
import { createTestContext } from '../lib/createTestContext.js';
import { waitForCondition, waitForOnline } from '../lib/waits.js';

const ctx = createTestContext({
	// test will observe total number of operations synced
	disableRebasing: true,
});

it('overwrites superseded operations to the same key before syncing', async () => {
	const clientA = await ctx.createTestClient({
		library: 'superseding',
		user: 'A',
	});

	const item = await clientA.items.put({
		content: 'Apples',
	});
	// wait a beat to allow these changes to rebase
	await waitForCondition(async () => {
		const stats = await clientA.stats();
		return stats.meta.operationsSize.count === 0;
	});
	// the client will sync only baselines, leaving us a clean
	// slate to observe the superseding behavior
	clientA.sync.start();
	await waitForOnline(clientA);

	await clientA
		.batch()
		.run(() => {
			for (let i = 0; i < 10; i++) {
				item.set('content', `${i} apples`);
			}
		})
		.commit();

	let stats = await ctx.server.server.getLibraryInfo('superseding');
	expect(stats?.operationsCount).toBe(1);

	await clientA
		.batch()
		.run(() => {
			// test for interference with other operations
			item.set('purchased', true);
			for (let i = 0; i < 10; i++) {
				item.set('categoryId', `${i}`);
			}
			// test delete supersedes sets
			item.delete('categoryId');
		})
		.commit();

	stats = await ctx.server.server.getLibraryInfo('superseding');
	// +1 for write of categoryId, +1 for write of purchased
	expect(stats?.operationsCount).toBe(3);
});
