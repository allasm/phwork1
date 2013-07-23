Queue = function() {
    this.data = [];
};

Queue.prototype = {

    pushAll: function(list) {
        this.data = list.slice(0);
    },

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

