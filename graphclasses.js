//-------------------------------------------------------------
var TYPE = {
  RELATIONSHIP: 1,
  CHILDHUB:     2,
  PERSON:       3,
  VIRTUALEDGE:  4
};

InternalGraph = function() {
    this.v        = [];        // for each V lists (as unordered arrays of ids) vertices connected from V
    this.inedges  = [];        // for each V lists (as unordered arrays of ids) vertices connecting to V

    this.weights  = [];        // for each V contains outgoing edge weights as {target1: weight1, t2: w2}

    this.maxRealVertexId = 0;  // used for quick separation of real vertices from virtual-multi-rank-edge-breaking ones

    this.idToName = [];
    this.nameToId = {};

    this.parentlessNodes = [];
    this.leafNodes       = [];

    this.vWidth = [];
    this.defaultNonPersonNodeWidth = 1;
    this.defaultPersonNodeWidth    = 1;

    this.type       = [];      // for each V node type (see TYPE)
    this.properties = [];      // for each V a set of type-specific properties {"sex": "m"/"f"/"u", etc.}
};

InternalGraph.prototype = {

    //-[construction from user input]-----------------------
    init_from_user_graph: function(inputG, defaultPersonNodeWidth, defaultNonPersonNodeWidth) {

        for (var v = 0; v < inputG.length; v++) {
            var properties = {};

            var type = TYPE.PERSON;
            if ( inputG[v].hasOwnProperty('relationship') || inputG[v].hasOwnProperty('rel') )
                type = TYPE.RELATIONSHIP;

            if ( type == TYPE.PERSON ) {
                properties["sex"] = "u";
                if (inputG[v].hasOwnProperty("sex")) {
                     if( inputG[v]["sex"] == "female" || inputG[v]["sex"] == "fem" || inputG[v]["sex"] == "f")
                        properties["sex"] = "f";
                    else if( inputG[v]["sex"] == "male" || inputG[v]["sex"] == "m")
                        properties["sex"] = "m";
                }
            }

            var width = inputG[v].hasOwnProperty('width') ?
                        inputG[v].width :
                        (type == TYPE.PERSON ? defaultPersonNodeWidth : defaultNonPersonNodeWidth);

            this._addVertex( inputG[v].name, null, type, properties, width );   // "null" since id is not known yet

            if ( type == TYPE.RELATIONSHIP )
                this._addVertex( "chhub_" + inputG[v].name, null, TYPE.CHILDHUB, null, width );
        }

        for (var v = 0; v < inputG.length; v++) {
            var nextV = inputG[v];

            var vID    = this.getVertexIdByName( nextV.name );
            var origID = vID;

            if (this.type[vID] == TYPE.RELATIONSHIP) {
                // replace edges from rel node by edges from childhub node
                var childhubID = this.getVertexIdByName( "chhub_" + nextV.name );
                vID = childhubID;
            }

            var maxChildEdgeWeight = 0;

            if (nextV.outedges) {
                for (var outE = 0; outE < nextV.outedges.length; outE++) {
                    var targetName = nextV.outedges[outE].to;
                    var weight     = 1;
                    if (nextV.outedges[outE].hasOwnProperty('weight'))
                        weight = nextV.outedges[outE].weight;

                    if ( weight > maxChildEdgeWeight )
                        maxChildEdgeWeight = weight;

                    var targetID   = this.getVertexIdByName( targetName );

                    this._addEdge( vID, targetID, weight );
                }
            }

            if (this.type[origID] == TYPE.RELATIONSHIP) {
                this._addEdge( origID, vID, maxChildEdgeWeight );
            }
        }

        // find all vertices without an in-edge and vertices without out-edges
        this._updateLeafAndParentlessNodes();

        this.defaultNonPersonNodeWidth = defaultNonPersonNodeWidth;
        this.defaultPersonNodeWidth    = defaultPersonNodeWidth;

        this.validate();
    },

    _updateLeafAndParentlessNodes: function () {
        this.parentlessNodes = [];
        this.leafNodes       = [];

        // find all vertices without an in-edge
        for (var vid = 0; vid < this.v.length; vid++) {
            if ( this.getInEdges(vid).length == 0 ) {
                this.parentlessNodes.push(vid);
            }

            if ( this.getOutEdges(vid).length == 0 ) {
                this.leafNodes.push(vid);
            }
        }
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

    makeGWithSplitMultiRankEdges: function (ranks, maxRank) {
        var newG = new InternalGraph();

        newG.defaultNonPersonNodeWidth = this.defaultNonPersonNodeWidth;
        newG.defaultPersonNodeWidth    = this.defaultPersonNodeWidth;

        // add all original vertices
        for (var i = 0; i < this.idToName.length; i++) {
            newG._addVertex( this.idToName[i], i, this.type[i], this.properties[i], this.vWidth[i] );
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

                if (targetRank < sourceRank)
                    throw "Assertion failed: only forward edges";

                if (targetRank == sourceRank + 1) {
                    newG._addEdge( sourceV, targetV, weight );
                }
                else {
                    var sourceName = this.getVertexNameById(sourceV);
                    var targetName = this.getVertexNameById(targetV);

                    // create virtual vertices & edges
                    var prevV = sourceV;
                    for (var midRank = sourceRank+1; midRank < targetRank; midRank++) {
                        var nextV = newG._addVertex( sourceName + '->' + targetName + '_' + (midRank-sourceRank-1), null, TYPE.VIRTUALEDGE, null, this.defaultNonPersonNodeWidth);
                        ranks[nextV] = midRank;
                        newG._addEdge( prevV, nextV, weight );
                        prevV = nextV;
                    }
                    newG._addEdge(prevV, targetV, weight);
                }
            }
        }

        newG.parentlessNodes = this.parentlessNodes;
        newG.leafNodes       = this.leafNodes;

        newG.validate();

        return newG;
    },
    //--------------------------[construction for ordering]-

    // id: optional. If not given next available is used.
    _addVertex: function(name, id, type, properties, width) {
        if (name != "" && this.nameToId.hasOwnProperty(name)) throw "addVertex: [" + name + "] is already in G";
        if (id && this.idToName[id]) throw "addVertex: vertex with id=" + id + " is already in G";

        var nextId = (id == null) ? this.v.length : id;

        this.v[nextId] = [];

        this.inedges[nextId] = [];

        this.weights[nextId] = {};

        this.idToName[nextId] = name;

        if (name != "")
            this.nameToId[name] = nextId;

        this.vWidth[nextId] = width;

        this.type[nextId] = type;

        this.properties[nextId] = properties;

        if (type != TYPE.VIRTUALEDGE && nextId > this.maxRealVertexId)
            this.maxRealVertexId = nextId;

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

    insertVertex: function(vname, type, properties, edgeWeights, inedges, outedges) {
        if (this.v.length != this.maxRealVertexId + 1)
            throw "Assertion failed: insertVertex() only works for graphs with no virtual edges";   // easier to insert into base graph and recompute virtual than to shift all virtual IDs

        var width = (type == TYPE.PERSON) ? this.defaultPersonNodeWidth : this.defaultNonPersonNodeWidth;

        if (type == TYPE.PERSON && !properties.hasOwnProperty("sex"))
            properties["sex"] = "u";

        var newNodeId = this._addVertex(vname, undefined, type, properties, width);

        // add new edges
        for (var i = 0; i < inedges.length; i++)
            this._addEdge( inedges[i], newNodeId, edgeWeights);
        for (var i = 0; i < outedges.length; i++)
            this._addEdge( newNodeId, outedges[i], edgeWeights);

        this._updateLeafAndParentlessNodes();

        return newNodeId;
    },

    unplugVirtualVertex: function(v) {
        // disconnectes virtual node from parent/child so that it is easy to recycle/remove later
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
        for (var v = 0; v < this.v.length; v++) {
            var outEdges = this.getOutEdges(v);
            var inEdges  = this.getInEdges(v);

            if (this.isPerson(v)) {
                if (inEdges.length > 1)
                    throw "Assertion failed: person nodes can't have two in-edges as people are produced by a single pregnancy (failed for " + this.getVertexNameById(v) + ")";
                for (var i = 0; i < outEdges.length; i++)
                    if (!this.isRelationship(outEdges[i]) && !this.isVirtual(outEdges[i]) )
                        throw "Assertion failed: person nodes have only out edges to relationships (failed for " + this.getVertexNameById(v) + ")";
            }
            else if (this.isRelationship(v)) {
                // TODO: for childless relations this is not true!
                if (outEdges.length == 0)
                    throw "Assertion failed: all relationships should have a childhub associated with them (failed for " + this.getVertexNameById(v) + ")";
                if (outEdges.length > 1)
                    throw "Assertion failed: all relationships should have only one outedge (to a childhub) (failed for " + this.getVertexNameById(v) + ")";
                if (!this.isChildhub(outEdges[0]))
                    throw "Assertion failed: relationships should only have out edges to childhubs (failed for " + this.getVertexNameById(v) + ")";
                if (inEdges.length != 2)
                    throw "Assertion failed: relationships should always have exactly two associated persons (failed for " + this.getVertexNameById(v) + ")";
            }
            else if (this.isVirtual(v)) {
                if (outEdges.length != 1)
                    throw "Assertion failed: all virtual nodes have exactly one out edge (to a virtual node or a relationship)";
                if (inEdges.length != 1)
                    throw "Assertion failed: all virtual nodes have exactly one in edge (from a person or a virtual node)";
                if (!this.isRelationship(outEdges[0]) && !this.isVirtual(outEdges[0]) )
                    throw "Assertion failed: all virtual nodes may only have an outedge to a virtual node or a relationship";
            }
            else if (this.isChildhub(v)) {
                if (outEdges.length < 1)
                    throw "Assertion failed: all childhubs should have at least one child associated with them";  // if not, re-ranking relationship nodes breaks
                for (var i = 0; i < outEdges.length; i++)
                    if (!this.isPerson(outEdges[i]))
                        throw "Assertion failed: childhubs are only connected to people (failed for " + this.getVertexNameById(v) + ")";
            }
        }

        // check for cycles - supposedly pedigrees can't have any
        if (this.parentlessNodes.length == 0)
            throw "Assertion failed: pedigrees should have no cycles (no parentless nodes found)";

        for (var j = 0; j < this.parentlessNodes.length; j++) {
            if ( this._DFSFindCycles( this.parentlessNodes[j], {} ) )
                throw "Assertion failed: pedigrees should have no cycles";
        }

        // check for disconnected components
        var reachable = {};
        this._markAllReachableComponents( this.parentlessNodes[0], reachable );
        for (var v = 0; v < this.v.length; v++) {
            if (!reachable.hasOwnProperty(v))
                throw "Assertion failed: disconnected component detected (" + this.getVertexNameById(v) + ")";
        }

    },

    _DFSFindCycles: function( vertex, visited ) {
        visited[vertex] = true;

        var outEdges = this.getOutEdges(vertex);

        for (var i = 0; i < outEdges.length; i++) {
            var v = outEdges[i];

            if ( visited.hasOwnProperty(v) ) {
                return true;
            }
            else if (this._DFSFindCycles( v, visited )) {
                return true;
            }
        }

        delete visited[vertex];
        return false;
    },

    _markAllReachableComponents: function( vertex, reachable ) {
        reachable[vertex] = true;

        var outEdges = this.getOutEdges(vertex);
        for (var i = 0; i < outEdges.length; i++) {
            var v = outEdges[i];
            if ( !reachable.hasOwnProperty(v) )
                this._markAllReachableComponents( v, reachable );
        }

        var inEdges = this.getInEdges(vertex);
        for (var j = 0; j < inEdges.length; j++) {
            var v = inEdges[j];
            if ( !reachable.hasOwnProperty(v) )
                this._markAllReachableComponents( v, reachable );
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
        return this.maxRealVertexId; // vertices with IDs less or equal to this are guaranteed to be "real"
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
            edgeToWeight[u] = {"weight": this.weights[v][u], "out": true };
        }

        var inEdges = this.getInEdges(v);
        for (var i = 0; i < inEdges.length; i++) {
            var u = inEdges[i];
            edgeToWeight[u] = {"weight": this.weights[u][v], "out": false };
        }

        return edgeToWeight;
    },

	isRelationship: function(v) {
        // TODO
	    return (this.type[v] == TYPE.RELATIONSHIP);
	},

	isChildhub: function(v) {
        // TODO
	    return (this.type[v] == TYPE.CHILDHUB);
	},

	isPerson: function(v) {
	    return (this.type[v] == TYPE.PERSON);
	},

	isVirtual: function(v) {
        return (v > this.getMaxRealVertexId());
	},

	getParents: function(v) {
	    if (!this.isPerson(v))
	        throw "Assertion failed: attempting to get parents of a non-person";
	    // TODO + checks + long edges (this only works on a graph with no virtual nodes)
	    // skips through relationship and child nodes and returns an array of two real parents. If none found returns []
	    if (this.inedges[v].length == 0)
	        return [];
	    return this.inedges[this.inedges[this.inedges[v][0]][0]];
	},

	getProducingRelationship: function(v) {
	    if (!this.isPerson(v))
	        throw "Assertion failed: attempting to get producing relationship of a non-person";
	    // TODO + checks
	    // find the relationship which produces this node (or null if not present)
	    if (this.inedges[v].length == 0) return null;
	    return this.inedges[this.inedges[v][0]][0];
	}
};


//==================================================================================================

RankedSpanningTree = function() {
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

        this.maxRank = initRank;

        var numScanedInEdges = [];

        for (var i = 0; i < G.getNumVertices(); i++) {
            this.rank.push(undefined);
            this.parent.push(undefined);
            this.edges.push([]);
            numScanedInEdges.push(0);
        }

        var queue = new Queue();
        for (var i = 0; i < G.parentlessNodes.length; i++ )
            queue.push( G.parentlessNodes[i] );

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

    insert: function(rank, insertOrder, vertex) {
       this.order[rank].splice(insertOrder, 0, vertex);
       this.vOrder[vertex] = insertOrder;
       for (var next = insertOrder+1; next < this.order[rank].length; next++)
           this.vOrder[ this.order[rank][next] ]++;
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
        // changes vertex order within the same rank. Moves "amount" positions to the right or to the left
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

    moveVertexToRankAndOrder: function ( oldRank, oldOrder, newRank, newOrder ) {
        // changes vertex rank and order. Insertion happens right before the node currently occupying the newOrder position on rank newRank
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
	},

    moveVertexToOrder: function ( rank, oldOrder, newOrder ) {
        // changes vertex order within the same rank. Insertion happens right before the node currently occupying the newOrder position
        // (i.e. changing order form 3 to 4 does nothing, as before position 4 is still position 3)
        var shiftAmount = newOrder - oldOrder;
        this.move( rank, oldOrder, shiftAmount );
	},

	insertAndShiftAllIdsAboveVByOne: function ( v, rank, newOrder ) {
	    // used when when a new vertex is inserted into the graph, which increases all IDs above v by one
	    // so need to modify the data for all existing vertices first, and then insert the new vertex

	    for (var i = this.vOrder.length; i > v; i-- ) {
	        this.vOrder[i] = this.vOrder[i-1];
	    }

	    for (var i = 0; i < this.order.length; i++)
	        for (var j = 0; j < this.order[i].length; j++ ) {
	            if (this.order[i][j] >= v)
	                this.order[i][j]++;
	        }

	    this.insert(rank, newOrder, v);
	}
};


//==================================================================================================

_copy2DArray = function(from, to) {
    for (var i = 0; i < from.length; i++) {
        to.push(from[i].slice(0));
    }
}

_makeFlattened2DArrayCopy = function(array) {
    var flattenedcopy = [].concat.apply([], array);
    return flattenedcopy;
}


/*
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
*/


function swap (array, x, y) {
    var b = array[y];
    array[y] = array[x];
    array[x] = b;
}

function permute2DArrayInFirstDimension (permutations, array, from) {
   var len = array.length;

   if (from == len-1) {
       if ( len == 1 || Math.max.apply(null, array[0]) < Math.max.apply(null, array[len-1]) )   // discard mirror copies of other permutations
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
    var startTime = undefined;
    var lastCheck = undefined;
    this.start();
};

Timer.prototype = {

    start: function() {
        this.startTime = new Date().getTime();
        this.lastCheck = this.startTime;
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

