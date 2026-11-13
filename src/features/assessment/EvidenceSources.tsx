import { SOURCES } from '../../content';

export function EvidenceSources({ ids }: { ids: readonly string[] }) {
  return (
    <ul className="assessment-sources">
      {ids.map(id => {
        const source = SOURCES[id];
        if (!source) return <li key={id}>Source record unavailable ({id}).</li>;
        return (
          <li key={id}>
            {source.url ? (
              <a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a>
            ) : (
              <strong>{source.title}</strong>
            )}
            <span className="muted">{source.publisher} · Retrieved {source.retrievedOn}</span>
            <dl className="assessment-source-scope">
              <div><dt>Supports</dt><dd>{source.supports}</dd></div>
              <div><dt>Outside scope</dt><dd>{source.doesNotSupport}</dd></div>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
