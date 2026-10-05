/** Operator-only direct connections; isolation itself requires the frozen external endpoint audit. */
export function cachePassageConnections(
  reader: string | undefined,
  writer: string | undefined,
  apply: boolean,
) {
  if (!reader) throw Error('PASSAGE_READER_CONNECTION_REQUIRED');
  const parse = (raw: string) => {
    const u = new URL(raw);
    if (
      !['postgres:', 'postgresql:'].includes(u.protocol) ||
      u.hostname.includes('-pooler') ||
      !u.username ||
      u.pathname === '/'
    )
      throw Error('PASSAGE_DIRECT_CONNECTION_REQUIRED');
    u.searchParams.delete('sslmode');
    u.searchParams.delete('channel_binding');
    return u;
  };
  const read = parse(reader);
  let write: URL | undefined;
  if (apply) {
    if (!writer) throw Error('PASSAGE_WRITER_CONNECTION_REQUIRED');
    write = parse(writer);
    if (
      read.hostname !== write.hostname ||
      read.port !== write.port ||
      read.pathname !== write.pathname
    )
      throw Error('PASSAGE_DATABASE_BINDING_MISMATCH');
    if (read.username === write.username) throw Error('PASSAGE_DISTINCT_PRINCIPALS_REQUIRED');
  }
  return { reader: read.toString(), writer: write?.toString() };
}
