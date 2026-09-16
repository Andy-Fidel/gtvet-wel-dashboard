import { AsyncLocalStorage } from 'node:async_hooks';

export const inspectionContext = new AsyncLocalStorage();
export const isInspection = () => inspectionContext.getStore() === true;
