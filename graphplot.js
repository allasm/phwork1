

DrawGraph = function(internalG)
{
    this.G  = internalG;         // real graph
    this.GG = undefined;         // graph with multi-rank edges replaced by virtual vertices/edges

    this.ranks     = undefined;  // array: index = vertex id, value = rank
    this.maxRank   = undefined;  // int:   max rank in the above array (maintained for performance reasons)
    this.order     = undefined;  // class: Ordering
    this.positions = undefined;
};

DrawGraph.prototype = {

    maxInitOrderingIters:  10,          // as a mutiple of top level nodes
    maxOrderingIterations: 24,
    maxXcoordIterations:   8,
    xCoordWeights:         [1, 2, 8],   // see xcoord_score(); edges[real-real,real-virt,virt-virt]
    xCoordEdgeWeightValue: true,        // see xcoord_score()
    mostCompact:           false,

    draw: function( horizontalSeparationDist,      // mandatory argument
                    virtualNodeWidth,              // mandatory argument
                    mostCompact,                   // mandatory argument
                    xcoordEdgeWeightValue,         // optional
                    maxInitOrderingIters,          // optional
                    maxOrderingIterations,         // optional
                    maxXcoordIterations,           // optional
                    xcoordWeights )                // optional
    {
        if (maxInitOrderingIters)  this.maxInitOrderingIterss = maxInitOrderingIters;
        if (maxOrderingIterations) this.maxOrderingIterations = maxOrderingIterations;
        if (maxXcoordIterations)   this.maxXcoordIterations   = maxXcoordIterations;
        if (xcoordWeights)         this.xCoordWeights         = xcoordWeights;
        if (xcoordEdgeWeightValue) this.xCoordEdgeWeightValue = xcoordEdgeWeightValue;
        this.horizontalSeparationDist = horizontalSeparationDist;
        this.mostCompact              = mostCompact;

        // 1)
        var rankResult = this.rank();

        this.ranks   = rankResult.ranks;
        this.maxRank = rankResult.maxRank;

        // 2)
        this.GG = this.G.makeGWithSplitMultiRankEdges(this.ranks, this.maxRank, virtualNodeWidth);

        printObject( this.GG );

        this.order = this.ordering(this.maxInitOrderingIters, this.maxOrderingIterations);
		
		// 2.5)
        this.reRankRelationships(); // once ordering is known need to re-rank relationship nodes to be on
                                    // the same level as the lower ranked parent. Attempt to place next to
                                    // one of the parents; having ordering info helps to pick the parent in
                                    // case parents are on the same level and not next to each other

        printObject( this.GG );
        printObject( this.ranks );

        // 3)
        this.positions = this.position(horizontalSeparationDist);

        // 4)
        //this.make_splines();

        return { convertedG: this.GG,
                 ranks:      this.ranks,
                 ordering:   this.order,
                 positions:  this.positions };
    },

    //=[rank]============================================================================
    rank: function ()
    {
        var rankedSpanningTree = this.init_rank();

        var ranks   = rankedSpanningTree.getRanks();
        var maxRank = rankedSpanningTree.getMaxRank();

        // re-rank all nodes as far down the tree as possible (e.g. people with no
        // parents in the tree should be on the same level as their first documented
        // relationship partner)
        maxRank = this.compress_ranks(ranks, maxRank);

        return { ranks: ranks, maxRank: maxRank };
    },

    init_rank: function ()
    {
        var spanTree = new RankedSpanningTree();

        spanTree.initTreeByInEdgeScanning(this.G, 1);

        return spanTree;
    },

    compress_ranks: function (ranks, maxRank)
    {
        // re-ranks all nodes as far down the tree as possible (e.g. people with no
        // parents in the tree should be on the same level as their first documented
        // relationship partner)

        // Algorithm:
        // 1. find disconnected components when multi-rank edges are removed (using "flood fill")
        // 2. for each component find the incoming or outgoing milti-rank edge of minimum length
        //    note1: sometimes a component may have both incoming and outgoing muti-rank edges;
        //           only one of those can be shortened and the choice is made based on edge weight
        //    note2: we can only keep track of outgoing edges as for each incoming edge there is an
        //           outgoing edge in another component, and we only use one edge per re-ranking iteration
        // 3. reduce all ranks by that edge's length minus 1
        // 4. once any two components are merged need to redo the entire process because the new
        //    resuting component may have other minimum in/out multi-rnak edges

        console.log("Re-ranking ranks before: " + stringifyObject(ranks));

        while(true) {
            var nodeColor        = [];   // for each node which component it belongs to
            var component        = [];   // for each component list of vertices in the component
            var minOutEdgeLength = [];   // for each component length of the shortest outgoing multi-rank edge
            var minOutEdgeWeight = [];   // for each component weight of the shortest outgoing multi-rank edge

            for (var v = 0; v < this.G.getNumVertices(); v++) {
                nodeColor.push(null);
                // we don't know how many components we'll get, when initializing
                // assume as many as there are nodes:
                component.push([]);
                minOutEdgeLength.push(Infinity);
                minOutEdgeWeight.push(0);
            }

            var maxComponentColor = 0;
            for (var v = 0; v < this.G.getNumVertices(); v++) {

                if (nodeColor[v] == null) {
                    // mark all reachable using non-multi-rank edges with the same color (ignore edge direction)

                    var queue = new Queue();
                    queue.push( v );

                    while ( queue.size() > 0 ) {
                        var nextV = queue.pop();
                        //console.log("processing: " + nextV);
                        if (nodeColor[nextV] != null) continue;

                        nodeColor[nextV] = maxComponentColor;
                        component[maxComponentColor].push(nextV);

                        var rankV = ranks[nextV];

                        var inEdges = this.G.getInEdges(nextV);
                        for (var i = 0; i < inEdges.length; i++) {
                            var vv         = inEdges[i];
                            var weight     = this.G.getEdgeWeight(vv,nextV);
                            var edgeLength = rankV - ranks[vv];
                            // we want to avoid counting long edges within a component, so do not
                            // count edges goign to nodes in unknown components. Thus we may have to
                            // use inedges to count outedges, since when processing at least one of the
                            // two directions both nodes would be already coloured
                            if (edgeLength > 1) {
                                if (nodeColor[vv] != null && nodeColor[vv] != maxComponentColor) {
                                    if (edgeLength < minOutEdgeLength[nodeColor[vv]] ||
                                        (edgeLength == minOutEdgeLength[nodeColor[vv]] && weight > minOutEdgeWeight[nodeColor[vv]])) {
                                        minOutEdgeLength[nodeColor[vv]] = edgeLength;
                                        minOutEdgeWeight[nodeColor[vv]] = weight;
                                    }
                                }
                            }
                            else {
                                if (nodeColor[vv] == null)
                                {
                                    queue.push(vv);
                                    //console.log("add-I + " + nextV + " <- " + vv);
                                }
                            }
                        }

                        var outEdges = this.G.getOutEdges(nextV);
                        for (var u = 0; u < outEdges.length; u++) {
                            var vv         = outEdges[u];
                            var weight     = this.G.getEdgeWeight(nextV,vv);
                            var edgeLength = ranks[vv] - rankV;
                            if (edgeLength > 1) {
                                if ( nodeColor[vv] != null && nodeColor[vv] != maxComponentColor) {
                                    if (edgeLength < minOutEdgeLength[maxComponentColor] ||
                                        (edgeLength == minOutEdgeLength[maxComponentColor] && weight > minOutEdgeWeight[maxComponentColor])) {
                                        minOutEdgeLength[maxComponentColor] = edgeLength;
                                        minOutEdgeWeight[maxComponentColor] = weight;
                                    }
                                }
                            }
                            else {
                                if (nodeColor[vv] == null) {
                                    queue.push(vv);
                                    //console.log("add-O + " + nextV + " -> " + vv);
                                }
                            }
                        }
                    }

                    maxComponentColor++;
                }
            }
            

            console.log("components: " + stringifyObject(component));
            if (maxComponentColor == 1) return maxRank; // only one component left - done re-ranking

            // for each component we should either increase the rank (to shorten out edges) or
            // decrease it (to shorten in-edges. If only in- (or only out-) edges are present there
            // is no choice, if there are both pick the direction where minimum length edge has higher
            // weight (TODO: alternatively can pick the one which reduces total edge len*weight more,
            // but the way pedigrees are entered by the user the two methods are probably equivalent in practice)

            // However we do not want negative ranks, and we can accomodate this by always increasing
            // the rank (as for each decrease there is an equivalent increase in the other component).

            // so we find the heaviest out edge and increase the rank of the source component
            // in case of a tie we find the shortest of the heaviest edges

            var minComponent = 0;
            for (var i = 1; i < maxComponentColor; i++) {
              if (minOutEdgeWeight[i] > minOutEdgeWeight[minComponent] ||
                  (minOutEdgeWeight[i] == minOutEdgeWeight[minComponent] && 
                   minOutEdgeLength[i] <  minOutEdgeLength[minComponent]) )
                minComponent = i;
            }

            //console.log("MinLen: " + stringifyObject(minOutEdgeLength));

            // reduce rank of all nodes in component "minComponent" by minEdgeLength[minComponent] - 1
            for (var v = 0; v < component[minComponent].length; v++) {
                ranks[component[minComponent][v]] += (minOutEdgeLength[minComponent] - 1);
                if ( ranks[component[minComponent][v]] > maxRank )
                    maxRank = ranks[component[minComponent][v]];
            }

            console.log("Re-ranking ranks update: " + stringifyObject(ranks));
        }
    },
    //============================================================================[rank]=

    //=[ordering]========================================================================
    ordering: function(maxInitOrderingIters, maxOrderingIterations)
    {        
        var best                = [];
        var bestCrossings       = Infinity;
        var bestEdgeLengthScore = Infinity;

        var numTopLevelNodes = this.GG.parentlessNodes.length;
        for (var i = 0; i < numTopLevelNodes * maxInitOrderingIters; i++ ) {
            order = this.init_order();

            this.transpose(order, 0);

            var numCrossings    = this.edge_crossing(order);
            var edgeLengthScore = this.edge_length_score(order);

            if ( numCrossings < bestCrossings ||
                 (numCrossings == bestCrossings && edgeLengthScore < bestEdgeLengthScore) ) {
                best                = order.copy();
                bestCrossings       = numCrossings;
                bestEdgeLengthScore = edgeLengthScore;                
            }
        }

        //printObject(order);
        //return order;

        var noChangeIterations = 0;
        var maxNoC = 0;

        var order = best.copy();
        console.log("best: " + _printObjectInternal(order.order, 0));
        console.log("num crossings: " + bestCrossings);

        for (var i = 0; i < maxOrderingIterations; i++) {
            //if (bestCrossings == 0) break;   // still want to optimize for edge lengths

            // try to optimize based on a heuristic: just do it without checking if the result
            // is good or not. The layout may be not as good rigth away but better after a few
            // iterations
            this.wmedian(order, i);

            //console.log("median: " + _printObjectInternal(order.order, 0));

            // try to optimize checking if each step is useful (bad adjustments are discarded);
            this.transpose(order, i);

            //console.log("transpose: " + _printObjectInternal(order.order, 0));

            var numCrossings = this.edge_crossing(order);

            //console.log("num crossings: " + numCrossings);

            var edgeLengthScore = this.edge_length_score(order);

            //console.log("=== EdgeLengthScore: " + edgeLengthScore );

            if ( numCrossings < bestCrossings ||
                 (numCrossings == bestCrossings && edgeLengthScore < bestEdgeLengthScore) )
            {
                console.log("best selected!");

                best                = order.copy();
                bestCrossings       = numCrossings;
                bestEdgeLengthScore = edgeLengthScore;
                noChangeIterations  = 0;
            }
            else {
                noChangeIterations++;
                if (noChangeIterations > maxNoC)
                    maxNoC = noChangeIterations;
                //if (noChangeIterations == 4) break;
                //printObject(order.order);
            }
        }

        // [TODO] probably not needed for pedigrees, as edges more than 2-3 nodes long are highly unlkikely
         //       and good layout for other nodes is more important
        // try to optimize long edge placement (as above, bad adjustments are discarded)
        // (as a side-effect numCrossings is computed and is returned)
        //bestCrossings = this.transposeLongEdges(best, bestCrossings);

        console.log("=== Numcrossings: " + bestCrossings + ", maxNoChangeIterations: " + maxNoC );

        return best;
    },

    init_order: function (ranks)
    {
        // initially orders the nodes in each rank. This may be done by a depth-first or breadth-f
        // search starting with vertices of minimum rank. Vertices are assigned positions in their
        // ranks in left-to-right order as the search progresses. This strategy ensures that the
        // initial ordering of a tree has no crossings [?]. This is important because such crossings
        // are obvious, easily-avoided ‘‘mistakes’’.

        var order      = [];          // array of arrays - for each rank list of vertices in order
        var vOrder     = [];          // array - for each v vOrder[v] = order within rank

        for (var r = 0; r <= this.maxRank; r++) {
            order[r] = [];
        }

        for (var i = 0; i < this.GG.getNumVertices(); i++) {
            vOrder[i] = undefined;
        }

        // Use BFS -----------------------------
        var queue = new Queue();

            /* TODO
            if ( rank == 0 ) {
                shuffleArray(outEdges);
                // TODO: save permutations, do not redo already tried orders
                // for consistency, of the two mirrored assignments pick the one with highest Id on the right
                // e.g. given [3,1,2] use equivalent [2,1,3] instead
                if ( outEdges[0] > outEdges[outEdges.length-1] )
                    outEdges.reverse();
            }*/

        for (var i = 0; i < this.GG.parentlessNodes.length; i++ )
            queue.push( this.GG.parentlessNodes[i] );

        while ( queue.size() > 0 ) {
            var next = queue.pop();
            // we may have already assigned this vertex a rank
            if (vOrder[next] != undefined) continue;

            // assign next available order at next's rank
            var rank = this.ranks[next];

            var nextOrder = order[rank].length;
            vOrder[next]  = nextOrder;
            order[rank].push(next);

            // add all children to the queue
            var outEdges = this.GG.getOutEdges(next);

            for (var u = 0; u < outEdges.length; u++) {
                var vertex = outEdges[u];

                queue.push(vertex);
            }
        }
        //--------------------------------------

        var o = new Ordering();
        o.init(order, vOrder);

        return o;
    },

    edge_length_score: function(order, onlyRank)
    {
        var totalEdgeLengthInPositions = 0;
        var totalEdgeLengthInChildren  = 0;

        // Two goals: without increasin ght enumber of edge crossings try to
        //   higher priority: place people in a relationship close(r) to each other
        //   lower priority:  place all children close(r) to each other
        for (var i = 0; i < this.GG.getNumVertices(); i++) {

            if (onlyRank) {
                var rank = this.ranks[i];
                if (rank < onlyRank - 1 || rank > onlyRank + 1) continue;
            }

            if (this.GG.isRelationship(i)) {			    
    		    var parents = this.GG.getInEdges(i);
			
                // each "relationship" node should only have two "parent" nodes
        	    if (parents.length != 2) {
                    throw "Assertion failed: 2 parents per relationship";
                }

                // only if parents have the same rank
                if ( this.ranks[parents[0]] != this.ranks[parents[1]] )
    			    continue;
					
                var order1 = order.vOrder[parents[0]];
                var order2 = order.vOrder[parents[1]];

                var minOrder = Math.min(order1, order2);
                var maxOrder = Math.max(order1, order2);

                totalEdgeLengthInPositions += ( maxOrder - minOrder );
            }

            if (this.GG.isChildhub(i)) {
                // get the distance between the rightmost and leftmost child
                var children = this.GG.getOutEdges(i);
                var minOrder = order.vOrder[children[0]];
                var maxOrder = minOrder;
                for (var j = 1; j < children.length; j++) {
                    var ord = order.vOrder[children[j]];
                    if ( ord > maxOrder ) maxOrder = ord;
                    if ( ord < minOrder ) minOrder = ord;                    
                }
                totalEdgeLengthInChildren += (maxOrder - minOrder);
            }
        }        
        
        return totalEdgeLengthInPositions*1000 + totalEdgeLengthInChildren;
    },

    edge_crossing: function(order, onlyRank)
    {
        // TODO: optimize. In pedigrees edges always flow from higher ranks to lower ranks
        var numCrossings = 0;

        var vertNum = this.GG.getNumVertices();

        for (var v = 0; v < vertNum; v++) {

            if (onlyRank) {
                var rank = this.ranks[v];
                if (rank < onlyRank - 1 || rank > onlyRank + 1) continue;
            }

            var outEdges = this.GG.getOutEdges(v);
            var len      = outEdges.length;

            for (var j = 0; j < len; j++) {
                var targetV = outEdges[j];

                if (targetV == v) continue; // disregard self-edges

                if (onlyRank) {
                    var rank = this.ranks[targetV];
                    if (rank < onlyRank - 1 || rank > onlyRank + 1) continue;
                }

                // so we have an edge v->targetV. Have to check how many edges
                // between rank[v] and rank[targetV] this particular edge corsses.
                numCrossings += this._edge_crossing_crossingsByOneEdge(order, v, targetV);
            }
        }

        //console.log("crossings: " + numCrossings);
        return numCrossings;
    },

    _edge_crossing_crossingsByOneEdge: function (order, v, targetV)
    {
        // Crossing is detected if either
        // - there is an edge going from rank[v]-ranked vertex with a smaller order
        //   than v to a rank[targetV]-ranked vertex with a larger order than targetV
        // - there is an edge going from rank[v]-ranked vertex with a larger order
        //   than v to a rank[targetV]-ranked vertex with a smaller order than targetV

        var crossings = 0;

        var rankV = this.ranks[v];
        var rankT = this.ranks[targetV];

        if (rankV > rankT) {
            rankV = rankT;
            rankT = rankT + 1;
            var tmp = v;
            v = targetV;
            targetV = tmp;
        }

        var orderV = order.vOrder[v];
        var orderT = order.vOrder[targetV];

        var verticesAtRankV = order.order[ rankV ];    // all vertices at rank V
        var verticesAtRankT = order.order[ rankT ];    // all vertices at rank targetV

        // edges from rankV to rankT: only those after v (orderV+1)
        for (var ord = orderV+1; ord < verticesAtRankV.length; ord++) {
            var vertex = verticesAtRankV[ord];

            var outEdges  = this.GG.getOutEdges(vertex);
            var len       = outEdges.length;

            for (var j = 0; j < len; j++) {
                var target = outEdges[j];

                var rankTarget  = this.ranks[target];
                if ( rankTarget != rankT ) continue;

                var orderTarget = order.vOrder[target];

                if (orderTarget < orderT) {
                    crossings++;
                }
            }
        }

        // edges from rankT to rankV: only those before T
        for (var ord = 0; ord < orderT-1; ord++) {
            var vertex = verticesAtRankT[ord];

            var outEdges  = this.GG.getOutEdges(vertex);
            var len       = outEdges.length;

            for (var j = 0; j < len; j++) {
                var target = outEdges[j];

                var rankTarget  = this.ranks[target];
                if ( rankTarget != rankV ) continue;

                var orderTarget = order.vOrder[target];

                if (orderTarget > orderV) {
                    crossings++;
                }
            }
        }
        return crossings;
    },

    //-[wmedian]-------------------------------------------------------------------------
    wmedian: function(order, iter)
    {
        // The weighted median heuristic: depending on the parity of the current iteration number,
        // the ranks are traversed from top to bottom or from bottom to top.

        if (iter%2 == 0)
        {
            for (var r = 2; r <= this.maxRank; r++) {
                if (order.order[r].length   <= 1 ||            // no need to re-order 1 vertex
                    order.order[r-1].length <= 1) continue;    // if only one same parent for all V:
                                                               // all V will have equivalen median[]
                var median = [];
                var len    = order.order[r].length;
                for (var i = 0; i < len; i++) {
                    var v = order.order[r][i];
                    median[v] = this.median_value(order, v, r-1);
                }
                this.sort_orders(order, r, median);
            }
        }
        else
        {
            for (var r = this.maxRank-1; r >= 1; r--) {
                if (order.order[r].length   <= 1 ||            // no need to re-order 1 vertex
                    order.order[r+1].length <= 1) continue;    // if only one same child for all V

                var median = [];
                var len    = order.order[r].length;
                for (var i = 0; i < len; i++) {
                    var v = order.order[r][i];
                    median[v] = this.median_value(order, v, r+1);
                }
                this.sort_orders(order, r, median);
            }
        }
    },

    median_value: function (order, v, adj_rank)
    {
        var P = this.adj_position(order, v, adj_rank);

        if (P.length == 0) return -1.0;

        var m = Math.floor(P.length/2);

        if (P.length % 2 == 1) return P[m];

        if (P.length == 2) return (P[0] + P[1])/2;

        var left  = P[m-1]        - P[0];
        var right = P[P.length-1] - P[m];

        return (P[m-1]*right + P[m]*left)/(left+right);
    },

    adj_position: function (order, v, adj_rank)
    {
        // returns an ordered array of the present positions of the nodes
        // adjacent to v in the given adjacent rank.
        var result = [];

        var verticesAtRankAdj = order.order[adj_rank];  // all vertices at rank adj_rank

        var len = verticesAtRankAdj.length;
        for (var j = 0; j < len; j++) {
            var adjV = verticesAtRankAdj[j];
            if ( this.GG.hasEdge(adjV, v) || this.GG.hasEdge(v, adjV) ) {
                result.push(j);      // add order
            }
        }

        return result;
    },

    sort_orders: function(order, rank, weightToUseForThisRank) {

        var sortfunc = function(a,b) {
            return (weightToUseForThisRank[a] - weightToUseForThisRank[b]);
        };

        // re-order vertices within a rank according to weightToUseForThisRank
        order.order[rank].sort( sortfunc );

        // update order.vOrder[] accordingly, based on how we just sorted order.order[]
        for (var i = 0; i < order.order[rank].length; i++) {
            var v = order.order[rank][i];
            order.vOrder[v] = i;
        }
    },
    //-------------------------------------------------------------------------[wmedian]-

    transpose: function(order, iter)
    {
        // for each rank: goes over all vertices in the rank and tries to switch orders of two
        //                adjacent vertices. If numCrossings is improved keeps the new order.
        //                repeats for each rank, and if there was an improvementg tries again.
        var improved = true;

        while( improved )
        {
            improved = false;

            for (var r = 1; r <= this.maxRank; r++)
            {
                var numEdgeCrossings = this.edge_crossing(order, r);
                var edgeLengthScore  = this.edge_length_score(order,r);

                var maxIndex = order.order[r].length - 1;
                for (var i = 0; i < maxIndex; i++) {

                    order.exchange(r, i, i+1);

                    var newEdgeCrossings = this.edge_crossing(order, r);
                    var newLengthScore   = this.edge_length_score(order,r);

                    // TODO: also transpose if more males/females end up on the preferred
                    //       side of a relationships (also hides randomness in initial_order ;)

                    if (newEdgeCrossings < numEdgeCrossings ||
                        (newEdgeCrossings == numEdgeCrossings && newLengthScore < edgeLengthScore) ) {
                        // this was a good exchange, apply it to the current real ordering
                        improved = true;
                        numEdgeCrossings = newEdgeCrossings;
                        edgeLengthScore  = newLengthScore;
                        //if (numEdgeCrossings == 0) return 0; // still want to optimize for edge lengths
                    }
                    else if (newEdgeCrossings == numEdgeCrossings && newLengthScore == edgeLengthScore) {    
                        if ( iter%3 == 0 )
                            order.exchange(r, i, i+1);
                    }
                    else {
                        // exchange back
                        order.exchange(r, i, i+1);
                    }
                }
            }
        }
    },

    transposeLongEdges: function(order, numCrossings)
    {
        var maxRealId = this.GG.getMaxRealVertexId();
        var numVert   = this.GG.getNumVertices();

        var checked = [];
        for (var v = maxRealId+1; v < numVert; v++)
            checked[v] = false;

        for (var v = maxRealId+1; v < numVert; v++) {

            if (checked[v]) continue;
            // find a long edge - something with only one in and one out edge, both going
            // to a virtual vertex. Note: all virtual vertices have only one in and one out edge.
            var inV = this.GG.inedges[v][0];
            if (inV <= maxRealId) continue; // a real vertex above this

            var outV = this.GG.v[v][0];
            if (outV <= maxRealId) continue; // a real vertex below this

            // find the entire edge + head
            var chain = [v];
            while (true) {
                checked[inV] = true;
                chain.push(inV);
                inV = this.GG.inedges[inV][0];
                if (inV <= maxRealId) {
                    // found "head" - add it to chain iff it has only one inedge and one outedge
                    if (this.GG.v[inV].length       == 1 &&
                        this.GG.inedges[inV].length == 1) {
                        chain.push(inV);
                    }
                    break;
                }
            }
            var tail;
            while (true) {
                checked[outV] = true;
                chain.push(outV);
                outV = this.GG.v[outV][0];
                if (outV <= maxRealId) {
                    tail = outV;
                    break;   // found "tail"
                }
            }

            var ranks = this.ranks;
            var sortfunc = function(a,b) {
                return (ranks[a] - ranks[b]);
            };

            // sort head-to-tail by rank
            chain.sort(sortfunc);

            var bestScore = numCrossings;
            var bestOrder = undefined;

            // move 2 pieces at a time rigth or left first, up to 5 spots
            if (chain.length <= 6) {
                for (var i = 0; i < chain.length; i++) {
                    var piece1 = chain[i];
                    var piece2;
                    if (i != chain.length-1)
                        piece2 = chain[i+1];
                    else
                        piece2 = tail;

                    var rank1 = ranks[piece1];
                    var rank2 = ranks[piece2];
                    var ord1  = order.vOrder[piece1];
                    var ord2  = order.vOrder[piece2];

                    for (var move1 = -4; move1 <= 4; move1++ ) {
                        for (var move2 = -4; move2 <= 4; move2++ ) {
                            if (move1 == 0 && move2 == 0) continue;
                            var newOrder = order.copy();
                            if (!newOrder.move(rank1, ord1, move1)) continue;
                            if (!newOrder.move(rank2, ord2, move2)) continue;

                            var newCross = this.edge_crossing(newOrder);
                            if (newCross < bestScore) {
                                bestScore = newCross;
                                bestOrder = [rank1, ord1, move1, rank2, ord2, move2];
                            }
                        }
                    }
                }
            }

            if (bestScore < numCrossings) {
                if (!order.move(bestOrder[0], bestOrder[1], bestOrder[2])) throw "assert";
                if (!order.move(bestOrder[3], bestOrder[4], bestOrder[5])) throw "assert";
                numCrossings = bestScore;
            }
        }

        return numCrossings;
    },
    //========================================================================[ordering]=

    //=====================================================================[re-ordering]=
    reRankRelationships: function() {

        // re-rank all relationship nodes to be on the same level as the lower ranked
        // parent. Attempt to place next to one of the parents; having ordering info
        // helps to pick the parent & the location.
        // Note1: the only case when we may not be able to place next to
        //        a parent is when both parents have more than 2 relationships.
        // Note2: also need to shorten incoming multi-rank edges by one node
        //        (see removeRelationshipRanks())

        // pass1: simple cases: parents are next to each other
        for (var i = 0; i < this.GG.getNumVertices(); i++) {
            if (this.GG.isRelationship(i)) {			    
    		    var parents = this.GG.getInEdges(i);
			
    			// each "relationship" node should only have two "parent" nodes
        	    if (parents.length != 2)
                    throw "Assertion failed: 2 parents per relationship";

                // only if parents have the same rank
                if ( this.ranks[parents[0]] != this.ranks[parents[1]] )
    			    continue;
					
                var order1 = this.order.vOrder[parents[0]];
                var order2 = this.order.vOrder[parents[1]];

                // if parents are next to each other in the ordering
                var minOrder = Math.min(order1, order2);
                var maxOrder = Math.max(order1, order2);

                console.log("=== is relationship: " + i + ", minOrder: " + minOrder + ", maxOrder: " + maxOrder );
			
                if ( maxOrder == minOrder + 1 ) {
                    this.moveVertexToRankAndOrder( i, this.ranks[parents[0]], maxOrder );
                }
            }
        }
        /*
        // pass2: more complicated cases
        for (var i = 0; i < this.GG.getNumVertices(); i++) {
            if (this.GG.isRelationship(i)) {			    
    		    var parents = this.GG.getInEdges(i);
			
    			// each "relationship" node should only have two "parent" nodes
        	    if (parents.length != 2)
                    throw "Assertion failed: 2 parents per relationship";
                
                // 1. pick which rank is the lower rank
                // 2. pick which parent is a better target
                // 3. pick which side of the parent to move to
                // 3. move next to that parent on that side (right next to parent,
                //    unless there is another relationship node which should be closer
                
                if ( this.ranks[parents[0]] != this.ranks[parents[1]] )
                {

                }
                else
                {					
                    var order1 = this.order.vOrder[parents[0]];
                    var order2 = this.order.vOrder[parents[1]];

                    // if parents are next to each other in the ordering
                    var minOrder = Math.min(order1, order2);
                    var maxOrder = Math.max(order1, order2);

                    //console.log("=== is relationship: " + i + ", minOrder: " + minOrder + ", maxOrder: " + maxOrder );
			
                    if ( maxOrder == minOrder + 1 ) {
                        this.moveVertexToRankAndOrder( i, this.ranks[parents[0]], maxOrder );
                    }
                }
                
            }
        }
        /**/
        
        this.removeRelationshipRanks();
    },

    moveVertexToRankAndOrder: function( v, newRank, newOrder ) {
        var oldRank  = this.ranks[v];
        var oldOrder = this.order.vOrder[v];
	
    	if (oldRank != newRank + 1) {
            throw "Assertion failed: relationship one level below participants";
        }

        this.order.moveVertexToRankAndOrder( oldRank, oldOrder, newRank, newOrder );
        this.ranks[v] = newRank;
    },
    
    removeRelationshipRanks: function () {
        // removes ranks previously occupied by relationship nodes (which is every 3rd rank)
        // (these ranks have either no nodes at all or only virtual nodes
        // from multi-rank edges passing through)
        for (var r = 2; r <= this.maxRank; r+=2) {
            // r+=2 because each 3rd rank is a relationship rank, but once this rank is removed it becomes r+2 not r+3

            if ( this.order.order[r].length > 0 ) {
                // there are some virtual nodes left
                for (var i = 0; i < this.order.order[r].length; i++) {
                    var v = this.order.order[r][i];
                    // it takes a lot of work to completely remove a vertex from a graph.
                    // however it is easy to disconnect and place it into rank 0 which is ignored when drawing/assigning coordinates
                    this.GG.unplugVirtualVertex(v);
                    this.ranks[v] = 0;
                    this.order.vOrder[v] = this.order.order[0].length;
                    this.order.order[0].push(v);
                }
            }

            this.order.order.splice(r,1);
            
            for ( var v = 0; v < this.ranks.length; v++ ) {
                if ( this.ranks[v] > r )
                    this.ranks[v]--;
            }

            this.maxRank--;
        }
    },
    //=====================================================================[re-ordering]=
	
	
    //=[position]========================================================================

    displayGraph: function(xcoord, message) {

        var renderPackage = { convertedG: this.GG,
                              ranks:      this.ranks,
                              ordering:   this.order,
                              positions:  xcoord };

        display_processed_graph(renderPackage, 'output', true, message);
    },

    position: function(horizontalSeparationDist)
    {
        var xcoord = this.init_xcoord(horizontalSeparationDist);
        printObject(xcoord.xcoord);

        var xbest     = xcoord.copy();
        var bestScore = this.xcoord_score(xbest);
        var prevScore = 0;

        this.displayGraph(xbest.xcoord, 'init');

        this.try_shift_right(xcoord, true, false, true);
        this.try_shift_left (xcoord, true);
        this.try_shift_right(xcoord, false, true, true);
        this.try_shift_left (xcoord, true);

        this.displayGraph(xcoord.xcoord, 'firstAdj');

        printObject(xcoord.xcoord);

        for ( var i = 0; i <= this.maxXcoordIterations; i++ )
        {
            this.try_shift_right(xcoord, true, true, true);
            this.try_shift_left (xcoord, true);
            this.try_straighten_long_edges(xcoord);

            this.displayGraph(xcoord.xcoord, 'Adj' + i);

            // [TODO] not clear how and hard to implement sugested heuristics.
            //        The paper suggests to do a network simplex anyway instead, but it is
            //        even harder to debug - definitely have to do later, but not now
            //medianpos(i, xcoord);
            //minedge(i,xcoord);
            //minnode(i,xcoord);
            //minpath(i,xcoord);
            //packcut(i,xcoord);
            xcoord.normalize();

            var score = this.xcoord_score(xcoord);

            if (score.isBettertThan(bestScore)) {
                xbest = xcoord.copy();
                bestScore = score;
            }

            if (score >= prevScore) break;

            prevScore = score;
        }

        // stretch narrow parts of the graph up to the widest part if this
        // improves presentation and makes edges more straight and less crowded
        this.widen_graph(xbest);

        return xbest.xcoord;
    },

    xcoord_score: function( xcoord, onlyRank )
    {
        // Returns xcoord score, the less the better.
        //
        //  Score equal to the     Σ     (  Ω(e) * ω(e) * X[w] − X[v]  )
        //                      e = (v,w)
        //
        //   where  Ω(e) is an internal value distinct from the input edge weight ω(e),
        //   defined to favor straightening long edges. Since edges between real nodes in adjacent
        //   ranks can always be drawn as straight lines, it is more important to reduce the
        //   horizontal distance between virtual nodes, so chains may be aligned vertically and thus
        //   straightened. The failure to straighten long edges can result in a ‘‘spaghetti effect’’
        //   of edges having many different slopes. Accordingly, edges are divided into three types
        //   depending on their end vertices: (1) both real nodes, (2) one real node and one virtual
        //   node, or (3) both virtual nodes. If e, f, and g are edges of types (1), (2), and (3),
        //   respectively, then Ω(e) ≤ Ω( f ) ≤ Ω(g). Our implementation uses 1, 2, and 8.
        //   (overwritten by xcoordWeights[0], xcoordWeights[1], xcoordWeights[2])

        var maxRealId = this.GG.getMaxRealVertexId();

        var score = new Score(maxRealId);

        var rankFrom = 1;
        var rankTo   = this.maxRank;

        if (typeof(onlyRank) != "undefined") {
            rankFrom = Math.max(1,            onlyRank-1);
            rankTo   = Math.min(this.maxRank, onlyRank+1);
        }

        for (var r = rankFrom; r <= rankTo; r++) {
            var len = this.order.order[r].length;
            for (var i = 0; i < len; i++) {
                var v = this.order.order[r][i];

                var outEdges = this.GG.getOutEdges(v);
                var lenO     = outEdges.length;
                var rankOk   = (typeof(onlyRank) == "undefined" || this.ranks[v] == onlyRank);

                for (var j = 0; j < lenO; j++) {
                    var u = outEdges[j];
                    if (!rankOk && this.ranks[u] != onlyRank) continue;

                    // have an edge from 'v' to 'u' with weight this.GG.weights[v][u]

                    // determine edge type: from real vertex to real, real to/from virtual or v. to v.
                    var coeff = this.xCoordWeights[2];
                    if ( v <= maxRealId && u <= maxRealId )
                        coeff = this.xCoordWeights[0];
                    else if ( v <= maxRealId || u <= maxRealId )
                        coeff = this.xCoordWeights[1];

                    var w = this.xCoordEdgeWeightValue ? this.GG.weights[v][u] : 1.0;

                    var dist = Math.abs(xcoord.xcoord[v] - xcoord.xcoord[u]);

                    var thisScore = coeff * w * dist;
                    if (this.mostCompact) thisScore *= dist;  // place higher value on shorter edges

                    score.add(thisScore);
                    score.addEdge(v, u, dist);
                }
            }
        }

        //console.log("XcoordScore: " + stringifyObject(score));
        return score;
    },

    init_xcoord: function(horizontalSeparationDist)
    {
        var xinit = [];

        // For each rank, the left-most node is assigned coordinate 0. The coordinate of the next
        // node is then assigned a value sufficient to satisfy the minimal separation from the prev
        // one, and so on. Thus, on each rank, nodes are initially packed as far left as possible.

        for (var r = 0; r < this.order.order.length; r++) {
            var xThisRank = 0;

            for (var i = 0; i < this.order.order[r].length; i++) {
                var v = this.order.order[r][i];

                var vWidth = this.GG.getVertexHalfWidth(v);

                xinit[v] = xThisRank + vWidth;

                xThisRank += vWidth*2 + horizontalSeparationDist;
            }
        }

        var xcoord = new XCoord();
        xcoord.init(xinit, horizontalSeparationDist, this.GG.vWidth, this.order, this.ranks);

        return xcoord;
    },

    try_shift_right: function(xcoord,
                              scoreQualityOfNodesBelow, scoreQualityOfNodesAbove,
                              moveBoundaryVertices,
                              debugV)
    {
        // somewhat similar to transpose: goes over all ranks (top to bottom or bottom to top,
        // depending on iteration) and tries to shift vertices right one at a time. If a shift
        // is good leaves it, if not keeps going further.
        //
        // more precisely, tries to shift the vertext to the desired position up to and including
        // to the position optimal according to the median rule, binary searching the positions
        // in between. Since we are not guaranteed the strictly increasing/decreasing score binary
        // search is just one heuristic which might work good.

        //this.displayGraph( xcoord.xcoord, "shiftright-start" );

        for (var rr = 0; rr <= this.maxRank; rr++) {

            // go from top to bottom or bottom to top depending on which ranks (above or below)
            // we consider when trying to shift the nodes
            var r;
            if (!scoreQualityOfNodesAbove)
                r = this.maxRank - rr;
            else
                r = rr;

            if (r == 0) continue;  // disregard all discarded vertices

            var considerBelow = scoreQualityOfNodesBelow || (r == 0);
            var considerAbove = (scoreQualityOfNodesAbove || r == this.maxRank) && (r != 0);

            var toO   = moveBoundaryVertices ? 0 : 1;
            var fromO = moveBoundaryVertices ? this.order.order[r].length - 1 : this.order.order[r].length - 2;

            for (var i = fromO; i >= toO; i--) {

                var v = this.order.order[r][i];

                if (debugV && v != debugV ) continue;

                // we care about the quality of resulting graph only for some ranks: sometimes
                // only above the change, sometimes only below the change; in any case we know
                // the change of position of vertices on this rank is not going to affect ranks
                // far away, so we can only compute the score for the rnaks we care about.
                var rankToUseForScore = r;
                if (!considerAbove) rankToUseForScore = r+1;
                if (!considerBelow) rankToUseForScore = r-1;
                if (rankToUseForScore == 0) continue;

                var initScore = this.xcoord_score(xcoord, rankToUseForScore);

                var median = this.compute_median(v, xcoord, considerAbove, considerBelow);
                if (median != median)
                    median = xcoord.xcoord[v];

                var maxShift = median - xcoord.xcoord[v];

                // speed optimization: shift which we can do without disturbing other vertices and
                //                     thus requiring no backup/restore process
                var noDisturbMax = xcoord.getRightMostNoDisturbPosition(v);
                var maxSafeShift = (noDisturbMax >= 0) ? noDisturbMax - xcoord.xcoord[v] : maxShift;

                if (maxShift <= 0) continue;

                var bestShift = 0;
                var bestScore = initScore;
                var shiftAmount = maxShift;

                do
                {
                    var newScore;

                    if (shiftAmount <= maxSafeShift)
                    {
                        xcoord.xcoord[v] += shiftAmount;
                        newScore = this.xcoord_score(xcoord, rankToUseForScore);
                        xcoord.xcoord[v] -= shiftAmount;
                    }
                    else
                    {
                        var newCoord = xcoord.copy();
                        newCoord.shiftRightAndShiftOtherIfNecessary(v, shiftAmount);
                        newScore = this.xcoord_score(newCoord, rankToUseForScore);
                    }

                    if (newScore.isBettertThan(bestScore)) {
                        bestShift = shiftAmount
                        bestScore = newScore;
                    }

                    //shiftAmount /= 2;
                    //shiftAmount = Math.floor(shiftAmount);
                    shiftAmount -= 1;
                }
                while (shiftAmount > 0);

                if (bestScore.isBettertThan(initScore)) {
                    xcoord.shiftRightAndShiftOtherIfNecessary(v, bestShift);
                }

                //this.displayGraph( xcoord.xcoord, "shiftright-rank-" + r + "-v-" + this.GG.idToName[v] );
            }

            //this.displayGraph( xcoord.xcoord, "shiftright-rank-" + r + "-end");
        }
    },

    compute_median: function (v, xcoord, considerAbove, considerBelow)
    {
        var maxRealId = this.GG.getMaxRealVertexId();

        var positionsAbove = [];
        var positionsBelow = [];

        var allEdgesWithWeights = this.GG.getAllEdgesWithWeights(v);

        for (var u in allEdgesWithWeights) {
            if (allEdgesWithWeights.hasOwnProperty(u)) {
                if (u == v) continue;
                var weight = allEdgesWithWeights[u];

                // determine edge type: from real vertex to real, real to/from virtual or v. to v.
                var coeff = this.xCoordWeights[2];
                if ( v <= maxRealId && u <= maxRealId )
                    coeff = this.xCoordWeights[0];
                else if ( v <= maxRealId || u <= maxRealId )
                    coeff = this.xCoordWeights[1];

                var w = this.xCoordEdgeWeightValue ? weight : 1.0;

                var score = coeff * w;

                for (var i = 0; i < score; i++) {
                    if (this.ranks[u] <= this.ranks[v])
                        positionsAbove.push(xcoord.xcoord[u]);
                    if (this.ranks[u] >= this.ranks[v])
                        positionsBelow.push(xcoord.xcoord[u]);
                }
            }
        }

        var numericSortFunc = function(a,b) { return a - b; };

        var median      = undefined;
        var medianAbove = undefined;
        var medianBelow = undefined;

        if (considerAbove && positionsAbove.length > 0) {
            positionsAbove.sort(numericSortFunc);
            var middle  = Math.ceil(positionsAbove.length/2);
            if (middle >= positionsAbove.length)
                middle = positionsAbove.length - 1;
            if (positionsAbove.length % 2 == 0)
                medianAbove = (positionsAbove[middle] + positionsAbove[middle-1])/2;
            else
                medianAbove = positionsAbove[middle];
        }
        if (considerBelow && positionsBelow.length > 0) {
            positionsBelow.sort(numericSortFunc);
            var middle  = Math.ceil(positionsBelow.length/2);
            if (middle >= positionsBelow.length)
                middle = positionsBelow.length - 1;
            if (positionsBelow.length % 2 == 0)
                medianBelow = (positionsBelow[middle] + positionsBelow[middle-1])/2;
            else
                medianBelow = positionsBelow[middle];
        }

        if (medianAbove && medianBelow)
            median = Math.max(medianAbove, medianBelow);
        else if (medianAbove)
            median = medianAbove;
        else
            median = medianBelow;

        return Math.ceil(median);
    },

    try_shift_left: function (xcoord, moveBoundaryVertices)
    {
        // similar to try_shift_right, but attempts to shift left: binary searches positions from
        // current to leftmost possible (withotu moving other vertices), looking for the locally
        // best position. As with try_shift_right, since we are not guaranteed the strictly
        // increasing/decreasing score binary search is just one heuristic which might work good
        // and fast.
        // (note one diff with try_shift_right which may produce new not-yet-seen arrangements is
        //  that this shifts at most one vertex, while shift_right may shift many)

        //this.displayGraph( xcoord.xcoord, "shiftleft-start" );

        for (var r = 1; r <= this.maxRank; r++) {

            var fromO = moveBoundaryVertices ? 0 : 1;
            var toO   = moveBoundaryVertices ? this.order.order[r].length : this.order.order[r].length - 1;

            for (var i = fromO; i < toO; i++) {

                //printObject(xcoord.xcoord);

                var v = this.order.order[r][i];

                var rankToUseForScore = r;

                var initScore = this.xcoord_score(xcoord, rankToUseForScore);

                // find min{same_order.left, all_parents.left, all_children.left)
                var mostLeftLocation = this.find_left_boundary(v, xcoord);

                var maxShift = xcoord.xcoord[v] - mostLeftLocation;
                if (maxShift <= 0) continue;

                var bestShift = 0;
                var bestScore = initScore;
                var shiftAmount = maxShift;

                do
                {
                    xcoord.xcoord[v] -= shiftAmount;

                    var newScore = this.xcoord_score(xcoord, rankToUseForScore);

                    xcoord.xcoord[v] += shiftAmount;

                    if (newScore.isBettertThan(bestScore)) {
                        bestShift = shiftAmount
                        bestScore = newScore;
                    }

                    if (shiftAmount > 3)
                        shiftAmount -= 2;
                    else
                        shiftAmount -= 1;
                }
                while (shiftAmount > 0);

                if (bestScore.isBettertThan(initScore)) {
                    xcoord.shiftLeftOneVertex(v, bestShift);
                }
            }

            //this.displayGraph( xcoord.xcoord, "shiftleft-rank-" + r );
        }
    },

    find_left_boundary: function(v, xcoord) {
        if (this.order.vOrder[v] > 0)
            return xcoord.getLeftMostNoDisturbPosition(v);

        var leftMost = xcoord.xcoord[v];

        var outEdges = this.GG.getOutEdges(v);
        for (var e = 0; e < outEdges.length; e++) {
            var u = outEdges[e];
            leftMost = Math.min(leftMost, xcoord.xcoord[u]);
        }
        var inEdges = this.GG.getInEdges(v);
        for (var e = 0; e < inEdges.length; e++) {
            var u = inEdges[e];
            leftMost = Math.min(leftMost, xcoord.xcoord[u]);
        }

        return leftMost;
    },

    widen_graph: function(xcoord)
    {
        var improved = true;

        while(improved) {
            //this.displayGraph(xcoord.xcoord, 'sofar');
            //improved = this.improve_graph_edges(xcoord);
            //this.displayGraph(xcoord.xcoord, 'afteredges');
            this.try_shift_right(xcoord, true, true, false);
            //this.displayGraph(xcoord.xcoord, 'aftershift1');
            this.try_shift_left (xcoord, false);
            //this.displayGraph(xcoord.xcoord, 'aftershift2');
            improved = this.try_straighten_long_edges(xcoord);
            //this.displayGraph(xcoord.xcoord, 'afterlongedges');
        }
    },

    improve_graph_edges: function (xcoord)
    {
        // move leftmost and rigthmost vertices for a more sparse and
        // more visually pleasing arrangament

        var imrpovedAtLeastOnce = false;
        var improved = true;

        while (improved)
        {
            improved = false;

            for (var r = 0; r <= this.maxRank; r++)
            {
                var numVertThisOrder = this.order.order[r].length;

                if (numVertThisOrder <= 1) continue;

                var v = this.order.order[r][0];

                // find min{same_order.left, all_parents.left, all_children.left)
                var desiredLocation = this.find_left_pleasing_position(v, xcoord);

                var shift = xcoord.xcoord[v] - desiredLocation;

                if (shift > 0) {
                    xcoord.shiftLeftOneVertex(v, shift);
                    improved            = true;
                    imrpovedAtLeastOnce = true;
                }

                var u = this.order.order[r][numVertThisOrder-1];

                var desiredLocation = this.find_right_pleasing_position(u, xcoord);

                var shift = desiredLocation - xcoord.xcoord[u];

                if (shift > 0) {
                    xcoord.shiftRightAndShiftOtherIfNecessary(u, shift);
                    improved            = true;
                    imrpovedAtLeastOnce = true;
                }
            }
        }
    },

    find_left_pleasing_position: function(v, xcoord)
    {
        // if have only one child and one parent - move to the leftmost of the two
        if (this.GG.v[v].length == 1 && this.GG.inedges[v].length == 1) {
            var result = Math.min(xcoord.xcoord[this.GG.v[v][0]],
                                  xcoord.xcoord[this.GG.inedges[v][0]]);
            return Math.max(result, xcoord.halfWidth[v]);
        }

        // if have more than one, move to the rightmost of all as long as we are
        // moving left not right
        return xcoord[v];
    },

    find_right_pleasing_position: function(v, xcoord)
    {
        // if have only one child and one parent - move to the rightmost of the two
        var lenOut = this.GG.v[v].length;
        var lenIn  = this.GG.inedges[v].length;

        if (lenOut == 1 && lenIn == 1) {
            var result = Math.max(xcoord.xcoord[this.GG.v[v][0]],
                                  xcoord.xcoord[this.GG.inedges[v][0]]);
            return Math.max(result, xcoord.xcoord[v]);
        }

        // if have more than one, move to the leftmost of all, as long as we are
        // moving right
        var result = Infinity;

        for (var i = 0 ; i < lenOut; i++) {
            var u = this.GG.v[v][i];
            if (xcoord.xcoord[u] < result) result = xcoord.xcoord[u];
        }

        return Math.max(xcoord[v], result);
    },

    try_straighten_long_edges: function (xcoord)
    {
        // try to straigten long edges without moving any other vertices

        var improved = false;

        var maxRealId = this.GG.getMaxRealVertexId();
        var numVert   = this.GG.getNumVertices();

        var checked = [];
        for (var v = maxRealId+1; v < numVert; v++) {
            // ignore removed virtual nodes which were placed onrank 0 by removeRelationshipRanks()
            if (this.ranks[v] == 0)
                checked[v] = true;
            else
                checked[v] = false;
        }

        for (var v = maxRealId+1; v < numVert; v++) {

            if (checked[v]) continue;

            // find a long edge - something with only one in and one out edge, both going
            // to a virtual vertex. Note: all virtual vertices have only one in and one out edge.
            var inV = this.GG.inedges[v][0];
            if (inV <= maxRealId) continue; // a real vertex above this

            var outV = this.GG.v[v][0];
            if (outV <= maxRealId) continue; // a real vertex below this

            // find the entire edge + head
            var chain = [v];
            while (true) {
                checked[inV] = true;
                chain.push(inV);
                inV = this.GG.inedges[inV][0];
                if (inV <= maxRealId) break; // found "head"
            }
            while (true) {
                checked[outV] = true;
                chain.push(outV);
                outV = this.GG.v[outV][0];
                if (outV <= maxRealId) break; // found "tail"
            }

            var ranks = this.ranks;
            var sortfunc = function(a,b) {
                return (ranks[a] - ranks[b]);
            };

            // sort head-to-tail by rank
            chain.sort(sortfunc);

            // go over all nodes from head to tail looking for a bend and trying
            // to move the head to remove the bend

            var currentCenter = xcoord.xcoord[chain[0]];
            var corridorLeft  = xcoord.getLeftMostNoDisturbPosition(chain[0]);
            var corridorRight = xcoord.getRightMostNoDisturbPosition(chain[0]);
            if (corridorRight < corridorLeft) break;

            // go over all nodes from head to tail looking for a bend
            for (var i = 1; i < chain.length; i++) {
                var nextV      = chain[i];
                var nextCenter = xcoord.xcoord[nextV];
                if (nextCenter != currentCenter) {
                    if (nextCenter >= corridorLeft && nextCenter <= corridorRight) {
                        // all the nodes above can be shifted to this location!
                        for (var j = 0; j < i; j++)
                            xcoord.xcoord[chain[j]] = nextCenter;

                        improved      = true;
                        currentCenter = nextCenter;
                    }
                    else {
                        break;
                    }
                }

                // narrow the coridor to the common available space including this vertex as well
                corridorLeft  = Math.max(corridorLeft,  xcoord.getLeftMostNoDisturbPosition(nextV));
                corridorRight = Math.min(corridorRight, xcoord.getRightMostNoDisturbPosition(nextV));
                if (corridorRight < corridorLeft) break;  // no luck, can't straighten
            }
        }

        return improved;
    }
    //========================================================================[position]=
};


//-------------------------------------------------------------

function draw_graph( internalG )
{
    var grapher = new DrawGraph(internalG);

    var horizontalSeparationDist = 5;     // same relative units as in intenalG.width fields

    var virtualNodeWidth = 2;             // same relative units as in intenalG.width fields
                                          // (better results are obtained when it is even)

    var mostCompact = false;              // when true, graph may be more compact (sum of all edge
                                          // lengths will be smaler) but with more curved edges

    var orderingInitIters = 10;           // default: 10

    var orderingIterations = 24;          // paper used: 24

    var xcoordIterations   = 2;           // default: 8

    var xcoordWeights      = [1, 2, 8];   // edges[real-real,real-virt,virt-virt]; paper used: [1, 2, 8]; see xcoord_score

    var xcoordEdgeWeightValue = true;     // when optimizing edge length/cuvature take
                                          // edge weigth into account or not

    var begin = new Date().getTime();

    result = grapher.draw( horizontalSeparationDist,
                           virtualNodeWidth,
                           mostCompact,
                           xcoordEdgeWeightValue,
                           orderingInitIters,
                           orderingIterations,
                           xcoordIterations, xcoordWeights );

    var runTime = new Date().getTime() - begin;

    console.log( "=== Running time: " + runTime + "ms ==========" );

    return result;
}




