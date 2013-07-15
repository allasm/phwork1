Queue = function() {
    this.data = [];
};

Queue.prototype = {

    push: function(v) {
        this.data.push(v);
    },

    pop: function(v) {
        return this.data.shift();
    },

    size: function() {
        return this.data.length;
    }
};

//==================================================================================================

/*
MinPriorityQueue = function() {
    this.data = [];
};

Ext.extend(MinPriorityQueue, Object, {

    // see CLR, "Priority Queues", p.138 or "Fibonacci Heaps", p.476

    init: function(numElements, defaultValue) {
        // ..
    },

    setKey: function(obj, key) {
        // ..
    },

    extractMin: function() {
        // return ..
    },

    size: function() {
        // return ..
    }
});
*/
