<script lang="ts">
import { Component, Prop, Vue, Watch } from 'vue-property-decorator'
import DynamicScroller, { VSCrollData } from './DynamicScroller.vue'

type ID = string | number | undefined | null;

@Component({
  name: 'DynamicScrollerItem',
  render (this: DynamicScrollerItem, h) {
    return h(this.tag, this.$slots.default)
  },
  inject: ['vscrollData', 'vscrollParent', 'vscrollResizeObserver']
})
export default class DynamicScrollerItem<T = unknown> extends Vue {
  @Prop({ required: true })
  item: T;

  @Prop({ default: false })
  watchData: boolean;

  @Prop({ required: true })
  active: boolean;

  @Prop({ default: undefined })
  index: number | undefined;

  @Prop({ default: null })
  sizeDependencies: unknown[];

  @Prop({ default: false })
  emitResize: boolean;

  @Prop({ default: 'div' })
  tag: string;

  vscrollData: VSCrollData<T>;

  vscrollParent: DynamicScroller<T>;

  vscrollResizeObserver: ResizeObserver | undefined;

  $_pendingVScrollUpdate: ID;
  $_pendingSizeUpdate: ID;
  $_forceNextVScrollUpdate: unknown;
  $_watchData: (() => void) | null;

  /** Created */

  get id (): string | number | undefined {
    return this.vscrollData.simpleArray
      ? this.index
      : ((this.item[this.vscrollData.keyField] as unknown) as string | number)
  }

  get size (): number {
    return (
      (this.id &&
        this.vscrollData.validSizes[this.id] &&
        this.vscrollData.sizes[this.id]) ||
      0
    )
  }

  get finalActive (): boolean {
    return this.active && this.vscrollData.active
  }

  /** Watchers */

  @Watch('id')
  idChanged () {
    if (!this.size) {
      this.onDataUpdate()
    }
  }

  @Watch('finalActive')
  finalActiveChanged (value: boolean) {
    if (!this.size && typeof this.id !== 'undefined') {
      if (value) {
        if (!this.vscrollParent.$_undefinedMap[this.id]) {
          this.vscrollParent.$_undefinedSizes++
          this.vscrollParent.$_undefinedMap[this.id] = true
        }
      } else {
        if (this.vscrollParent.$_undefinedMap[this.id]) {
          this.vscrollParent.$_undefinedSizes--
          this.vscrollParent.$_undefinedMap[this.id] = false
        }
      }
    }

    if (this.vscrollResizeObserver) {
      if (value) {
        this.observeSize()
      } else {
        this.unobserveSize()
      }
    } else if (value && this.$_pendingVScrollUpdate === this.id) {
      this.updateSize()
    }
  }

  /** Lifecycle */

  created () {
    if (this.$isServer) return

    this.$_forceNextVScrollUpdate = null
    this.updateWatchData()

    if (!this.vscrollResizeObserver) {
      for (const k in this.sizeDependencies) {
        this.$watch(() => this.sizeDependencies[k], this.onDataUpdate)
      }

      this.vscrollParent.$on('vscroll:update', this.onVscrollUpdate)
      this.vscrollParent.$on('vscroll:update-size', this.onVscrollUpdateSize)
    }
  }

  mounted () {
    if (this.vscrollData.active) {
      this.updateSize()
      this.observeSize()
    }
  }

  beforeDestroy () {
    this.vscrollParent.$off('vscroll:update', this.onVscrollUpdate)
    this.vscrollParent.$off('vscroll:update-size', this.onVscrollUpdateSize)
    this.unobserveSize()
  }

  /** Methods */

  updateSize () {
    if (this.finalActive) {
      if (this.$_pendingSizeUpdate !== this.id) {
        this.$_pendingSizeUpdate = this.id
        this.$_forceNextVScrollUpdate = null
        this.$_pendingVScrollUpdate = null
        this.computeSize(this.id)
      }
    } else {
      this.$_forceNextVScrollUpdate = this.id
    }
  }

  @Watch('watchData')
  updateWatchData () {
    if (this.watchData) {
      this.$_watchData = this.$watch(
        'data',
        () => {
          this.onDataUpdate()
        },
        {
          deep: true
        }
      )
    } else if (this.$_watchData) {
      this.$_watchData()
      this.$_watchData = null
    }
  }

  onVscrollUpdate ({ force }: { force: boolean }) {
    // If not active, sechedule a size update when it becomes active
    if (!this.finalActive && force) {
      this.$_pendingVScrollUpdate = this.id
    }

    if (this.$_forceNextVScrollUpdate === this.id || force || !this.size) {
      this.updateSize()
    }
  }

  onDataUpdate () {
    this.updateSize()
  }

  async computeSize (id: ID) {
    await this.$nextTick()

    const $el: HTMLElement = this.$el as HTMLElement

    if (this.id === id) {
      const width = $el.offsetWidth
      const height = $el.offsetHeight
      this.applySize(width, height)
    }
    this.$_pendingSizeUpdate = null
  }

  applySize (width: number, height: number) {
    const size = Math.round(
      this.vscrollParent.direction === 'vertical' ? height : width
    )
    if (size && this.size !== size && typeof this.id !== 'undefined') {
      if (this.vscrollParent.$_undefinedMap[this.id]) {
        this.vscrollParent.$_undefinedSizes--
        this.vscrollParent.$_undefinedMap[this.id] = undefined
      }

      this.$set(this.vscrollData.sizes, this.id, size)
      this.$set(this.vscrollData.validSizes, this.id, true)
      if (this.emitResize) this.$emit('resize', this.id)
    }
  }

  observeSize () {
    if (!this.vscrollResizeObserver) return
    this.vscrollResizeObserver.observe(this.$el.parentNode as Element)
      this.$el.parentNode!.addEventListener('resize', this.onResize)
  }

  unobserveSize () {
    if (!this.vscrollResizeObserver) return
    this.vscrollResizeObserver.unobserve(this.$el.parentNode as Element)
      this.$el.parentNode!.removeEventListener('resize', this.onResize)
  }

  onResize (event: Event) {
    const { width, height } = (event as unknown as { detail: ResizeObserverEntry }).detail.contentRect
    this.applySize(width, height)
  }

  onVscrollUpdateSize () {}
}
</script>
