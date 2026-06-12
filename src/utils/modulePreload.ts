export function createModulePreloader<T extends string>(
  loaders: Record<T, () => Promise<unknown>>,
): (moduleId: T) => Promise<unknown> {
  const cache = new Map<T, Promise<unknown>>();

  return moduleId => {
    let promise = cache.get(moduleId);
    if (!promise) {
      promise = loaders[moduleId]();
      cache.set(moduleId, promise);
    }
    return promise;
  };
}
