'use client';

// Estado pequeno fora do React: só quem usa useStore(store) se redesenha quando ele muda (o resto da página não)
import { useSyncExternalStore } from 'react';

export function createStore(initial) {
  let value = initial;
  const subs = new Set();
  return {
    get: () => value,
    set: (next) => {
      value = typeof next === 'function' ? next(value) : next;
      subs.forEach((fn) => fn());
    },
    subscribe: (fn) => (subs.add(fn), () => subs.delete(fn)),
  };
}

export const useStore = (store) => useSyncExternalStore(store.subscribe, store.get, store.get);
