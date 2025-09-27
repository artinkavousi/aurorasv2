export default class AppModule {
    constructor({ id, autoStart = true, order = 0 } = {}) {
        this.id = id || this.constructor.name;
        this.autoStart = autoStart;
        this.order = order;
    }

    async init(/* context */) {}

    async update(/* frameContext */) {}

    async resize(/* resizeContext */) {}

    async dispose(/* context */) {}
}
