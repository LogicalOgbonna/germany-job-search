I layer state management by what the state actually represents, rather than reaching for a single solution.

For server/async state, React Query (TanStack Query) is my default. It handles caching, background refetching, optimistic updates, and stale-while-revalidate out of the box, which eliminates an enormous amount of boilerplate that teams used to write with Redux. At Genentech, introducing React Query alongside Redux dramatically simplified our data fetching patterns and removed redundant loading/error state that was duplicated across dozens of components.

For complex client-side state that multiple components need to coordinate around, I use Redux Toolkit or Zustand depending on the scale. Redux Toolkit works well for large apps where you need strict unidirectional data flow, middleware (thunks, sagas), and DevTools time-travel debugging. I used Redux heavily at ActivEdge for a bank settlement solution processing millions of transactions, where predictable state transitions across MasterCard, VISA, and e-commerce modules were critical. Zustand is my pick for smaller apps or isolated state slices where Redux feels like overkill, since it has a simpler API with no providers or boilerplate.

For URL-driven state (filters, search params, pagination, view modes), I use nuqs to sync state with the URL. This makes state shareable via links, survives page refreshes, and keeps the browser back/forward buttons working as users expect. I used nuqs in OurNigeria's Next.js frontend for managing conversation filters and navigation state, and it kept components clean by treating the URL as the single source of truth for that slice of state.

For local/ephemeral UI state (modals, form inputs, toggles), useState and useReducer are sufficient. Lifting state or using composition handles most "prop drilling" complaints without introducing a library.

The key principle: don't globalize state that doesn't need to be global, and don't manually cache what a server-state library can manage for you. Separating server state from client state was the single biggest improvement I've made to React codebases in terms of reducing complexity and bugs.
