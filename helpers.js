// http://jsperf.com/clone-2d-array/4
function clone2DArray (arr2D) {
    var new2D = [];
    for (var i = 0; i < arr2D.length; ++i) {
        new2D.push(arr2D[i].slice());
    }
    return new2D;
}

// http://jsperf.com/cloning-an-object/4
function cloneObject(obj) {
    var target = {};
    for (var i in obj) {
        if (obj.hasOwnProperty(i))
            target[i] = obj[i];
    }
    return target;
}


function arrayContains(array, item) {
    if (Array.prototype.indexOf) {
        return !(array.indexOf(item) < 0);
    }
    else {
        for (var i = 0; i < array.length; ++i) {
            if (array[i] === item)
                return true;
        }
        return false;
    }
}

function arrayIndexOf(array, item) {
    if (Array.prototype.indexOf) {
        return (array.indexOf(item));
    }
    else {
        for (var i = 0; i < array.length; ++i) {
            if (array[i] === item)
                return i;
        }
        return -1;
    }
}

function indexOfLastMinElementInArray(array) {
    var min      = array[0];
    var minIndex = 0;

    for (var i = 1; i < array.length; ++i) {
        if(array[i] <= min) {
            minIndex = i;
            min      = array[i];
        }
    }
    return minIndex;
}

function replaceInArray(array, value, newValue) {
    for(var i in array){
        if(array[i] == value) {
            array[i] = newValue;
            break;
        }
    }
}

function removeFirstOccurrenceByValue(array, item) {
    for(var i in array) {
        if(array[i] == item) {
            array.splice(i,1);
            break;
        }
    }
}

function isInt(n) {
    //return +n === n && !(n % 1);
    return !(n % 1);
}

_makeFlattened2DArrayCopy = function(array) {
    var flattenedcopy = [].concat.apply([], array);
    return flattenedcopy;
}

function swap (array, i, j) {
    var b = array[j];
    array[j] = array[i];
    array[i] = b;
}

function permute2DArrayInFirstDimension (permutations, array, from) {
   var len = array.length;

   if (from == len-1) {
       permutations.push(_makeFlattened2DArrayCopy(array));
       return;
   }

   for (var j = from; j < len; j++) {
      swap(array, from, j);
      permute2DArrayInFirstDimension(permutations, array, from+1);
      swap(array, from, j);
   }
}



// used for profiling code
Timer = function() {
    this.startTime = undefined;
    this.lastCheck = undefined;
    this.start();
};

Timer.prototype = {

    start: function() {
        this.startTime = new Date().getTime();
        this.lastCheck = this.startTime;
    },

    restart: function() {
        this.start();
    },

    report: function() {
        var current = new Date().getTime();
        var elapsed = current - this.lastCheck;
        return elapsed;
    },

    printSinceLast: function( msg ) {
        var current = new Date().getTime();
        var elapsed = current - this.lastCheck;
        this.lastCheck = current;
        console.log( msg + elapsed + "ms" );
    },
};

