export interface NR {
    id: string;
    key: string;
    index: number;
    used: boolean;
    type: string;
}

export interface PoolItem<T = unknown> {
    nr: NR;
    item: T;
    position: number;
}
