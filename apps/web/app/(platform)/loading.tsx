/** Layout-shaped placeholder shown while a workspace page loads its market data. */
export default function WorkspaceLoading() {
  return (
    <div className="min-h-full bg-ink" aria-busy="true" aria-label="Loading">
      <div className="border-b border-line px-4 py-5 sm:px-6">
        <div className="skeleton h-3 w-28" />
        <div className="skeleton mt-3 h-7 w-64" />
        <div className="skeleton mt-3 h-3 w-full max-w-md" />
      </div>
      <div className="grid gap-px border-b border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
        {["a", "b", "c", "d"].map((key) => (
          <div key={key} className="bg-panel p-5">
            <div className="skeleton h-3 w-20" />
            <div className="skeleton mt-4 h-6 w-32" />
            <div className="skeleton mt-3 h-3 w-24" />
          </div>
        ))}
      </div>
      <div className="m-4 border border-line bg-panel md:m-6">
        {Array.from({ length: 10 }, (_, index) => `row-${index}`).map((key) => (
          <div
            key={key}
            className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-6 border-b border-line px-5 py-3.5 last:border-0"
          >
            <div className="skeleton h-3.5 w-36" />
            <div className="skeleton ml-auto h-3.5 w-16" />
            <div className="skeleton ml-auto h-3.5 w-14" />
            <div className="skeleton ml-auto h-3.5 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
