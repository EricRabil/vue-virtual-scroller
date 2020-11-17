<template>
  <RecycleScroller
    ref="scroller"
    :items="itemsWithSize"
    :min-item-size="minItemSize"
    :direction="direction"
    :debounce="debounce"
    :buffer="buffer"
    :invisibleRenderIndices="indicesNeedingSizeComputationChunked"
    key-field="id"
    v-bind="$attrs"
    @resize="onScrollerResize"
    @visible="onScrollerVisible"
    v-on="listeners"
  >
    <template slot-scope="{ item: itemWithSize, index, active }">
      <slot
        v-bind="{
          item: itemWithSize.item,
          index,
          active,
          itemWithSize,
        }"
      />
    </template>
    <template slot="before">
      <slot name="before" />
    </template>
    <template slot="after">
      <slot name="after" />
    </template>
  </RecycleScroller>
</template>

<script lang="ts">
import RecycleScroller from './RecycleScroller.vue'
import { Component, Prop, Watch } from 'vue-property-decorator'
import { Common } from './common'
import { interleave } from '../utils'

export interface VSCrollData<T = unknown> {
  active: boolean;
  sizes: Record<string, number>;
  validSizes: Record<string, number>;
  keyField: keyof T;
  simpleArray: boolean;
}

export interface DynamicallySizedItem<T = unknown> {
  item: T;
  id: unknown;
  size: number;
  needsComputation: boolean;
}

@Component({
  name: 'DynamicScroller',
  components: {
    RecycleScroller
  },
  inheritAttrs: false,
  provide (this: DynamicScroller) {
    if (typeof ResizeObserver !== 'undefined') {
      this.$_resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.target) {
            const event = new CustomEvent('resize', {
              detail: {
                contentRect: entry.contentRect
              }
            })
            entry.target.dispatchEvent(event)
          }
        }
      })
    }

    return {
      vscrollData: this.vscrollData,
      vscrollParent: this,
      vscrollResizeObserver: this.$_resizeObserver
    }
  }
})
export default class DynamicScroller<T = unknown> extends Common<T> {
  @Prop({ required: true })
  minItemSize: number | string;

  @Prop({ default: 25 })
  chunkedResolution: number | false;

  @Prop({ default: 5 })
  chunkedTickInterval: number;

  $refs: {
    scroller: RecycleScroller<T>;
  };

  $_resizeObserver: ResizeObserver;
  $_undefinedMap: Record<string, boolean | undefined>;
  $_updates: unknown[];
  $_undefinedSizes: number;
  $_scrollingToBottom: boolean;

  vscrollData: VSCrollData<T> = {
    active: true,
    sizes: {},
    validSizes: {},
    keyField: this.keyField,
    simpleArray: false
  };

  indicesNeedingSizeComputationChunked: number[] = []

  /** Computed */

  mounted () {
    this.scheduleNextSizeComputation()
  }

  didDoAComputation = false
  
  /**
   * Determines if there are remaining items to compute the size of, and does so. Reschedules another execution if there are more.
   */
  scheduleNextSizeComputation (): void {
    requestAnimationFrame(async () => {
      let scrollID: string | null = null

      if (this.indicesNeedingSizeComputation.length > 0 && !this.$refs.scroller.scrolling) {
        scrollID = this.$refs.scroller.saveScrollPosition()
        if (scrollID) {
          this.nextIndicesNeedingSizeComputationChunked()
          this.$refs.scroller.busy = true
        }
        this.didDoAComputation = true
      }

      for (let i = 0; i < this.chunkedTickInterval; i++) {
        if (scrollID && i === 4) this.$refs.scroller.restoreScrollPosition(scrollID, false)
        await this.$nextTick()
      }

      if (scrollID) {
        this.$refs.scroller.restoreScrollPosition(scrollID)
      }

      this.$refs.scroller.busy = false

      if (!this.hasMoreToCompute && this.didDoAComputation) {
        this.didDoAComputation = false
        return
      }

      this.scheduleNextSizeComputation()
    })
  }

  @Watch('hasMoreToCompute')
  computeDependenciesChanged (needsComputation: boolean) {
    if (!needsComputation) return
    if (this.didDoAComputation) return
    this.scheduleNextSizeComputation()
  }

  get itemsWithSize (): DynamicallySizedItem<T>[] {
    const result: DynamicallySizedItem<T>[] = []
    const { items, keyField, simpleArray } = this
    const sizes = this.vscrollData.sizes

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const id = simpleArray ? i : ((item[keyField] as unknown) as string)
      let size = sizes[id]
      let needsComputation = false

      if (typeof size === 'undefined' && !this.$_undefinedMap[id]) {
        size = 0
        needsComputation = true
      }

      result.push({
        item,
        id,
        size,
        needsComputation
      })
    }

    return result
  }

  /**
   * Returns items that do not have a resolved size yet, in order of importance for resolution
   */
  get indicesNeedingSizeComputation (): number[] {
    if (this.chunkedResolution === false) return []
    return this.itemsWithSize.map(({ needsComputation }, index) => needsComputation ? index : -1).filter(i => i > -1).sort()
  }

  /**
   * Returns items stemming from the start index that need computation–these are important to load ASAP because of thrashing issues
   */
  get priorityIndicesNeedingSizeComputation (): number[] | null {
    this.indicesNeedingSizeComputation
    if (!this.$refs.scroller) return null
    if (typeof this.$refs.scroller.$_lastStartIndex !== 'number') return null

    const priorityIndices = this.indicesNeedingSizeComputation.slice(0, this.$refs.scroller.$_lastStartIndex).sort((a, b) => b - a)

    console.log(priorityIndices)

    if (priorityIndices.length === 0) return null

    return priorityIndices
  }

  get hasMoreToCompute (): boolean {
    return !!this.priorityIndicesNeedingSizeComputation || this.indicesNeedingSizeComputation.length > 0
  }

  /**
   * Loads the next ten indices needing a size computation
   */
  nextIndicesNeedingSizeComputationChunked (): void {
    if (this.chunkedResolution === false) return
    this.indicesNeedingSizeComputationChunked = (this.priorityIndicesNeedingSizeComputation || this.indicesNeedingSizeComputation).slice(0, this.chunkedResolution)
  }

  get listeners () {
    const listeners: Record<string, Function | Function[]> = {}
    for (const key in this.$listeners) {
      if (key !== 'resize' && key !== 'visible') {
        listeners[key] = this.$listeners[key]
      }
    }
    return listeners
  }

  /** Watchers */

  @Watch('items')
  itemsChanged () {
    this.forceUpdate(false)
  }

  @Watch('simpleArray', { immediate: true })
  simpleArrayChanged () {
    this.vscrollData.simpleArray = !!this.simpleArray
  }

  @Watch('direction')
  directionChanged () {
    this.forceUpdate(true)
  }

  /** Lifecycle */

  created () {
    this.$_updates = []
    this.$_undefinedSizes = 0
    this.$_undefinedMap = {}
  }

  activated () {
    this.vscrollData.active = true
  }

  deactivated () {
    this.vscrollData.active = false
  }

  /** Methods */

  onScrollerResize () {
    const scroller = this.$refs.scroller
    if (scroller) {
      this.forceUpdate()
    }
    this.$emit('resize')
  }

  onScrollerVisible () {
    this.$emit('vscroll:update', { force: false })
    this.$emit('visible')
  }

  forceUpdate (clear = true) {
    if (clear || this.simpleArray) {
      this.vscrollData.validSizes = {}
    }
    this.$emit('vscroll:update', { force: true })
  }

  scrollToItem (index: number) {
    const scroller = this.$refs.scroller
    if (scroller) scroller.scrollToItem(index)
  }

  getItemSize (item: T, index: number | null = null) {
    const id: number | string = this.simpleArray
      ? index != null
        ? index
        : this.items.indexOf(item)
      : (item[this.keyField] as unknown as string)
    return this.vscrollData.sizes[id] || 0
  }

  scrollToBottom () {
    if (this.$_scrollingToBottom) return
    this.$_scrollingToBottom = true
    const el = this.$el
    // Item is inserted to the DOM
    this.$nextTick(() => {
      el.scrollTop = el.scrollHeight + 5000
      // Item sizes are computed
      const cb = () => {
        el.scrollTop = el.scrollHeight + 5000
        requestAnimationFrame(() => {
          el.scrollTop = el.scrollHeight + 5000
          if (this.$_undefinedSizes === 0) {
            this.$_scrollingToBottom = false
          } else {
            requestAnimationFrame(cb)
          }
        })
      }
      requestAnimationFrame(cb)
    })
  }
}
</script>
