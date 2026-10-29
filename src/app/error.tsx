"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="error-page">
      <h1>Let’s reconnect your workspace.</h1>
      <p>
        The dashboard could not load. Check that the local services are running.
      </p>
      <button onClick={reset}>Try again</button>
    </main>
  );
}
