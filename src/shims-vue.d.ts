declare module '*.vue' {
  import Vue from 'vue'
  export default Vue
}

declare module 'vue-resize' {
  import { VueConstructor } from 'vue-property-decorator'

  export const ResizeObserver: VueConstructor
}
