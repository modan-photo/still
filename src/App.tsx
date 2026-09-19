import "./App.css";

function App() {
  return (
    <main>
      <p className="eyebrow">A photography toolkit</p>
      <h1>
        Still<span>.</span>
      </h1>
      <p className="intro">A little more space for your photographs.</p>
      <section aria-labelledby="welcome-title">
        <h2 id="welcome-title">Your workspace starts here</h2>
        <p>
          Frames, metadata, and thoughtful presentation. A quiet place for the
          final steps around your photographs.
        </p>
        <p className="status">Early development · Photo tools are coming next.</p>
      </section>
      <footer>Made for still photography.</footer>
    </main>
  );
}

export default App;
