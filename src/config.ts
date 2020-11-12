export interface VirtualScrollerOptions {
  itemsLimit: number;
  installComponents: boolean;
  componentsPrefix: string;
}

const config: VirtualScrollerOptions = {
  itemsLimit: 1000
} as unknown as VirtualScrollerOptions

export default config
