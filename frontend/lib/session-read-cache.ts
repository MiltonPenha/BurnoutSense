export function createSessionReadCache(ttl = 5000, now = () => Date.now()) {
  const entries = new Map<string, { expires: number; promise: Promise<unknown> }>();
  let generation = 0;
  return {
    clear() { generation++; entries.clear(); },
    read<T>(key: string, load: () => Promise<T>): Promise<T> {
      const cached = entries.get(key);
      if (cached && cached.expires > now()) return cached.promise as Promise<T>;
      const version = generation;
      const entry = { expires: Infinity, promise: Promise.resolve() as Promise<unknown> };
      entry.promise = Promise.resolve().then(load).then(value => {
        if (generation === version && entries.get(key) === entry) entry.expires = now() + ttl;
        return value;
      }, error => {
        if (entries.get(key) === entry) entries.delete(key);
        throw error;
      });
      if (entries.size >= 64) entries.delete(entries.keys().next().value!);
      entries.set(key, entry);
      return entry.promise as Promise<T>;
    },
  };
}
