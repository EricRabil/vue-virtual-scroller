import { Prop, Vue } from 'vue-property-decorator'

export class Common<T = unknown> extends Vue {
  @Prop({ required: true })
  items: T[];

  @Prop({ default: 'id' })
  keyField: keyof T;

  @Prop({ default: 'vertical', validator: (value) => ['vertical', 'horizontal'].includes(value) })
  direction: string;

  @Prop({ default: 0 })
  debounce: number | string;

  get simpleArray () {
    return this.items.length && typeof this.items[0] !== 'object'
  }
}
