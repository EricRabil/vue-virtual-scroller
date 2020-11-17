<template>
  <div
    v-observe-visibility="handleVisibilityChange"
    class="vue-recycle-scroller"
    :class="{
      ready,
      'busy': busy,
      'page-mode': pageMode,
      [`direction-${direction}`]: true,
    }"
    @scroll.passive="handleScroll"
  >
    <div v-if="$slots.before || invisibleRenderIndices.length > 0" class="vue-recycle-scroller__slot">
      <div v-for="index in invisibleRenderIndices" :key="`invisible-${index}`" style="position: absolute; top: 0; left: 0; opacity: 0; pointer-events: none;">
        <slot :item="items[index]" :index="index" :active="true" />
      </div>
      <slot name="before" />
    </div>

    <div
      ref="wrapper"
      :style="{
        [direction === 'vertical' ? 'minHeight' : 'minWidth']: totalSize + 'px',
      }"
      class="vue-recycle-scroller__item-wrapper"
    >
      <div
        v-for="view of pool"
        :key="view.nr.id"
        :style="
          ready
            ? {
                transform: `translate${direction === 'vertical' ? 'Y' : 'X'}(${
                  view.position
                }px)`,
              }
            : null
        "
        class="vue-recycle-scroller__item-view"
        :class="{ hover: hoverKey === view.nr.key }"
        v-on="
          detectHover
            ? {
                mouseenter: () => (hoverKey = view.nr.key),
                mouseleave: () => (hoverKey = null),
              }
            : {}
        "
        :attr-real="view.position > -9999"
        :attr-position="view.position"
        :attr-key="view.nr.key"
        ref="poolItems"
      >
        <slot :item="view.item" :index="view.nr.index" :active="view.nr.used" />
      </div>
    </div>

    <div v-if="$slots.after" class="vue-recycle-scroller__slot">
      <slot name="after" />
    </div>

    <ResizeObserver @notify="handleResize" />
  </div>
</template>

<script lang="ts">
import { ResizeObserver } from 'vue-resize'
import { ObserveVisibility } from 'vue-observe-visibility'
import { Component, Prop, Watch } from 'vue-property-decorator'
import ScrollParent from 'scrollparent'
import config from '../config'
import { Common } from './common'
import { getRandomString, supportsPassive } from '../utils'
import { PoolItem, NoKey, TypeKey } from '../types'

let uid = 0

type UnusedRecord<T> = Record<TypeKey, PoolItem<T>[] | undefined>

interface RenderRange {
  startIndex: number;
  endIndex: number;
  totalSize: number | null;
}

const NewUnusedRecord: <T>() => UnusedRecord<T> = () => ({
  [NoKey]: []
})

@Component({
  name: 'RecycleScroller',
  components: {
    ResizeObserver
  },
  directives: {
    ObserveVisibility: ObserveVisibility as any
  }
})
export default class RecycleScroller<T = unknown> extends Common<T> {
  @Prop({ default: null })
  itemSize: number | null;

  @Prop({ default: null })
  minItemSize: number | string | null;

  @Prop({ default: 'size' })
  sizeField: keyof T;

  @Prop({ default: 'type' })
  typeField: keyof T;

  @Prop({ default: 200 })
  buffer: number;

  @Prop({ default: false })
  pageMode: boolean;

  @Prop({ default: 0 })
  prerender: number;

  @Prop({ default: false })
  emitUpdate: boolean;

  @Prop({ default: true })
  detectHover: boolean;

  @Prop({ default: () => [] })
  invisibleRenderIndices: number[];

  $refs: {
    poolItems: HTMLDivElement[];
  };

  pool: PoolItem<T>[] = [];
  totalSize = 0;
  ready = false;
  hoverKey: string | null = null;
  scrollTimeout = 0;
  listenerTarget: EventTarget | null = null;

  scrolling = false;

  get sizes () {
    if (this.itemSize === null) {
      const sizes: Record<number, { accumulator: number; size?: number }> = {
        '-1': { accumulator: 0 }
      }
      const items = this.items
      const field = this.sizeField
      const minItemSize = this.minItemSize
      let computedMinSize = 10000
      let accumulator = 0
      let current: number

      for (let i = 0, l = items.length; i < l; i++) {
        current = ((+items[i][field] || minItemSize) as unknown) as number

        if (current < computedMinSize) {
          computedMinSize = current
        }

        accumulator += current
        sizes[i] = { accumulator, size: current }
      }

      // eslint-disable-next-line
      this.$_computedMinItemSize = computedMinSize;
      return sizes
    }

    return []
  }

  $_startIndex: number;
  $_endIndex: number;
  $_views: Record<string, PoolItem<T> | undefined>;
  $_unusedViews: UnusedRecord<T>;
  $_scrollDirty: boolean;
  $_lastUpdateScrollPosition: number;
  $_prerender: boolean;
  $_computedMinItemSize: number;
  $_refreshTimeout: number;
  $_continuous: boolean;
  $_sortTimer: number;
  $_scrollPositions: Record<string, {
    key: unknown;
    boundingY: number;
  } | undefined>;

  /** Lifecycle Hooks */

  created () {
    this.$_startIndex = 0
    this.$_endIndex = 0
    this.$_views = {}
    this.$_unusedViews = NewUnusedRecord()
    this.$_scrollDirty = false
    this.$_lastUpdateScrollPosition = 0
    this.$_scrollPositions = {}

    if (this.prerender) {
      this.$_prerender = true
      this.updateVisibleItems(false)
    }
  }

  async mounted () {
    this.applyPageMode()

    await this.$nextTick()

    this.$_prerender = false
    this.updateVisibleItems(true)
    this.ready = true
  }

  beforeDestroy () {
    this.removeListeners()
    clearTimeout(this.scrollTimeout)
  }

  /** Watchers */

  @Watch('items')
  itemsChanged () {
    this.updateVisibleItems(true)
  }

  @Watch('pageMode')
  pageModeChanged () {
    this.applyPageMode()
    this.updateVisibleItems(false)
  }

  @Watch('sizes', { deep: true })
  sizesChanged () {
    this.updateVisibleItems(false)
  }

  /** Methods */

  resolveKey (item: T, keyField: keyof T | null = this.keyField): string | null {
    return ((keyField ? item[keyField] : item) as unknown as string | undefined) || null
  }

  /**
   * Resolves the key index that should be used for the given item
   * @param item the item to resolve
   * @param typeField the cached type field, if omitted it is retrieved from this
   */
  resolveType (item: T, typeField: keyof T | null = this.typeField): TypeKey {
    return typeField ? ((item[typeField] as unknown as string | undefined) || NoKey) : NoKey
  }

  /**
   * Returns an existing view for an index, or creates a new view corresponding to the given index
   * @param index the index of the item to create
   */
  makeView (index: number, reuse = true, push = true): PoolItem<T> {
    const item = this.items[index]
    const key = this.resolveKey(item, this.keyField)

    if (key === null) {
      throw new Error(`Key is ${key} on item (keyField is '${this.keyField}')`)
    }

    let view = this.$_views[key]

    if (view) {
      view.nr.used = true
      view.item = item
      return view
    }

    const type = this.resolveType(item, this.typeField)
    let unusedPool = this.$_unusedViews[type || NoKey]

    /**
     * Takes an existing view and personalizes it to the current item
     * @param view view to mutate
     */
    const personalize = (view: PoolItem<T>) => {
      view.item = item
      view.nr.used = true
      view.nr.index = index
      view.nr.key = key
      view.nr.type = type

      return view
    }

    if (reuse) {
      if (this.$_continuous) {
        // Reuse an existing view
        if (unusedPool && unusedPool.length) {
          if (view = unusedPool.pop()) {
            personalize(view)
          }
        } else {
          // Birth a new view
          view = this.addView(this.pool, index, item, key, type, push)
        }
      } else {
        if (!unusedPool || unusedPool.length === 0) {
          view = this.addView(this.pool, index, item, key, type, push)
          this.unuseView(view, true)
          unusedPool = this.$_unusedViews[type || NoKey]
        }

        view = personalize(unusedPool!.shift()!)
      }
    } else {
      view = this.addView(this.pool, index, item, key, type, push)
    }

    this.$_views[key] = view

    return view!
  }

  /**
   * Adds an item to the provided pool, constructing a PoolItem
   * 
   * @param pool pool to add the item to
   * @param index index of the item being added
   * @param item the inner item data passed to the implementation
   * @param key the vue :key value
   * @param type ???
   */
  addView (
    pool: PoolItem<T>[],
    index: number,
    item: T,
    key: string,
    type: TypeKey,
    push = true
  ): PoolItem<T> {
    const view: Partial<PoolItem<T>> = {
      item,
      position: 0
    }

    /**
     * Defines the non-reactive data for this item, Vue will not observe changes here
     */
    Object.defineProperty(view, 'nr', {
      configurable: false,
      value: {
        id: uid++,
        index,
        used: true,
        key,
        type
      }
    })

    if (push) pool.push(view as PoolItem<T>)

    return view as PoolItem<T>
  }

  /**
   * Inserts a view into the unused pool
   * @param view the view to unuse
   * @param fake whether this is a placeholder view
   */
  unuseView (view: PoolItem<T>, fake = false) {
    const unusedViews = this.$_unusedViews
    const { type } = view.nr

    let unusedPool = unusedViews[type]

    if (!unusedPool) {
      unusedPool = []
      unusedViews[type] = unusedPool
    }

    unusedPool.push(view)

    if (!fake) {
      view.nr.used = false
      view.position = -9999
      this.$_views[view.nr.key] = undefined
    }
  }

  handleResize () {
    this.$emit('resize')
    if (this.ready) this.updateVisibleItems(false)
  }

  handleScroll () {
    this.scrolling = true

    if (!this.$_scrollDirty) {
      this.$_scrollDirty = true
      requestAnimationFrame(() => {
        this.$_scrollDirty = false
        const continuous = this.updateVisibleItems(false)

        // It seems sometimes chrome doesn't fire scroll event :/
        // When non continous scrolling is ending, we force a refresh
        if (!continuous) {
          clearTimeout(this.$_refreshTimeout)
          this.$_refreshTimeout = setTimeout(this.handleScroll, 100)
        }
      })
    }

    clearTimeout(this.scrollTimeout)
    this.scrollTimeout = setTimeout(() => {
      this.scrolling = false
    }, 100)
  }

  handleVisibilityChange (
    isVisible: boolean,
    entry: { boundingClientRect: DOMRect }
  ) {
    if (this.ready) {
      if (
        isVisible ||
        entry.boundingClientRect.width !== 0 ||
        entry.boundingClientRect.height !== 0
      ) {
        this.$emit('visible')
        requestAnimationFrame(() => {
          this.updateVisibleItems(false)
        })
      } else {
        this.$emit('hidden')
      }
    }
  }

  $_lastStartIndex: number
  $_lastEndIndex: number
  $_lastTotalSize: number

  busy = false

  /**
   * Determines the range of items to be rendered
   * @param checkPositionDiff whether to take the position difference into account when computing
   * @returns render range, or null if the position hasn't changed enough
   */
  computeRenderRange (checkPositionDiff = false): RenderRange | null {
    if (this.busy && typeof this.$_lastStartIndex === 'number' && typeof this.$_lastEndIndex === 'number' && typeof this.$_lastTotalSize !== 'undefined') {
      return {
        startIndex: this.$_lastStartIndex,
        endIndex: this.$_lastEndIndex,
        totalSize: this.$_lastTotalSize
      }
    }

    const items = this.items
    const count = items.length
    const itemSize = this.itemSize
    const minItemSize = this.$_computedMinItemSize
    const sizes = this.sizes

    let startIndex, endIndex, totalSize

    if (!count) {
      // Reset all the things
      startIndex = endIndex = totalSize = 0
    } else if (this.$_prerender) {
      // SSR, render from the start to the configured pre-render index
      startIndex = 0
      endIndex = this.prerender
      totalSize = 0
    } else {
      const scroll = this.getScroll()

      // Skip update if use hasn't scrolled enough
      if (checkPositionDiff) {
        let positionDiff = scroll.start - this.$_lastUpdateScrollPosition
        if (positionDiff < 0) positionDiff = -positionDiff
        if (
          (itemSize === null && positionDiff < minItemSize) ||
          positionDiff < (itemSize || 0)
        ) {
          return null
        }
      }

      this.$_lastUpdateScrollPosition = scroll.start

      const buffer = this.buffer
      scroll.start -= buffer
      scroll.end += buffer

      // Variable size mode
      if (itemSize === null) {
        let h
        let a = 0
        let b = count - 1
        let i = ~~(count / 2)
        let oldI

        // Searching for startIndex
        do {
          oldI = i
          h = sizes[i].accumulator
          if (h < scroll.start) {
            a = i
          } else if (i < count - 1 && sizes[i + 1].accumulator > scroll.start) {
            b = i
          }
          i = ~~((a + b) / 2)
        } while (i !== oldI)
        i < 0 && (i = 0)
        startIndex = i

        // For container style
        totalSize = sizes[count - 1].accumulator

        // Searching for endIndex
        for (
          endIndex = i;
          endIndex < count && sizes[endIndex].accumulator < scroll.end;
          endIndex++
        );
        if (endIndex === -1) {
          endIndex = items.length - 1
        } else {
          endIndex++
          // Bounds
          endIndex > count && (endIndex = count)
        }
      } else {
        // Fixed size mode
        startIndex = ~~(scroll.start / itemSize)
        endIndex = Math.ceil(scroll.end / itemSize)

        // Bounds
        startIndex < 0 && (startIndex = 0)
        endIndex > count && (endIndex = count)

        totalSize = count * itemSize
      }
    }

    this.$_lastStartIndex = startIndex
    this.$_lastEndIndex = endIndex
    this.$_lastTotalSize = this.totalSize = totalSize

    return {
      startIndex,
      endIndex,
      totalSize
    }
  }

  /**
   * Gets the current scroll positions
   */
  getScroll (): {
    start: number;
    end: number;
    } {
    const { $el: el, direction } = this
    const isVertical = direction === 'vertical'
    let scrollState: {
      start: number;
      end: number;
    }

    if (this.pageMode) {
      const bounds = el.getBoundingClientRect()
      const boundsSize = isVertical ? bounds.height : bounds.width
      let start = -(isVertical ? bounds.top : bounds.left)
      let size = isVertical ? window.innerHeight : window.innerWidth
      if (start < 0) {
        size += start
        start = 0
      }
      if (start + size > boundsSize) {
        size = boundsSize - start
      }
      scrollState = {
        start,
        end: start + size
      }
    } else if (isVertical) {
      scrollState = {
        start: el.scrollTop,
        end: el.scrollTop + el.clientHeight
      }
    } else {
      scrollState = {
        start: el.scrollLeft,
        end: el.scrollLeft + el.clientWidth
      }
    }

    return scrollState
  }

  /**
   * Rebuilds the render pool using a given range
   * @param renderRange the range of items to render, returned by computeRenderRange
   * @param checkItem whether to ensure all pool items have the same index
   */
  applyRenderRange ({ startIndex, endIndex }: RenderRange, checkItem: boolean): boolean {
    const continuous = startIndex <= this.$_endIndex && endIndex >= this.$_startIndex
    let item: T, view: PoolItem<T> | undefined

    if (this.$_continuous !== continuous) {
      // Teardown all views
      if (continuous) {
        this.$_views = {}
        this.$_unusedViews = {
          [NoKey]: []
        }
        for (let i = 0, l = this.pool.length; i < l; i++) {
          view = this.pool[i]
          this.unuseView(view)
        }
      }
      this.$_continuous = continuous
    } else if (continuous) {
      for (let i = 0, l = this.pool.length; i < l; i++) {
        view = this.pool[i]
        if (view.nr.used) {
          // Update view item index
          if (checkItem) {
            view.nr.index = this.items.findIndex((item) =>
              this.keyField
                ? item[this.keyField] === view!.item[this.keyField]
                : item === view!.item
            )
          }

          // Check if index is still in visible range
          if (
            view.nr.index === -1 ||
            view.nr.index < startIndex ||
            view.nr.index >= endIndex
          ) {
            this.unuseView(view)
          }
        }
      }
    }

    for (let i = startIndex; i < endIndex; i++) {
      if (i === this.items.length - 1) this.$emit('scrolledtoend')
      if (i === 0) this.$emit('scrolledtobegin')
      
      item = this.items[i]
      const key = this.resolveKey(item, this.keyField)

      if (key === null) {
        throw new Error(`Key is ${key} on item (keyField is '${this.keyField}')`)
      }

      view = this.$_views[key]

      if (!this.itemSize && !this.sizes[i].size) {
        // Discard because there's no size
        if (view) this.unuseView(view)
        continue
      }

      view = this.makeView(i)

      // Update position
      if (this.itemSize === null) {
        view!.position = this.sizes[i - 1].accumulator
      } else {
        view!.position = i * this.itemSize
      }
    }

    this.$_startIndex = startIndex
    this.$_endIndex = endIndex

    return continuous
  }

  /**
   * Updates the pool of visible items
   * @param checkItem whether to ensure item indices are still accurate
   * @param checkPositionDiff whether to abort update if the position hasn't changed enough
   */
  updateVisibleItems (checkItem: boolean, checkPositionDiff = false): boolean {
    const count = this.items.length
    
    const bounds = this.computeRenderRange(checkPositionDiff)

    if (!bounds) {
      return true
    }

    let { startIndex, endIndex, totalSize } = bounds

    if (startIndex < 0) startIndex = 0
    if (endIndex >= count) endIndex = count - 1

    if (endIndex - startIndex > config.itemsLimit) {
      this.itemsLimitError()
    }

    const continuous = this.applyRenderRange({
      startIndex,
      endIndex,
      totalSize
    }, checkItem)

    if (this.emitUpdate) this.$emit('update', startIndex, endIndex)

    this.requestSortViews()

    return continuous
  }

  /**
   * Sorts the render pool by index
   */
  sortViews () {
    this.pool.sort((viewA, viewB) => viewA.nr.index - viewB.nr.index)
  }

  /**
   * Debounced organization of render pool arary
   */
  requestSortViews () {
    // After the user has finished scrolling
    // Sort views so text selection is correct
    clearTimeout(this.$_sortTimer)
    this.$_sortTimer = setTimeout(this.sortViews, 300)
  }

  /**
   * Returns the element to listen to scroll/resize events on
   */
  getListenerTarget (): EventTarget | null {
    let target: EventTarget | null = ScrollParent(this.$el as HTMLElement)
    // Fix global scroll target for Chrome and Safari
    if (window.document && (target === window.document.documentElement || target === window.document.body)) {
      target = window
    }

    return target
  }

  /**
   * Binds scroll/resize listeners to the configured listenerTarget
   */
  addListeners () {
    this.listenerTarget = this.getListenerTarget()

    this.listenerTarget?.addEventListener('scroll', this.handleScroll, supportsPassive ? {
      passive: true
    } : false)

    this.listenerTarget?.addEventListener('resize', this.handleResize)
  }

  /**
   * Removes scroll/resize listeners from the configured listenerTarget
   */
  removeListeners () {
    if (!this.listenerTarget) return

    this.listenerTarget.removeEventListener('scroll', this.handleScroll)
    this.listenerTarget.removeEventListener('resize', this.handleResize)

    this.listenerTarget = null
  }
  
  /**
   * Computes the current position of an item with the given index
   * @param index index of the item to compute
   * @returns scroll offset
   */
  scrollPositionForItem (index: number): number {
    let scroll: number

    if (this.itemSize === null) {
      scroll = index > 0 ? this.sizes[index - 1].accumulator : 0
    } else {
      scroll = index * this.itemSize
    }

    return scroll
  }
  
  /**
   * Computes the current position of an item with the given key
   * @param key key of the item to compute
   * @returns scroll offset
   */
  scrollPositionForItemWithKey (key: unknown): number {
    return this.scrollPositionForItem(this.items.findIndex(({ [this.keyField]: itemKey }) => itemKey === key))
  }

  /**
   * Saves the current scroll position, to be restored later
   * @returns unique string to fetch the scroll position later
   */
  saveScrollPosition (): string | null {
    const scrollID = getRandomString()

    const item = this.firstRealPoolItem()

    if (!item) return null
    
    let key: unknown = item.getAttribute('attr-key')
    key = +(key as string) || key

    if (key === null) return null

    this.$_scrollPositions[scrollID] = {
      boundingY: item.getBoundingClientRect().y - this.$el.getBoundingClientRect().y,
      key
    }

    return scrollID
  }

  /**
   * Returns the last rendered pool item
   */
  lastRealPoolItem (): HTMLDivElement | null {
    return this.realPoolItems().reverse()[0] || null
  }

  /**
   * Returns the first rendered pool item
   */
  firstRealPoolItem (): HTMLDivElement | null {
    return this.realPoolItems()[0] || null
  }

  /**
   * Returns real pool items sorted by their position
   */
  realPoolItems (): HTMLDivElement[] {
    const items = this.$refs.poolItems?.filter(item => item.getAttribute('attr-real') === 'true') || []

    return items.sort((item1, item2) => +item1.getAttribute('attr-position')! - +item2.getAttribute('attr-position')!)
  }

  /**
   * Restores a previously saved scroll position
   */
  restoreScrollPosition (id: string, clear = true) {
    const saved = this.$_scrollPositions[id]

    if (!saved) return
    else if (clear) this.$_scrollPositions[id] = undefined

    const newPosition = this.scrollPositionForItemWithKey(saved.key)

    this.scrollToPosition(newPosition - saved.boundingY)
  }

  /**
   * Scrolls the item with the given index into view
   * @param index index of the item to reveal
   */
  scrollToItem (index: number) {
    this.scrollToPosition(this.scrollPositionForItem(index))
  }

  /**
   * Scrolls the view to the given absolute position, in px
   * @param position the position to scroll to
   */
  scrollToPosition (position: number) {
    if (this.direction === 'vertical') {
      this.$el.scrollTop = position
    } else {
      this.$el.scrollLeft = position
    }
  }

  /**
   * Raises an error regarding broken scrolling
   */
  itemsLimitError () {
    setTimeout(() => {
      console.log(
        'It seems the scroller element isn\'t scrolling, so it tries to render all the items at once.',
        'Scroller:',
        this.$el
      )
      console.log(
        'Make sure the scroller has a fixed height (or width) and \'overflow-y\' (or \'overflow-x\') set to \'auto\' so it can scroll correctly and only render the items visible in the scroll viewport.'
      )
    })
    throw new Error('Rendered items limit reached')
  }

  /**
   * Configures the necessary listeners for functionality
   */
  applyPageMode () {
    if (this.pageMode) {
      this.addListeners()
    } else {
      this.removeListeners()
    }
  }
}
</script>

<style>
.vue-recycle-scroller {
  position: relative;
}

.vue-recycle-scroller.busy::-webkit-scrollbar {
  display: none;
}

.vue-recycle-scroller.direction-vertical:not(.page-mode) {
  overflow-y: auto;
}

.vue-recycle-scroller.direction-horizontal:not(.page-mode) {
  overflow-x: auto;
}

.vue-recycle-scroller.direction-horizontal {
  display: flex;
}

.vue-recycle-scroller__slot {
  flex: auto 0 0;
}

.vue-recycle-scroller__item-wrapper {
  flex: 1;
  box-sizing: border-box;
  overflow: hidden;
  position: relative;
}

.vue-recycle-scroller.ready .vue-recycle-scroller__item-view {
  position: absolute;
  top: 0;
  left: 0;
  will-change: transform;
}

.vue-recycle-scroller.direction-vertical .vue-recycle-scroller__item-wrapper {
  width: 100%;
}

.vue-recycle-scroller.direction-horizontal .vue-recycle-scroller__item-wrapper {
  height: 100%;
}

.vue-recycle-scroller.ready.direction-vertical
  .vue-recycle-scroller__item-view {
  width: 100%;
}

.vue-recycle-scroller.ready.direction-horizontal
  .vue-recycle-scroller__item-view {
  height: 100%;
}
</style>
