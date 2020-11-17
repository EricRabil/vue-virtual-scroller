export const NoKey = Symbol('NoKey')

export type TypeKey = string | typeof NoKey;

export interface NR {
    id: string;
    key: string;
    index: number;
    used: boolean;
    type: TypeKey;
}

export interface PoolItem<T = unknown> {
    nr: NR;
    item: T;
    position: number;
}
