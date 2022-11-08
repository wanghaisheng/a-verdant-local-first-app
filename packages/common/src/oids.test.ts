import { describe, expect, it } from 'vitest';
import {
	assignOid,
	assignOidsToAllSubObjects,
	getOidRange,
	normalize,
	normalizeFirstLevel,
	ObjectIdentifier,
} from './oids.js';

describe('normalizing an object', () => {
	it('should return a map of sub-objects with relationships replaced by refs', () => {
		let i = 0;
		function createSubId() {
			return (i++).toString();
		}

		const initial = {
			foo: {
				bar: 1,
				baz: [2, 3],
			},
			qux: [
				{
					corge: true,
				},
				{
					grault: {
						garply: 4,
					},
				},
			],
		};
		assignOid(initial, 'test/a');
		assignOidsToAllSubObjects(initial, createSubId);

		const result = normalize(initial);

		expect(result.get('test/a')).toEqual(
			assignOid(
				{
					foo: {
						'@@type': 'ref',
						id: 'test/a.foo:0',
					},
					qux: {
						'@@type': 'ref',
						id: 'test/a.qux:2',
					},
				},
				'test/a',
			),
		);
		expect(result.get('test/a.foo:0')).toEqual(
			assignOid(
				{
					bar: 1,
					baz: {
						'@@type': 'ref',
						id: 'test/a.foo.baz:1',
					},
				},
				'test/a.foo:0',
			),
		);
		expect(result.get('test/a.foo.baz:1')).toEqual(
			assignOid([2, 3], 'test/a.foo.baz:1'),
		);
		expect(result.get('test/a.qux:2')).toEqual(
			assignOid(
				[
					{
						'@@type': 'ref',
						id: 'test/a.qux.#:3',
					},
					{
						'@@type': 'ref',
						id: 'test/a.qux.#:4',
					},
				],
				'test/a.qux:2',
			),
		);
		expect(result.get('test/a.qux.#:3')).toEqual(
			assignOid(
				{
					corge: true,
				},
				'test/a.qux.#:3',
			),
		);
		expect(result.get('test/a.qux.#:4')).toEqual(
			assignOid(
				{
					grault: {
						'@@type': 'ref',
						id: 'test/a.qux.#.grault:5',
					},
				},
				'test/a.qux.#:4',
			),
		);
		expect(result.get('test/a.qux.#.grault:5')).toEqual(
			assignOid(
				{
					garply: 4,
				},
				'test/a.qux.#.grault:5',
			),
		);
	});
});

describe('normalizing the first level of an object', () => {
	it('collects all top-level sub-objects', () => {
		let i = 0;
		function createSubId() {
			return (i++).toString();
		}

		const initial = {
			foo: {
				bar: 1,
				baz: [2, 3],
			},
			qux: [
				{
					corge: true,
				},
				{
					grault: {
						garply: 4,
					},
				},
			],
		};
		assignOid(initial, 'test/a');
		assignOidsToAllSubObjects(initial, createSubId);

		const { refs: result } = normalizeFirstLevel(initial);

		expect(result.get('test/a')).toMatchInlineSnapshot(`
			{
			  "@@id": "test/a",
			  "foo": {
			    "@@type": "ref",
			    "id": "test/a.foo:0",
			  },
			  "qux": {
			    "@@type": "ref",
			    "id": "test/a.qux:2",
			  },
			}
		`);
		expect(result.get('test/a:0')).toMatchInlineSnapshot('undefined');
		expect(result.get('test/a:1')).toBeUndefined();
		expect(result.get('test/a:2')).toMatchInlineSnapshot('undefined');
		expect(result.get('test/a:3')).toBeUndefined();
		expect(result.get('test/a:4')).toBeUndefined();
		expect(result.get('test/a:5')).toBeUndefined();
	});
});

describe('computing a range of oids for a whole object set', () => {
	function isWithin(
		oid: ObjectIdentifier,
		start: ObjectIdentifier,
		end: ObjectIdentifier,
	) {
		return oid >= start && oid <= end;
	}
	it('should include the root object and any possible sub object oid', () => {
		const [start, end] = getOidRange('test/a');
		expect(start).toEqual('test/a');
		expect(end).toEqual('test/a:\uffff');
		expect(start < end).toBe(true);
		expect(isWithin('test/a', start, end)).toBe(true);
		expect(isWithin('test/a:0', start, end)).toBe(true);
		expect(isWithin('test/a:1', start, end)).toBe(true);
		expect(isWithin('test/a:zzzzzzzzzzzzzzzzzzzzzzz', start, end)).toBe(true);
		expect(isWithin('test/a:\uffff', start, end)).toBe(true);
		expect(isWithin('test1/a', start, end)).toBe(false);
		expect(isWithin('test/b', start, end)).toBe(false);
		expect(isWithin('test/ ', start, end)).toBe(false);
	});
});
