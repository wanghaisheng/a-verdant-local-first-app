import { ReactNode, useEffect, useMemo, useState, useTransition } from 'react';
import { RouterLevel } from './RouterLevel.js';
import { RouteConfig, RouteMatch } from './types.js';
import { RouteGlobalProvider } from './context.js';

export interface RouterProps {
	children: ReactNode;
	routes: RouteConfig[];
}

export function Router({ children, routes }: RouterProps) {
	// cannot be changed at runtime
	const [rootRoute] = useState<RouteConfig>(() => ({
		path: '',
		children: routes,
		component: () => null,
	}));
	const root: RouteMatch = useMemo(
		() => ({
			path: '',
			params: {},
			route: rootRoute,
		}),
		[rootRoute],
	);
	const [path, setPath] = useState(() => window.location.pathname);
	const [transitioning, startTransition] = useTransition();

	useEffect(() => {
		const listener = () => {
			startTransition(() => {
				setPath(window.location.pathname);
			});
		};
		window.addEventListener('popstate', listener);
		return () => window.removeEventListener('popstate', listener);
	}, []);

	return (
		<RouteGlobalProvider rootMatch={root}>
			<RouterLevel rootPath={path} parent={root} transitioning={transitioning}>
				{children}
			</RouterLevel>
		</RouteGlobalProvider>
	);
}
