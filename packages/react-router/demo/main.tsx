import { Suspense, lazy } from 'react';
import { Router, Outlet, Link, TransitionIndicator } from '../src/index.js';
import { createRoot } from 'react-dom/client';
import { Home } from './routes/Home.js';
import { delay } from './data/utils.js';
import { loadPost } from './data/fakePosts.js';

// this fake loading can be "preloaded" by calling early,
// and will return immediately if already loaded
let fakeLoadPromise: Promise<void> | null = null;
function fakeComponentLatency() {
	if (fakeLoadPromise) return fakeLoadPromise;
	fakeLoadPromise = delay(3000);
	return fakeLoadPromise;
}

function App() {
	return (
		<Router
			routes={[
				{
					path: '/',
					exact: true,
					component: Home,
				},
				{
					path: '/posts',
					component: lazy(() =>
						// fake slow loading
						fakeComponentLatency().then(() => import('./routes/Posts.jsx')),
					),
					children: [
						{
							path: ':id',
							component: lazy(() =>
								// always takes 5 seconds to load the Post page
								delay(5000).then(() => import('./routes/Post.jsx')),
							),
							onVisited: ({ id }) => {
								// preload the post data when the link is clicked.
								// this data takes 3 seconds to load, but you'll
								// never see it load unless you refresh the page
								// because this preload runs in parallel with the
								// 5-second lazy component load above.
								loadPost(id);
							},
						},
					],
					// preloads the Posts page component when
					// a link to it is mounted
					onAccessible: () => {
						fakeComponentLatency();
					},
				},
			]}
		>
			<main>
				<div>
					<Link to="/">Home</Link>
					<Link to="/posts">Posts</Link>
				</div>
				<TransitionIndicator delay={1000}>
					<div>Loading next page...</div>
				</TransitionIndicator>
				<div>
					<Suspense fallback={<div>Loading...</div>}>
						<Outlet />
					</Suspense>
				</div>
			</main>
		</Router>
	);
}

createRoot(document.getElementById('root')!).render(<App />);
