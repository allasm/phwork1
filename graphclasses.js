//-------------------------------------------------------------

InternalGraph = function() {
    this.v        = [];  // for each V lists (as unordered arrays of ids) vertices connected from V
    this.inedges  = [];  // for each V lists (as unordered arrays of ids) vertices connecting to V

    this.weights  = [];  // for each V contains outgoing edge weights as {target1: weight1, t2: w2}

    this.idToName = [];
    this.nameToId = {};

    this.root = undefined;
    this.numRealVertices = 0;

    this.vWidth = [];
    this.defaultNodeWidth = 0;
};

InternalGraph.prototype = {

    //-[construction from user input]-----------------------
    /*
    var sampleInputG = [
        { name :'a', outedges: [ {to: 'b', weight: 1}, {to: 'f', weight: 1}, {to: 'e', weight: 1} ], width: 10 },
        { name :'b', outedges: [ {to: 'c', weight: 1} ], width: 10 },
        { name :'c', outedges: [ {to: 'd', weight: 2} ], width: 10 },
        { name :'d', outedges: [ {to: 'h', weight: 1} ], width: 10 },
        { name :'e', outedges: [ {to: 'g', weight: 1} ], width: 10 },
        { name :'f', outedges: [ {to: 'g', weight: 1} ], width: 10 },
        { name :'g', outedges: [ {to: 'h', weight: 1} ], width: 10 },
        { name :'h', width: 10 }
    ];
    */
    init_from_user_graph: function(inputG, defaultNodeWidth) {

        this._addVertex( "virtual_root", null, defaultNodeWidth );
        this.root = this.getVertexIdByName("virtual_root");

        for (var v = 0; v < inputG.length; v++) {
            var width = inputG[v].hasOwnProperty('width') ?
                        inputG[v].width :
                        defaultNodeWidth;

            this._addVertex( inputG[v].name, null, width );   // id is not known yet
        }

        for (var v = 0; v < inputG.length; v++) {
            var nextV = inputG[v];

            var vID = this.getVertexIdByName( nextV.name );

            if (nextV.outedges) {
                for (var outE = 0; outE < nextV.outedges.length; outE++) {
                    var targetName = nextV.outedges[outE].to;
                    var weight     = 1;
                    if (nextV.outedges[outE].hasOwnProperty('weight'))
                        weight = nextV.outedges[outE].weight;

                    var targetID   = this.getVertexIdByName( targetName );

                    this._addEdge( vID, targetID, weight );
                }
            }
        }
        
        // for all vertices without an in-edge and add an in-edge from virtual_root
        for (var v = 0; v < inputG.length; v++) {
            vid = this.getVertexIdByName( inputG[v].name );

            if ( this.getInEdges(vid).length == 0 ) {
                //console.log("=== adding edge to virtual parent: " + this.root + " -> " + vid);
                this._addEdge( this.root, vid, 7 );
            }
        }

        this.numRealVertices = this.v.length;    // used during later stages to separate real vertices from virtual-multi-rank-edge-breaking ones

        this.defaultNodeWidth = defaultNodeWidth;

        this.validate();
    },
    //-----------------------[construction from user input]-


    //-[construction for ordering]--------------------------

    // After rank assignment, edges between nodes more than one rank apart are replaced by
    // chains of unit length edges between temporary or ‘‘virtual’’ nodes. The virtual nodes are
    // placed on the intermediate ranks, converting the original graph into one whose edges connect
    // only nodes on adjacent ranks. Self-edges are ignored in this pass, and multi-edges are merged
    // as in the previous pass.
    //
    // Note: ranks is modified to contain ranks of virtual nodes as well

    makeGWithSplitMultiRankEdges: function (ranks, maxRank, virtualNodeWidth) {
        if (!virtualNodeWidth) virtualNodeWidth = this.defaultNodeWidth;

        var newG = new InternalGraph();

        newG.numRealVertices = this.numRealVertices;

        newG.defaultNodeWidth = virtualNodeWidth;

        newG.root = this.root;

        // add all original vertices
        for (var i = 0; i < this.idToName.length; i++) {
            newG._addVertex( this.idToName[i], i, this.vWidth[i] );
        }

        // go over all original edges:
        // - if edge conects vertices with adjacent ranks just add it
        // - else create a series of virtual vertices and edges and add them together
        for (var sourceV = 0; sourceV < this.v.length; sourceV++) {

            var sourceRank = ranks[sourceV];

            for (var i = 0; i < this.v[sourceV].length; i++) {
                var targetV = this.v[sourceV][i];

                var weight = this.getEdgeWeight(sourceV, targetV);

                var targetRank = ranks[targetV];

                if (targetRank >= sourceRank - 1 && targetRank <= sourceRank + 1) {
                    newG._addEdge( sourceV, targetV, weight );
                }
                else {
                    var sourceName = this.getVertexNameById(sourceV);
                    var targetName = this.getVertexNameById(targetV);

                    // create virtual vertices & edges
                    if (targetRank > sourceRank) {
                        var prevV = sourceV;
                        for (var midRank = sourceRank+1; midRank < targetRank; midRank++) {
                            var nextV = newG._addVertex( sourceName + '->' + targetName + '_' + (midRank-sourceRank-1));
                            ranks[nextV] = midRank;
                            newG._addEdge( prevV, nextV, weight);
                            prevV = nextV;
                        }
                        newG._addEdge(prevV, targetV, weight);
                    }
                    else {
                        var prevV = targetV;
                        for (var midRank = targetRank-1; midRank > sourceRank; midRank--) {
                            var nextV = newG._addVertex( sourceName + '->' + targetName + '_' + (midRank-targetRank+1));
                            ranks[nextV] = midRank;
                            newG._addEdge( prevV, nextV, weight);
                            prevV = nextV;
                        }
                        newG._addEdge(prevV, sourceV, weight);
                    }
                }
            }
        }

        newG.validate();

        //newG.findAllEdgesBetweenRanks(ranks, maxRank);

        return newG;
    },

    /*
    findAllEdgesBetweenRanks: function(ranks, maxRank)
    {
        // precompute for speed
        this.edgesBetweenRankAndBelow = [];

        for (var r = 0; r < maxRank; r++) {
            this.edgesBetweenRankAndBelow[r] = [];
        }

        for (var v = 0; v < this.v.length; v++) {
            var outEdges = this.getOutEdges(v);

            for (var i = 0; i < outEdges.length; i++) {
                var u = outEdges[i];

                if (v == u) continue;

                if (ranks[v] == ranks[u]) throw "Assertion failure";

                if (ranks[v]<ranks[u])
                    this.edgesBetweenRankAndBelow[ranks[v]].push( [v,u] );
                else
                    this.edgesBetweenRankAndBelow[ranks[u]].push( [u,v] );
            }
        }
    },
    */
    //-------------------------[construction for ordering]--


    // id: optional. If not given next available is used.
    _addVertex: function(name, id, width) {
        if (this.nameToId.hasOwnProperty(name)) throw "addVertex: [" + name + "] is already in G";
        if (id && this.idToName[id]) throw "addVertex: vertex with id=" + id + " is already in G";

        var nextId = (id == null) ? this.v.length : id;

        this.v[nextId] = [];

        this.inedges[nextId] = [];

        this.weights[nextId] = {};

        this.idToName[nextId] = name;

        this.nameToId[name] = nextId;

        this.vWidth[nextId] = width ? width : this.defaultNodeWidth;

        return nextId;
    },

    _addEdge: function(fromV, toV, weight) {
        if (this.v.length < Math.max(fromV, toV))
            throw "addEdge: vertex ID=" + Math.max(fromV, toV) + "] is not in G";

        if (this.hasEdge(fromV,toV))
            throw "addEdge: edge from ID="+fromV+" to ID="+toV+" already exists";
            // [maybe] add weights if the same edge is present more than once?

        this.v[fromV].push(toV);
        this.inedges[toV].push(fromV);
        this.weights[fromV][toV] = weight;
    },

    unplugVirtualVertex: function(v) {
        // disconnectes virtual node from parent/child so thatg it is easy to recycle/remove later
        if (v <= this.getMaxRealVertexId())
            throw "Attempting to unplug a non-virtual vertex";

        // virtiual nodes guaranteed to have only one in and one out edge
        var parent = this.inedges[v][0];
        var child  = this.v[v][0];
       
        // replace outgoing edge for parent from V to child
        var idx1 = this.v[parent].indexOf(v);
        this.v[parent][idx1] = child;        
        // replace incoming edge for child from V to parent
        var idx2 = this.inedges[child].indexOf(v);
        this.inedges[child][idx2] = parent;

        this.weights[parent][child] = this.weights[parent][v];

        this.v[v] = [];
        this.inedges[v] = [];
        this.weights[v] = {};
    },

    validate: function() {
        for (var v = 0; v < this.inedges.length; v++) {
            if (v!=this.root && this.inedges[v].length == 0)
                throw "Non-root vertex [" + v + "], name=" + this.getVertexNameById(v) + " has no in-edges";
        }
    },

    getVertexIdByName: function(name) {
        if (!this.nameToId.hasOwnProperty(name))
            throw "getVertexIdByName: No such vertex [" + name + "]";
        return this.nameToId[name];
    },

    getVertexNameById: function(v) {
        if (!this.idToName.hasOwnProperty(v))
            throw "getVertexNameById: No such vertex [" + v + "]";
        return this.idToName[v];
    },

    getVertexWidth: function(v) {
        return this.vWidth[v];
    },

    getVertexHalfWidth: function(v) {
        return Math.floor(this.vWidth[v]/2);
    },

    getEdgeWeight: function(fromV, toV) {
        return this.weights[fromV][toV];
    },

    hasEdge: function(fromV, toV) {
        return this.weights[fromV].hasOwnProperty(toV);
    },

    getNumVertices: function() {
        return this.v.length;
    },

    getMaxRealVertexId: function() {
        return this.numRealVertices - 1; // vertices with IDs less than this are guaranteed to be "real"
    },

    getOutEdges: function(v) {
        return this.v[v];
    },

    getNumOutEdges: function(v) {
        return this.v[v].length;
    },

    getInEdges: function(v) {
        return this.inedges[v];
    },

    getAllEdgesWithWeights: function(v) {
        var edgeToWeight = {};
        
        var outEdges = this.getOutEdges(v);
        for (var i = 0; i < outEdges.length; i++) {
            var u = outEdges[i];
            edgeToWeight[u] = this.weights[v][u];
        }

        var inEdges = this.getInEdges(v);
        for (var i = 0; i < inEdges.length; i++) {
            var u = inEdges[i];
            if (edgeToWeight.hasOwnProperty(u))
                edgeToWeight[u] += this.weights[u][v];
            else
                edgeToWeight[u] = this.weights[u][v];
        }

        return edgeToWeight;
    },
	
	isRelationship: function(v) {
	    return (this.getVertexNameById(v).charAt(0) == 'p');
	}

};


//==================================================================================================

RankedSpanningTree = function() {
    this.root    = undefined;
    this.maxRank = undefined;

    this.edges  = [];         // similar to G.v - list of list of edges: [ [...], [...] ]
                              // but each edge is listed twice: both for in- and out-vertex

    this.rank   = [];         // list of ranks, index == vertexID
    this.parent = [];         // list of parents, index == vertexID
};

RankedSpanningTree.prototype = {

    initTreeByInEdgeScanning: function(G, initRank) {
        //   [precondition] graph must be acyclic.
        //
        //   Nodes are placed in the queue when they have no unscanned in-edges.
        //   As nodes are taken off the queue, they are assigned the least rank
        //   that satisfies their in-edges, and their out-edges are marked as scanned.

        this.root = G.root;

        this.maxRank = initRank;

        var numScanedInEdges = [];

        for (var i = 0; i < G.getNumVertices(); i++) {
            this.rank.push(undefined);
            this.parent.push(undefined);
            this.edges.push([]);
            numScanedInEdges.push(0);
        }

        var queue = new Queue();
        queue.push( this.root );   // [TODO] for generic graph handling scan all edges and add all
                                   //        with no in-edges to the queue (but: probably easier to add virtual root)

        while ( queue.size() > 0 ) {
            var nextParent = queue.pop();

            // ...assign the least rank satisfying nextParent's in-edges
            var inEdges = G.getInEdges(nextParent);
            var useRank = initRank;
            var parent  = undefined;
            for (var i = 0; i < inEdges.length; i++) {
                var v = inEdges[i];
                if (this.rank[v] >= useRank)
                {
                    useRank = this.rank[v] + 1;
                    parent  = v;
                }
            }

            // add edge to spanning tree
            this.rank[nextParent]   = useRank;
            if (useRank > this.maxRank)
                this.maxRank = useRank;
            this.parent[nextParent] = parent;
            if (parent != undefined)
                this.edges[parent].push(nextParent);

            // ...mark out-edges as scanned
            var outEdges = G.getOutEdges(nextParent);

            for (var u = 0; u < outEdges.length; u++) {
                var vertex = outEdges[u];

                numScanedInEdges[vertex]++;

                var numRealInEdges = G.getInEdges(vertex).length;

                if (numScanedInEdges[vertex] == numRealInEdges) {
                    queue.push(vertex);
                }
            }
        }

        // Note: so far resulting tree only uses edges in the direction they are
        //       used in the original graph. Some other algorithms in the paper
        //       (the "cut_values" part) may violate this property, if applied
        //       to this tree
    },

    getRanks: function() {
        return this.rank;
    },

    getMaxRank: function() {
        return this.maxRank;
    }
};

//==================================================================================================

Ordering = function() {
    this.order      = [];        // array of arrays - for each rank list of vertices in order
    this.vOrder     = [];        // array - for each v vOrder[v] = order within rank
};

Ordering.prototype = {

    init: function(order, vOrder) {
        this.order      = order;
        this.vOrder     = vOrder;
    },

    exchange: function(rank, index1, index2) {
        // exchanges vertices at two given indices within the same given rank

        var v1 = this.order[rank][index1];
        var v2 = this.order[rank][index2];

        this.order[rank][index2] = v1;
        this.order[rank][index1] = v2;

        this.vOrder[v1] = index2;
        this.vOrder[v2] = index1;
    },

    move: function(rank, index, amount) {
        if (amount == 0) return true;

        newIndex = index + amount;
        if (newIndex < 0) return false;

        var ord = this.order[rank];
        if (newIndex > ord.length - 1) return false;

        var v = ord[index];

        if (newIndex > index) {
            for (var i = index; i< newIndex;i++) {
                var vv          = ord[i+1];
                ord[i]          = vv;
                this.vOrder[vv] = i;
            }
        }
        else {
            for (var i = index; i > newIndex; i--) {
                var vv          = ord[i-1];
                ord[i]          = vv;
                this.vOrder[vv] = i;
            }
        }

        ord[newIndex]  = v;
        this.vOrder[v] = newIndex;

        return true;
    },

    copy: function () {
        // returns a deep copy
        var newO = new Ordering();

        _copy2DArray(this.order, newO.order);     // copy a 2D array
        newO.vOrder = this.vOrder.slice(0);       // fast copy of 1D arrays

        return newO;
    },

    assign: function (otherOrder) {
        // makes this a copy of otherOrder (no duplication)
        this.order  = otherOrder.order;
        this.vOrder = otherOrder.vOrder;
    },
	
    moveVertexToRankAndOrder: function ( oldRank, oldOrder, newRank, newOrder ) {
        var v = this.order[oldRank][oldOrder];
	
        this.order[oldRank].splice(oldOrder, 1);

        this.order[newRank].splice(newOrder, 0, v);

        this.vOrder[v] = newOrder;
        for ( var i = newOrder+1; i < this.order[newRank].length; i++ ) {
            var nextV = this.order[newRank][i];
            this.vOrder[nextV]++;
        }
        for ( var i = oldOrder; i < this.order[oldRank].length; i++ ) {
            var nextV = this.order[oldRank][i];
            this.vOrder[nextV]--;
        }        
	}
};

//==================================================================================================

Score = function(maxRealVertexId) {
    this.score           = 0;
    this.inEdgeMaxLen    = [];
    this.maxRealVertexId = maxRealVertexId;
    this.numStraightLong = 0;
};

Score.prototype = {

    add: function(amount) {
        this.score += amount;
    },

    addEdge: function(v, u, length) {
        if (u > this.maxRealVertexId) {
            if (length == 0 && v > this.maxRealVertexId)
                this.numStraightLong++;

            length /= 2;
        }

        if (! this.inEdgeMaxLen[u] || length > this.inEdgeMaxLen[u]) {
            this.inEdgeMaxLen[u] = length;
        }
    },

    isBettertThan: function(otherScore) {
        if (this.score == otherScore.score) {
            if (this.numStraightLong == otherScore.numStraightLong) {
                // if score is the same the arrangements with smaller sum of
                // longest in-edges wins
                if (this.inEdgeMaxLen.length == 0 || otherScore.inEdgeMaxLen.length == 0 ) {
                    printObject(this);
                    printObject(otherScore);
                }
                return (this.inEdgeMaxLen.reduce(function(a,b){return a+b;}) <
                        otherScore.inEdgeMaxLen.reduce(function(a,b){return a+b;}));
            }
            return (this.numStraightLong > otherScore.numStraightLong);
        }
        return (this.score < otherScore.score);
    }
};

//==================================================================================================

_copy2DArray = function(from, to) {
    for (var i = 0; i < from.length; i++) {
        to.push(from[i].slice(0));
    }
}



function shuffleArray (array) {
    // Using Fisher-Yates Shuffle algorithm

    var counter = array.length, temp, index;

    // While there are elements in the array
    while (counter > 0) {
        // Pick a random index
        index = (Math.random() * counter--) | 0;

        // And swap the last element with it
        temp = array[counter];
        array[counter] = array[index];
        array[index] = temp;
    }

    return array;
}
