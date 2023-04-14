import { ReactNode, createContext, useContext } from 'react';
import { RouteConfig, RouteMatch } from './types.js';

type RouteLevelContextValue = {
	parent: RouteMatch | null;
	match: RouteMatch | null;
	subpath: string;
	transitioning: boolean;
};

export const RouteLevelContext = createContext<RouteLevelContextValue>({
	parent: null,
	match: null,
	subpath: '',
	transitioning: false,
});

export const RouteLevelProvider = ({
	children,
	...props
}: RouteLevelContextValue & { children: ReactNode }) => {
	return (
		<RouteLevelContext.Provider value={props}>
			{children}
		</RouteLevelContext.Provider>
	);
};

export function useParams<Shape extends Record<string, string>>(): Shape {
	const { parent } = useContext(RouteLevelContext);

	return (parent?.params || {}) as any;
}

type RouteGlobalContextValue = {
	flatRoutes: RouteConfig[];
};

export const RouteGlobalContext = createContext<RouteGlobalContextValue>({
	flatRoutes: [],
});

export const RouteGlobalProvider = ({
	children,
	...props
}: RouteGlobalContextValue & { children: ReactNode }) => {
	return (
		<RouteGlobalContext.Provider value={props}>
			{children}
		</RouteGlobalContext.Provider>
	);
};
