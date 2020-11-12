import Vue, { ComponentOptions } from 'vue'

export default function <T extends { item: { id: unknown } }> ({
  idProp = (vm: T) => vm.item.id
} = {}) {
  const store: Record<string, unknown> = {}
  const vm = new Vue({
    data () {
      return {
        store
      }
    }
  })

  interface IDStateInstance extends Vue {
    $_id: unknown;
    $_getId: () => unknown;
    item: {
      id: unknown;
    };
    $_updateIdState(): any;
    $_idStateInit(id: unknown): any;
    $options: ComponentOptions<Vue> & {
      idState: Function;
    };
    idState: unknown;
  }

  // @vue/component
  return Vue.extend({
    data () {
      return {
        idState: null
      }
    },

    created (this: IDStateInstance) {
      this.$_id = null
      if (typeof idProp === 'function') {
        this.$_getId = () => idProp.call(this, this as any)
      } else {
        this.$_getId = () => this[idProp]
      }
      this.$watch(this.$_getId as any, (value) => {
        this.$nextTick(() => {
          this.$_id = value
        })
      }, {
        immediate: true
      })
      this.$_updateIdState()
    },

    beforeUpdate (this: IDStateInstance) {
      this.$_updateIdState()
    },

    methods: {
      /**
       * Initialize an idState
       * @param {number|string} id Unique id for the data
       */
      $_idStateInit (this: IDStateInstance, id: string) {
        const factory = this.$options.idState
        if (typeof factory === 'function') {
          const data = factory.call(this, this)
          vm.$set(store, id, data)
          this.$_id = id
          return data
        } else {
          throw new Error('[mixin IdState] Missing `idState` function on component definition.')
        }
      },

      /**
       * Ensure idState is created and up-to-date
       */
      $_updateIdState (this: IDStateInstance) {
        const id = this.$_getId()
        if (id == null) {
          console.warn(`No id found for IdState with idProp: '${idProp}'.`)
        }
        if (id !== this.$_id) {
          if (!store[id as keyof typeof store]) {
            this.$_idStateInit(id)
          }
          this.idState = store[id as keyof typeof store]
        }
      }
    }
  })
}
