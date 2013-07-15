

DrawGraph = function(internalG)
{
    this.G  = internalG;       // real graph
    this.GG = undefined;       // graph with multi-rank edges replaced by virtual vertices/edges

    this.ranks     = undefined;
    this.maxRank   = undefined;
    this.order     = undefined;
    this.positions = undefined;
};

DrawGraph.prototype = {

    maxOrderingIterations: 24,
    maxXcoordIterations:   8,
    xCoordWeights:         [1, 2, 8],   // see xcoord_score()
    xCoordEdgeWeightValue: true,        // see xcoord_score()
    mostCompact:           false,

    draw: function( horizontalSeparationDist,      // mandatory argument
                    virtualNodeWidth,              // mandatory argument
                    mostCompact,                   // mandatory argument
                    xcoordEdgeWeightValue,         // optional
                    maxOrderingIterations,         // optional
                    maxXcoordIterations,           // optional
                    xcoordWeights )                // optional
    {
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

        this.order = this.ordering(maxOrderingIterations);
		
		// 2.5
		// re-rank relationship nodes based on parents being next to each other (& re-order)
        this.reRank();

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
        var rankedSpanningTree = this.feasible_tree();

        /*
        // this part tries to minimize weight(e) * length(e) - only makes sense when weights are set

        var cut_values = this.init_cutvalues(rankedSpanningTree);

        while ( (e = this.leave_edge(cut_values)) != null )
        {
            var f = this.enter_edge(e, cut_values, rankedSpanningTree);

            rankedSpanningTree.exchange( e, f );
        }

        // final improvements

        this.normalize( spanningTree );   // normalize to 0-N (if not already)

        this.balance( spanningTree );     // put nodes which can have many good ranks on a rank
                                          // with least noides to to minimize width
        */

        return { ranks:   rankedSpanningTree.getRanks(),
                 maxRank: rankedSpanningTree.getMaxRank() };
    },

    //-[feasible tree]-------------------------------------------------------------------
    feasible_tree: function ()
    {
        // A feasible ranking is one satisfying constraints length(e) ≥ minlength(e) for all e.

        spanTree = this.init_rank();

        /*
        // Note: the part below is only necessary when minlength(e) can be above 1
        while ( tight_tree() <  V )
        {
            e = a non-tree edge incident on the tree with a minimal amount of slack;

            delta = slack(e);
            if ( incident node is e.head )
                delta = -delta;

            for ( v in Tree )
                v.rank = v.rank + delta;
        }
        */

        return spanTree;
    },

    init_rank: function ()
    {
        // An initial feasible ranking is computed.

        // [From the paper]
        //
        //   A graph must be acyclic to have a consistent rank assignment: a preprocessing step
        //   detects cycles and breaks them by reversing certain edges [RDM]. Using ~DFS.
        //   We implemented a heuristic to reverse edges that participate in many cycles?
        //
        //   Our version keeps nodes in a queue. Nodes are placed in the queue when they have no
        //   unscanned in-edges. As nodes are taken off the queue, they are assigned the least rank
        //   that satisfies their in-edges, and their out-edges are marked as scanned.
        //   In the simplest case, where weight(e) = 1 for all edges, this corresponds to viewing
        //   the graph as a poset and assigning the minimal elements to rank 0. These nodes are
        //   removed from the poset and the new set of minimal elements are assigned rank 1, etc.

        // [Algorithm implemented here] - BFS
        var spanTree = new RankedSpanningTree();

        // spanTree.initTreeByBFS(this.G, 0);
        spanTree.initTreeByInEdgeScanning(this.G, 0);

        return spanTree;
    },

    tight_tree: function ()
    {
      // tight_tree finds a maximal tree of tight edges containing some fixed node and returns the
      // number of nodes in the tree. Note that such a maximal tree is just a spanning tree for the
      // subgraph induced by all nodes reachable from the fixed node in the underlying undirected
      // graph using only tight edges. In particular, all such trees have the same number of nodes.

      // ... spanning tree using only tight edges: similar to init_rank
      // ... or just check if there is an edge with above 0 slack?
    },
    //-------------------------------------------------------------------[feasible tree]-

    /*
    init_cutvalues: function( rankedSpanningTree )
    {
      // Given a feasible spanning tree, we can associate an integer cut value with each tree edge:
      // if the tree edge is deleted, the tree breaks into two connected components, the tail
      // component containing the tail node of the edge, and the head component containing the head
      // node. The cut value is defined as the sum of the weights of all edges from the tail
      // component to the head component, including the tree edge, minus the sum of the weights of
      // all edges from the head component to the tail component.
      //
      // init_cutvalues() - computes the cut values of the tree edges. For each tree edge, this is
      // computed by marking the nodes as belonging to the head or tail component, and then
      // performing the sum of the signed weights of all edges whose head and tail are in different
      // components, the sign being negative for edges going from the head to the tail component.

      ...draft:
      var E = rankedSpanningTree.getAllEdges();

      // complexity: straightforward: O(N^2)
      for each e in E
        var headTail = rankedSpanningTree.getComponentsIfEIsRemoved( e )

        for (each ee in original_graph)
            if (ee.from in head && ee.to in tail) {
               add (weight(ee) * length(ee)) to e's cut value
            }
            else if (ee.from in tail && ee.to in head) {
               subtract (weight(ee) * length(ee)) from e's cut value
            }

       return cut_values
    },

    leave_edge: function (cut_values)
    {
      // Returns a tree edge with a negative cut value, or nil if there is none.
      // Use values compute by init_cutvalues ()

      // ...[EASY]
      // ...go over cut_values array, looking for neg values. Return nil if non found
      //    or the one with greatest abs value
    },

    enter_edge: function ()
    {
      // finds a non-tree edge to replace e. This is done by breaking the edge e, which divides the
      // tree into a head and tail component. All edges going from the head component to the tail
      // are considered, with an edge of min slack being chosen. This is necessary to maintain
      // feasibility.
      // [??? EASY]
    },

    normalize: function ()
    {
      // The solution is normalized by setting the least rank to zero.
      // [EASY]
    },

    balance: function ()
    {
      // Nodes having equal in- and out-edge weights and multiple feasble ranks are moved to a
      // feasible rank with the fewest nodes. The purpose is to reduce crowding and improve the
      // aspect ratio of the drawing. The adjustment does not change the cost of the rank
      // assignment. Nodes are adjusted in a greedy fashion, which works sufficiently well.
      // [??? CAN SKIP?]
    },*/

    //============================================================================[rank]=

    //=[ordering]========================================================================
    ordering: function(maxOrderingIterations)
    {
        var order = this.init_order();
        //printObject(order);

        var noChangeIterations = 0;
        var maxNoC = 0;

        var best                = order.copy();
        var bestCrossings       = this.edge_crossing(best);
        var bestEdgeLengthScore = this.edge_length_score(best);

        for (var i = 0; i < maxOrderingIterations; i++) {
            //if (bestCrossings == 0) break;   // still want to optimize for edge lengths

            // try to optimize based on a heuristic: just do it without checking if the result
            // is good or not. The layout may be not as good rigth away but better after a few
            // iterations
            this.wmedian(order, i);

            // try to optimize checking if each step is useful (bad adjustments are discarded);
            this.transpose(order, maxOrderingIterations);

            var numCrossings = this.edge_crossing(order);

            var edgeLengthScore = this.edge_length_score(order);

            console.log("=== EdgeLengthScore: " + edgeLengthScore );

            if (numCrossings < bestCrossings ||
                (numCrossings == bestCrossings && edgeLengthScore < bestEdgeLengthScore )
               ) {
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

        // [TODO] probably not needed for pedigrees, as an outlier long edge is less
        //        important than good layout for most other nodes
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
            order[r]      = [];
        }

        for (var i = 0; i < this.GG.getNumVertices(); i++) {
            vOrder[i] = undefined;
        }

        // Use BFS -----------------------------
        var queue = new Queue();

        queue.push( this.GG.root );

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

        // try to place people in a relationship close to each other
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
        }
        
        return totalEdgeLengthInPositions;
    },

    edge_crossing: function(order, onlyRank)
    {
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
            for (var r = 1; r <= this.maxRank; r++) {
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
            for (var r = this.maxRank-1; r >= 0; r--) {
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

    transpose: function(order, maxIterations)
    {
        // for each rank: goes over all vertices in the rank and tries to switch orders of two
        //                adjacent vertices. If numCrossings is improved keeps the new order.
        //                repeats for each rank, and if there was an improvementg tries again.
        var improved = true;

        var numPasses = 0;     // [TODO] not sure if termination is guaranteed, so added an
                               //        iteration cap just in case. To verify if necessary.

        while( improved && numPasses < maxIterations )
        {
            numPasses++;
            improved = false;

            for (var r = 0; r <= this.maxRank; r++)
            {
                var numEdgeCrossings = this.edge_crossing(order, r);
                var edgeLengthScore  = this.edge_length_score(order, r);

                var maxIndex = order.order[r].length - 1;
                for (var i = 0; i < maxIndex; i++) {

                    order.exchange(r, i, i+1);

                    var newEdgeCrossings = this.edge_crossing(order, r);
                    var newLengthScore   = this.edge_length_score(order, r);

                    if (newEdgeCrossings < numEdgeCrossings ||
                        (newEdgeCrossings == numEdgeCrossings && newLengthScore < edgeLengthScore) ) {
                        // this was a good exchange, apply it to the current real ordering
                        improved = true;
                        numEdgeCrossings = newEdgeCrossings;
                        //if (numEdgeCrossings == 0) return 0; // still want to optimize for edge lengths
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
            if (chain.length <= 5) {
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

                    for (var move1 = -5; move1 <= 5; move1++ ) {
                        for (var move2 = -5; move2 <= 5; move2++ ) {
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

            //-----------------------------------------------------------------
            if (chain.length > 2) {
                var bestCrossings = numCrossings;
                // try to move the entire (long) edge left until it hits all 0 order
                var newOrder  = order.copy();
                var moved     = true;
                while (moved) {
                    moved = false;
                    for (var i = chain.length-1; i >= 0; i--) {
                        var piece = chain[i];
                        var rank  = ranks[piece];
                        var ord   = newOrder.vOrder[piece];

                        if (ord > 0) {
                            moved = true;

                            newOrder.exchange(rank, ord, ord-1);

                            var newCross = this.edge_crossing(newOrder);
                            if (newCross < bestCrossings) {
                                bestCrossings = newCross;
                                bestOrder     = newOrder.copy();
                            }
                        }
                    }
                }
                /*
                // try to move the entire (long) edge right until it hits all max order
                var newOrder  = order.copy();
                var moved     = true;
                while (moved) {
                    moved = false;
                    for (var i = chain.length-1; i >= 0; i--) {
                        var piece = chain[i];
                        var rank  = ranks[piece];
                        var ord   = newOrder.vOrder[piece];

                        if (ord < newOrder.order[rank].length - 2) {
                            moved = true;

                            newOrder.exchange(rank, ord, ord+1);

                            var newCross = this.edge_crossing(newOrder);
                            if (newCross < bestCrossings) {
                                bestCrossings = newCross;
                                bestOrder     = newOrder.copy();
                            }
                        }
                    }
                }
                */

                if (bestCrossings < numCrossings) {
                    order.assign(bestOrder);
                    numCrossings = bestCrossings;
                }

            }
        }

        return numCrossings;
    },
    //========================================================================[ordering]=

    //=====================================================================[re-ordering]=
    reRank: function() {
        // for each relationship node:
    	//  if parents are ordere next to each other re-rank & reorder
		
        for (var i = 0; i < this.GG.getNumVertices(); i++) {
            if (this.GG.isRelationship(i)) {			    
    		    var parents = this.GG.getInEdges(i);
			
    			// each "relationship" node should only have two "parent" nodes
        	    if (parents.length != 2) {
                    throw "Assertion failed: 2 parents per relationship";
                }

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
        
        this.removeEmptyRanks();
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
    
    removeEmptyRanks: function () {
        for (var r = 1; r <= this.maxRank; r++) {
            if ( this.order.order[r].length == 0 ) {
                this.order.order.splice(r,1);
                
                for ( var v = 0; v < this.ranks.length; v++ ) {
                    if ( this.ranks[v] > r )
                        this.ranks[v]--;
                }

                this.maxRank--;
            }
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

        var xbest     = xcoord.copy();
        var bestScore = this.xcoord_score(xbest);
        var prevScore = 0;

        //this.displayGraph(xbest.xcoord, 'init');

        this.try_shift_right(xcoord, true, false, true);
        this.try_shift_left (xcoord, true);
        this.try_shift_right(xcoord, false, true, true);
        this.try_shift_left (xcoord, true);

        this.displayGraph(xcoord.xcoord, 'firstAdj');

        for ( var i = 0; i <= this.maxXcoordIterations; i++ )
        {
            this.try_shift_right(xcoord, true, true, true);
            this.try_shift_left (xcoord, true);
            //this.try_shift_long_edges(xcoord);

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
            rankFrom = Math.max(0,            onlyRank-1);
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

        //console.log("XcoordScore: " + score);
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

            var considerBelow = scoreQualityOfNodesBelow || (r == 0);
            var considerAbove = (scoreQualityOfNodesAbove || r == this.maxRank) && (r != 0);

            var toO   = moveBoundaryVertices ? 0 : 1;
            var fromO = moveBoundaryVertices ? this.order.order[r].length - 1 : this.order.order[r].length - 2;

            for (var i = fromO; i >= toO; i--) {

                var v = this.order.order[r][i];

                if (debugV && v != debugV ) continue;

                // we care about the quality of resulting graph only for some ranks: sometimes
                // only above the changem, sometimes only below the change; in any case we know
                // the change of position of vertices on this rank is not going to affect ranks
                // far away, so we can only compute the sxcore for the rnaks we care about.
                var rankToUseForScore = r;
                if (!considerAbove) rankToUseForScore = r+1;
                if (!considerBelow) rankToUseForScore = r-1;

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

        var outEdges = this.GG.getOutEdges(v);
        for (var e = 0; e < outEdges.length; e++) {
            var u = outEdges[e];
            if (u == v) continue;
            var weight = this.GG.weights[v][u];

            // have an edge from 'v' to 'u' with weight this.GG.weights[v][u]

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
                else
                    positionsBelow.push(xcoord.xcoord[u]);
            }
        }

        var inEdges = this.GG.getInEdges(v);
        for (var e = 0; e < inEdges.length; e++) {
            var u = inEdges[e];
            if (u == v) continue;
            var weight = this.GG.weights[u][v];

            // have an edge from 'u' to 'v' with weight this.GG.weights[u][v]

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
                else
                    positionsBelow.push(xcoord.xcoord[u]);
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

        for (var r = 0; r <= this.maxRank; r++) {

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
            improved = this.improve_graph_edges(xcoord);
            //this.displayGraph(xcoord.xcoord, 'afteredges');
            this.try_shift_right(xcoord, true, true, false);
            this.try_shift_left (xcoord, false);
            //this.displayGraph(xcoord.xcoord, 'aftershifts');
            improved |= this.try_shift_long_edges(xcoord);
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

    try_shift_long_edges: function (xcoord)
    {
        // try to straigten long edges without moving any other vertices

        var improved = false;

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

                // narrow th ecoridor to the common available space including this vertex as well
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

    var orderingIterations = 12;          // paper used: 24

    var xcoordIterations   = 2;           // default: 8

    var xcoordWeights      = [1, 4, 32];  // paper used: [1, 2, 8]; see xcoord_score

    var xcoordEdgeWeightValue = true;     // when optimizing edge length/cuvature take
                                          // edge weigth into account or not

    var begin = new Date().getTime();

    result = grapher.draw( horizontalSeparationDist,
                           virtualNodeWidth,
                           mostCompact,
                           xcoordEdgeWeightValue,
                           orderingIterations,
                           xcoordIterations, xcoordWeights );

    var runTime = new Date().getTime() - begin;

    console.log( "=== Running time: " + runTime + "ms ==========" );

    return result;
}




