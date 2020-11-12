<template>
  <RecycleScroller
    ref="scroller"
    :items="itemsWithSize"
    :min-item-size="minItemSize"
    :direction="direction"
    :debounce="debounce"
    :buffer="buffer"
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

export interface VSCrollData<T = unknown> {
  active: boolean;
  sizes: Record<string, number>;
  validSizes: Record<string, number>;
  keyField: keyof T;
  simpleArray: boolean;
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

  /** Computed */

  get itemsWithSize () {
    const result = []
    const { items, keyField, simpleArray } = this
    const sizes = this.vscrollData.sizes

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const id = simpleArray ? i : ((item[keyField] as unknown) as string)
      let size = sizes[id]
      if (typeof size === 'undefined' && !this.$_undefinedMap[id]) {
        size = 0
      }
      result.push({
        item,
        id,
        size
      })
    }

    return result
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
