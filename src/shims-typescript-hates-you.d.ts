interface ResizeObserverOptions {
    box?: ResizeObserverBoxOptions;
}

interface ResizeObserver {
    disconnect(): void;
    observe(target: Element, options?: ResizeObserverOptions): void;
    unobserve(target: Element): void;
}

declare let ResizeObserver: {
    prototype: ResizeObserver;
    new(callback: ResizeObserverCallback): ResizeObserver;
}

declare let ResizeObserverSize: {
    prototype: ResizeObserverSize;
    new(): ResizeObserverSize;
}

interface ResizeObserverSize {
    readonly blockSize: number;
    readonly inlineSize: number;
}

interface ResizeObserverEntry {
    readonly borderBoxSize: ReadonlyArray<ResizeObserverSize>;
    readonly contentBoxSize: ReadonlyArray<ResizeObserverSize>;
    readonly contentRect: DOMRectReadOnly;
    readonly target: Element;
}

declare let ResizeObserverEntry: {
    prototype: ResizeObserverEntry;
    new(): ResizeObserverEntry;
}

interface ResizeObserverCallback {
    (entries: ResizeObserverEntry[], observer: ResizeObserver): void;
}

type ResizeObserverBoxOptions = 'border-box' | 'content-box' | 'device-pixel-content-box';
