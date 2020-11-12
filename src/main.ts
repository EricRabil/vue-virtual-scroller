import config, { VirtualScrollerOptions } from './config'

import RecycleScroller from './components/RecycleScroller.vue'
import DynamicScroller from './components/DynamicScroller.vue'
import DynamicScrollerItem from './components/DynamicScrollerItem.vue'
import { VueConstructor } from 'vue/types/umd'

export { default as IdState } from './mixins/IdState'

export {
  RecycleScroller,
  DynamicScroller,
  DynamicScrollerItem
}

function registerComponents (Vue: VueConstructor, prefix: string) {
  Vue.component(`${prefix}recycle-scroller`, RecycleScroller)
  Vue.component(`${prefix}RecycleScroller`, RecycleScroller)
  Vue.component(`${prefix}dynamic-scroller`, DynamicScroller)
  Vue.component(`${prefix}DynamicScroller`, DynamicScroller)
  Vue.component(`${prefix}dynamic-scroller-item`, DynamicScrollerItem)
  Vue.component(`${prefix}DynamicScrollerItem`, DynamicScrollerItem)
}

const plugin = {
  // eslint-disable-next-line no-undef
  version: '1.2.3',
  install (Vue: VueConstructor, options: Partial<VirtualScrollerOptions> = {}) {
    Object.assign(config, {
      installComponents: true,
      componentsPrefix: ''
    }, options) as unknown as VirtualScrollerOptions

    if (config.installComponents) {
      registerComponents(Vue, config.componentsPrefix)
    }
  }
}

export default plugin

declare const global: Record<string, unknown>

// Auto-install
let GlobalVue: VueConstructor | null = null
if (typeof window !== 'undefined') {
  GlobalVue = window.Vue
} else if (typeof global !== 'undefined') {
  GlobalVue = global.Vue as VueConstructor
}
if (GlobalVue) {
  GlobalVue.use(plugin)
}
