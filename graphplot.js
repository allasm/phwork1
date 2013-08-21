DrawGraph = function( internalG,
                      horizontalPersonSeparationDist, // mandatory argument
                      horizontalRelSeparationDist,    // mandatory argument
                      maxInitOrderingBuckets,         // optional
                      maxOrderingIterations,          // optional
                      maxXcoordIterations )           // optional
{
    this.G  = internalG;         // real graph (InternalGraph class)
    this.GG = undefined;         // same graph with multi-rank edges replaced by virtual vertices/edges

    this.ranks     = undefined;  // array: index = vertex id, value = rank
    this.maxRank   = undefined;  // int:   max rank in the above array (maintained for performance reasons)

    this.order     = undefined;  // class: Ordering

    this.vertLevel = undefined;
    this.positions = undefined;

    this.ancestors = undefined;  // for each node lists all its ancestors and the closest relationship distance
    this.consangr  = undefined;  // set of consanguineous relationship IDs

    this.initialize( horizontalPersonSeparationDist, horizontalRelSeparationDist,
                     maxInitOrderingBuckets, maxOrderingIterations, maxXcoordIterations );
};

DrawGraph.prototype = {

    maxInitOrderingBuckets: 5,           // it may take up to ~factorial_of_this_number iterations to generate initial ordering
    maxOrderingIterations:  24,          // up to so many iterations are spent optimizing initial ordering
    maxXcoordIterations:    8,
    xCoordEdgeWeightValue:  true,        // when optimizing edge length/curvature take
                                         // edge weight into account or not
    horizontalPersonSeparationDist: 1,
    horizontalRelSeparationDist:    1,

    initialize: function( horizontalPersonSeparationDist,
                          horizontalRelSeparationDist,
                          maxInitOrderingBuckets,
                          maxOrderingIterations,
                          maxXcoordIterations )
    {
        if (horizontalPersonSeparationDist) this.horizontalPersonSeparationDist = horizontalPersonSeparationDist;
        if (horizontalRelSeparationDist)    this.horizontalRelSeparationDist    = horizontalRelSeparationDist;
        if (maxInitOrderingBuckets)         this.maxInitOrderingBuckets         = maxInitOrderingBuckets;
        if (maxOrderingIterations)          this.maxOrderingIterations          = maxOrderingIterations;
        if (maxXcoordIterations)            this.maxXcoordIterations            = maxXcoordIterations;

        if (this.maxInitOrderingBuckets > 8)
            throw "Too many ordering buckets: number of permutations (" + this.maxInitOrderingBuckets.toString() + "!) is too big";

        var timer = new Timer();

        // 1)
        var rankResult = this.rank();

        this.ranks   = rankResult.ranks;
        this.maxRank = rankResult.maxRank;

        timer.printSinceLast("=== Ranking runtime: ");

        // 2)
        // ordering algorithms needs all edges to connect nodes on neighbouring ranks only;
        // to accomodate that multi-rank edges are split into a chain of edges between new
        // "virtual" nodes on intermediate ranks
        this.GG = this.G.makeGWithSplitMultiRankEdges(this.ranks, this.maxRank);

        printObject( this.GG );

        this.order = this.ordering(this.maxInitOrderingBuckets, this.maxOrderingIterations);

        timer.printSinceLast("=== Ordering runtime: ");

        // 2.1)
        var ancestors = this.findAllAncestors();

        this.ancestors = ancestors.ancestors;
        this.consangr  = ancestors.consangr;

		// 2.2)
        // once ordering is known need to re-rank relationship nodes to be on the same level as the
        // lower ranked parent. Attempt to place next to one of the parents; having ordering info
        // helps to pick the parent in case parents are on the same level and not next to each other
        this.reRankRelationships();

        //printObject( this.GG );
        //printObject( this.ranks );

        timer.printSinceLast("=== Ancestors + re-ranking runtime: ");

        // 3)
        this.positions = this.position(this.horizontalPersonSeparationDist, this.horizontalRelSeparationDist);

        timer.printSinceLast("=== Positioning runtime: ");

        // 4)

        this.vertLevel = this.positionVertically();

        timer.printSinceLast("=== Vertical spacing runtime: ");
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
        //           outgoing edge in another component, and we only shorten one edge per re-ranking iteration
        // 3. reduce all ranks by that edge's length minus 1
        // 4. once any two components are merged need to redo the entire process because the new
        //    resuting component may have other minimum in/out multi-rnak edges
        //
        // TODO: add support for user-defined ranks, e.g. in "i'm my own grandpa" case one of the
        //       edges will be shortened, while the user may want both father-daughter/mother-son
        //       edges to be long

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
                            // count edges going to nodes in unknown components. Thus we may have to
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
                                if (nodeColor[vv] != null && nodeColor[vv] != maxComponentColor) {
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


            //console.log("components: " + stringifyObject(component));
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
    ordering: function(maxInitOrderingBuckets, maxOrderingIterations)
    {
        var best                = undefined;
        var bestCrossings       = Infinity;

        var rootlessPartners  = this.findAllRootlessPartners();
        var permutationsRoots = this.computePossibleParentlessNodePermutations(maxInitOrderingBuckets, rootlessPartners);
        var permutationsLeafs = this.computePossibleLeafNodePermutations(maxInitOrderingBuckets);

        var initOrderIterTotal = 0;  // just for reporting

        var useStack = false;

        while ( true ) {
            for (var initOrderIter = 0; initOrderIter < permutationsRoots.length; initOrderIter++ ) {
                initOrderIterTotal++;

                order = this.init_order_top_to_bottom(permutationsRoots[initOrderIter], rootlessPartners, useStack);

                this.transpose(order, false);  // fix locally-fixable edge crossings,
                                               // but do not bother doing minor optimizations (for performance reasons)

                var numCrossings = this.edge_crossing(order);

                if ( numCrossings < bestCrossings ) {
                    best          = order.copy();
                    bestCrossings = numCrossings;
                    //console.log("UsingP: " + stringifyObject(permutationsRoots[initOrderIter]) + " " + useStack.toString());
                    if ( numCrossings == 0 ) break;
                }
            }

            if ( bestCrossings == 0 ) break;

            for (var initOrderIter2 = 0; initOrderIter2 < permutationsLeafs.length; initOrderIter2++ ) {
                initOrderIterTotal++;

                order = this.init_order_bottom_to_top(permutationsLeafs[initOrderIter2], useStack);

                this.transpose(order, false);  // fix locally-fixable edge crossings

                var numCrossings    = this.edge_crossing(order);

                if ( numCrossings < bestCrossings ) {
                    best          = order.copy();
                    bestCrossings = numCrossings;
                    //console.log("UsingL: " + stringifyObject(permutationsRoots[initOrderIter]) + " " + useStack.toString());
                    if ( numCrossings == 0 ) break;
                }
            }

            if ( bestCrossings == 0 ) break;
            if ( useStack ) break;
            useStack = true;
        }


        console.log("Initial ordering: " + _printObjectInternal(best.order, 0));
        console.log("Initial ordering:  numCrossings= " + bestCrossings);

        //return best;

        var noChangeIterations = 0;

        var bestEdgeLengthScore = this.edge_length_score(best);

        var order = best.copy();

        for (var i = 0; i < maxOrderingIterations; i++) {
            //if (bestCrossings == 0) break;   // still want to optimize for edge lengths

            // try to optimize based on a heuristic: just do it without checking if the result
            // is good or not. The layout may be not as good rigth away but better after a few
            // iterations
            var changed = this.wmedian(order, i);

            //console.log("median: " + _printObjectInternal(order.order, 0));

            // try to optimize locally (fix easily-fixable edge crossings, put children
            // and partners closer to each other) checking if each step is useful and
            // discarding bad adjustments (i.e. guaranteed to either improve or leave as is)
            this.transpose(order, true);

            //console.log("transpose: " + _printObjectInternal(order.order, 0));

            var numCrossings = this.edge_crossing(order);

            var edgeLengthScore = this.edge_length_score(order);

            if ( numCrossings < bestCrossings ||
                 (numCrossings == bestCrossings && edgeLengthScore < bestEdgeLengthScore) )
            {
                console.log("ordering: new better one selected (" + numCrossings + " crossings, " + edgeLengthScore + " edgeLengthScore)");

                best                = order.copy();
                bestCrossings       = numCrossings;
                bestEdgeLengthScore = edgeLengthScore;
                noChangeIterations  = 0;
            }
            else {
                if (!changed) noChangeIterations++;
                if (noChangeIterations == 6) break;
            }
        }

        // try to optimize long edge placement (as above, bad adjustments are discarded)
        var newBestCrossings = this.transposeLongEdges(best, bestCrossings);

        this.transpose(best, true);

        console.log("Ordering stats:  initOrderIter= " + initOrderIterTotal + ",  reOrderingIter= " + i + ",  noChangeIterations= " + noChangeIterations);
        console.log("Final ordering: " + _printObjectInternal(best.order, 0));
        console.log("Final ordering:  numCrossings= " + newBestCrossings);

        return best;
    },

    findAllRootlessPartners: function ()
    {
        // finds all people without parents which are only connected to one non-rootless node.
        // we know it should be placed right next to that partner in any optimal ordering

        var rootlessPartners = {};

        for (var i = 0; i < this.GG.parentlessNodes.length; i++) {
            var v = this.GG.parentlessNodes[i];

            if ( this.GG.getOutEdges(v).length == 1 ) {
                var relationShipNode = this.GG.getOutEdges(v)[0];

                var parents = this.GG.getInEdges(relationShipNode);

                var otherParent = (parents[0] == v) ? parents[1] : parents[0];

                if (this.GG.getInEdges(otherParent).length > 0) {
                    if (rootlessPartners[otherParent])
                        rootlessPartners[otherParent].push(v);
                    else
                        rootlessPartners[otherParent] = [v];
                }
            }
        }

        console.log("Found rootless partners: " + stringifyObject(rootlessPartners));
        return rootlessPartners;
    },

    computePossibleParentlessNodePermutations: function(maxInitOrderingBuckets, rootlessPartners)
    {
        // 1) split all parentless nodes into at most maxInitOrderingBuckets groups/buckets
        // 2) compute all possible permutations of these groups discarding mirror copies (e.g. [1,2,3] and [3,2,1])
        // 3) return the list of permutations, with the default ordering first in the list

        var buckets = [];
        // 1) detect mini-groups: if two parentless nodes are connected by a relationship and not
        //    connected to anything else treat them as one node (they should be close to each other)
        // 2) split all nodes into at most maxInitOrderingBuckets buckets.
        //    note: if there are less nodes (counting a sub-group from #1 as one node) than max ##
        //           of buckets it is ok, if there are more then have to space them evenly into the buckets.
        // note: each bucket should be an array of node IDs, even if there is only one ID

        console.log("maxInitOrderingBuckets: " + maxInitOrderingBuckets);

        var handled = {};

        for (var p in rootlessPartners) {
            if (rootlessPartners.hasOwnProperty(p)) {
                var rootless = rootlessPartners[p];
                for (var i = 0; i < rootless.length; i++)
                    handled[rootless[i]] = true;   // those nodes will be automatically added at correct ordering later
            }
        }

        var nextBucket = 0;
        for (var i = 0; i < this.GG.parentlessNodes.length; i++) {
            var v = this.GG.parentlessNodes[i];

            if (handled.hasOwnProperty(v)) continue;

            if (buckets.length <= nextBucket) // first node in this bucket
                buckets.push( [] );

            buckets[nextBucket].push(v);
            handled[v] = true;

            if ( this.GG.getOutEdges(v).length == 1 ) {
                // find all nodes which are only connected to a relationship with V
                for (var j = i+1; j < this.GG.parentlessNodes.length; j++) {
                    var u = this.GG.parentlessNodes[j];
                    if (handled.hasOwnProperty(u)) continue;
                    if ( this.GG.getOutEdges(u).length == 1 ) {
                        var relationshipNode = this.GG.getOutEdges(u)[0];
                        var parents = this.GG.getInEdges(relationshipNode);
                        if (parents[0] == v || parents[1] == v)
                        {
                            buckets[nextBucket].push(u);
                            handled[u] = true;
                        }
                    }
                }
            }

            nextBucket++;
            if (nextBucket >= maxInitOrderingBuckets)
                nextBucket = 0; // TODO: pick a bucket with the smallest number of nodes in it
        }

        var permutations = [];

        // Now compute all possible permutations of the buckets
        permute2DArrayInFirstDimension( permutations, buckets, 0);

        //printObject(buckets);
        //printObject(permutations);
        //permutations = [ this.GG.parentlessNodes ];  //DEBUG: no permutations
        //permutations = [[5,4,0,1,2,9]];

        console.log("Found " + permutations.length + " permutations of parentless nodes");

        return permutations;
    },

    computePossibleLeafNodePermutations: function(maxInitOrderingBuckets)
    {
        // see computePossibleParentlessNodePermutations

        var buckets = [];
        // 1) detect mini-groups: if two leaf nodes are connected to a childhub and not
        //    connected to anything else treat them as one node (they should be close to each other)
        // 2) split all nodes into at most maxInitOrderingBuckets buckets.

        var handled = {};
        var nextBucket = 0;
        for (var i = 0; i < this.GG.leafNodes.length; i++) {
            var v = this.GG.leafNodes[i];

            if (handled.hasOwnProperty(v)) continue;

            if (buckets.length <= nextBucket) // first node in this bucket
                buckets.push( [] );

            buckets[nextBucket].push(v);
            handled[v] = true;

            if ( this.GG.getInEdges(v).length != 1 )
                throw "Assertion failed: only one in edge into a leaf node";
            var childhubNode = this.GG.getInEdges(v)[0];

            // find all nodes which are only connected to V's childhub
            for (var j = i+1; j < this.GG.leafNodes.length; j++) {
                var u = this.GG.leafNodes[j];
                if (handled.hasOwnProperty(u)) continue;

                var childhubNodeU = this.GG.getInEdges(u)[0];

                if (childhubNode == childhubNodeU)
                {
                    buckets[nextBucket].push(u);
                    handled[u] = true;
                }
            }

            nextBucket++;
            if (nextBucket >= maxInitOrderingBuckets)
                nextBucket = 0; // TODO: pick a bucket with the smallest number of nodes in it
        }

        var permutations = [];

        // Now compute all possible permutations of the buckets
        permute2DArrayInFirstDimension( permutations, buckets, 0);

        console.log("Found " + permutations.length + " permutations of leaf nodes");

        return permutations;
    },

    init_order_top_to_bottom: function (parentlessNodes, rootlessPartners, useStack)
    {
        // initially orders the nodes in each rank. This may be done by a depth-first or breadth-f
        // search starting with vertices of minimum rank. Vertices are assigned positions in their
        // ranks in left-to-right order as the search progresses.

        var order      = [];          // array of arrays - for each rank list of vertices in order
        var vOrder     = [];          // array - for each v vOrder[v] = order within rank

        for (var r = 0; r <= this.maxRank; r++) {
            order[r] = [];
        }

        for (var i = 0; i < this.GG.getNumVertices(); i++) {
            vOrder[i] = undefined;
        }

        // Use BFS -----------------------------
        var queue = useStack ? new Stack() : new Queue();
        queue.pushAll(parentlessNodes);

        //console.log("Use stacK: " + useStack + ", parentless: " + stringifyObject(parentlessNodes));

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

            //alreadyOrderedSortFunc = function(a,b){return b-a};
            //outEdges.sort(alreadyOrderedSortFunc);

            for (var u = 0; u < outEdges.length; u++) {
                queue.push(outEdges[u]);
            }
        }
        //--------------------------------------

        var o = new Ordering();
        o.init(order, vOrder);

        //printObject(o);

        // place rootless partners in the best possible way
        for (var p in rootlessPartners) {
            if (rootlessPartners.hasOwnProperty(p)) {
                // now check all rootless partners of p. Will place them next to p
                // in the ordering, but need to count how many partners p already has on each side
                // (to place rootless partners on that side to minimize edge crossings)
                var partnersToTheLeft  = 0;
                var partnersToTheRight = 0;
                var pOrder             = o.vOrder[p];
                var rank               = this.ranks[p];

                var pRelationships = this.GG.getOutEdges(p);
                for (var j = 0; j < pRelationships.length; j++) {
                    if ( this.GG.isRelationship(pRelationships[j]) ) {   // ignore long edges
                        var parents = this.GG.getInEdges(pRelationships[j]);
                        var partner = (parents[0] == p) ? parents[1] : parents[0];
                        if ( o.vOrder[partner] > pOrder )
                            partnersToTheRight++;
                        else
                            partnersToTheLeft++;
                    }
                }

                var rootless = rootlessPartners[p];
                //console.log("p: " + p + ", rootless: " + stringifyObject(rootless) + ", rank: " + rank + ", order: " + pOrder);
                for (var i = 0; i < rootless.length; i++) {
                    var v = rootless[i];

                    // so we have a v-p partnership. Place v next to p on the side which has less partners already
                    if (partnersToTheRight < partnersToTheLeft) {
                        partnersToTheRight++;
                        o.insert(rank, pOrder+1, v);
                    }
                    else {
                        partnersToTheLeft++;
                        o.insert(rank, pOrder, v);
                    }
                }
            }
        }

        //printObject(o);
        return o;
    },

    init_order_bottom_to_top: function (leafNodes, useStack)
    {
        // initially orders the nodes in each rank. This may be done by a depth-first or breadth-f
        // search starting with vertices of minimum rank. Vertices are assigned positions in their
        // ranks in left-to-right order as the search progresses.

        var order      = [];          // array of arrays - for each rank list of vertices in order
        var vOrder     = [];          // array - for each v vOrder[v] = order within rank

        for (var r = 0; r <= this.maxRank; r++) {
            order[r] = [];
        }

        for (var i = 0; i < this.GG.getNumVertices(); i++) {
            vOrder[i] = undefined;
        }

        var queue = useStack ? new Stack() : new Queue();
        queue.pushAll(leafNodes);

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
            var inEdges = this.GG.getInEdges(next);

            for (var u = 0; u < inEdges.length; u++) {
                queue.push(inEdges[u]);
            }
        }

        var o = new Ordering();
        o.init(order, vOrder);

        return o;
    },

    edge_length_score: function(order, onlyRank)
    {
        var totalEdgeLengthInPositions = 0;
        var totalEdgeLengthInChildren  = 0;

        // Two goals: without increasing the number of edge crossings try to
        //   higher priority: place people in a relationship close(r) to each other
        //   lower priority:  place all children close(r) to each other
        for (var i = 0; i < this.GG.getNumVertices(); i++) {

            if (onlyRank) {
                var rank = this.ranks[i];
                if (rank < onlyRank - 1 || rank > onlyRank + 1) continue;
            }

            if (this.GG.isRelationship(i)) {
    		    var parents = this.GG.getInEdges(i);

                // each "relationship" node is guaranteed to have exactly two "parent" nodes (validate() checks that)

                // only if parents have the same rank
                if ( this.ranks[parents[0]] != this.ranks[parents[1]] )
    			    continue;

                var order1 = order.vOrder[parents[0]];
                var order2 = order.vOrder[parents[1]];

                totalEdgeLengthInPositions += Math.abs(order1 - order2);
            }

            if (this.GG.isChildhub(i)) {
                // get the distance between the rightmost and leftmost child
                var children = this.GG.getOutEdges(i);
                if ( children.length > 0 ) {
                    var minOrder = order.vOrder[children[0]];
                    var maxOrder = minOrder;
                    for (var j = 1; j < children.length; j++) {
                        var ord = order.vOrder[children[j]];
                        if ( ord > maxOrder ) maxOrder = ord;
                        if ( ord < minOrder ) minOrder = ord;
                    }
                }
                totalEdgeLengthInChildren += (maxOrder - minOrder);
                //if (i == 25)
                //console.log("lenInChildren: maxOrd = " + maxOrder + ", minOrd = " + minOrder + "  (children: " + stringifyObject(children) + ", order: " + stringifyObject(order.order[4]) + ")");
            }
        }

        //console.log("r = " + onlyRank + ", edgeLength = " + totalEdgeLengthInPositions + ", childLen = " + totalEdgeLengthInChildren);
        return totalEdgeLengthInPositions*1000 + totalEdgeLengthInChildren;
    },

    edge_crossing: function(order, onlyRank, dontUseApproximationForRelationshipEdges)
    {
        // Counts edge crossings in the graph accoring to given node ordering.
        //
        // Iff onlyRank is defined, only counts edge crossings affected by re-ordering of
        // nodes on given rank.
        //
        // Assumes that edges always go from lower ranks to higher ranks or
        // between nodes on the same rank

        var numCrossings = 0.0;

        var rankFrom = onlyRank ? Math.max(1, onlyRank - 1) : 1;
        var rankTo   = onlyRank ? onlyRank : this.maxRank;

        //printObject(order);
        for (var r = rankFrom; r <= rankTo; r++) {
            var numVert = order.order[r].length;

            for (var i = 0; i < numVert - 1; i++) {   // -1 because we only check crossings of edges goigmn out of vertices of higher orders
                var v = order.order[r][i];

                var outEdges = this.GG.getOutEdges(v);
                var len      = outEdges.length;

                for (var j = 0; j < len; j++) {
                    var targetV = outEdges[j];

                    // special considerations: after ordering is done all relationship nodes will be
                    // re-ranked one level higher. In most cases the number of edge crossings is the
                    // same, however it may not be. For most cases the following heuristic results
                    // in optimal arrangement:
                    // for each relationship node add the number of crossings equal to the number of
                    // nodes on the parent rank between it's parents according to current ordering
                    if ( !dontUseApproximationForRelationshipEdges && this.GG.isRelationship(targetV) ) {
                        var parents  = this.GG.getInEdges(targetV);
                        var order1    = order.vOrder[parents[0]];
                        var order2    = order.vOrder[parents[1]];
                        var crossings = this.numNodesWithParentsInBetween(order, r, order1, order2);
                        numCrossings += crossings/2; // only assign it half a crossing because most will be fixed by transpose()
                                                     // - and if "1" is assigned transpose wont fix certain local cases
                    }

                    // so we have an edge v->targetV. Have to check how many edges
                    // between rank[v] and rank[targetV] this particular edge corsses.
                    numCrossings += this._edge_crossing_crossingsByOneEdge(order, v, targetV);
                }
            }
        }

        //if (!onlyRank)
        //    console.log("crossings: " + numCrossings);

        return numCrossings;
    },

    _edge_crossing_crossingsByOneEdge: function (order, v, targetV)
    {
        // Crossing occurs if either
        // 1) there is an edge going from rank[v]-ranked vertex with a smaller order
        //     than v to a rank[targetV]-ranked vertex with a larger order than targetV
        // 2) there is an edge going from rank[v]-ranked vertex with a larger order
        //     than v to a rank[targetV]-ranked vertex with a smaller order than targetV
        //
        // However we don't want to count each crossing twice (once for each edge), so
        // here we only count crossings in the 2nd case. The first case will be counted
        // when we process that other vertex

        var crossings = 0;

        var rankV = this.ranks[v];
        var rankT = this.ranks[targetV];

        var orderV = order.vOrder[v];
        var orderT = order.vOrder[targetV];

        if (rankV == rankT)
        {
            return this.numNodesWithParentsInBetween(order, rankV, orderV, orderT);
        }

        var verticesAtRankV = order.order[ rankV ];    // all vertices at rank V

        // edges from rankV to rankT: only those after v (orderV+1)
        for (var ord = orderV+1; ord < verticesAtRankV.length; ord++) {
            var vertex = verticesAtRankV[ord];

            var outEdges  = this.GG.getOutEdges(vertex);
            var len       = outEdges.length;

            for (var j = 0; j < len; j++) {
                var target = outEdges[j];

                var orderTarget = order.vOrder[target];

                if (orderTarget < orderT) {
                    crossings++;
                }
            }
        }

        return crossings;
    },

    numNodesWithParentsInBetween: function (order, rank, order1, order2)
    {
        // TODO!
        // TODO: treat special case of same-rank edges (relationship edges):
        //   - first, some may not cross because both source and target are between order1 & order2
        //   - second, it mya be an out edge not in edge, but still crosses as sourc eis inside, but target is outside [order1, order2]

        var numNodes = 0;
        var fromBetween = Math.min(order1, order2) + 1;
        var toBetween   = Math.max(order1, order2) - 1;
        for (var o = fromBetween; o <= toBetween; o++) {
            var b = order.order[rank][o];
            if (this.GG.getInEdges(b).length > 0)
                numNodes++;
        }
        return numNodes;
    },

    //-[wmedian]-------------------------------------------------------------------------
    wmedian: function(order, iter)
    {
        // The weighted median heuristic: depending on the parity of the current iteration number,
        // the ranks are traversed from top to bottom or from bottom to top.

        var changed = false;

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
                changed != this.sort_orders(order, r, median);
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
                changed != this.sort_orders(order, r, median);
            }
        }

        return changed;
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

        var changed = false;

        // update order.vOrder[] accordingly, based on how we just sorted order.order[]
        for (var i = 0; i < order.order[rank].length; i++) {
            var v = order.order[rank][i];
            if (order.vOrder[v] != i )     // if it is not already at what it is
            {
                order.vOrder[v] = i;
                changed = true;
            }
        }

        return changed;
    },
    //-------------------------------------------------------------------------[wmedian]-

    transpose: function(order, doMinorImprovements)
    {
        // for each rank: goes over all vertices in the rank and tries to switch orders of two
        //                adjacent vertices. If numCrossings is improved keeps the new order.
        //                repeats for each rank, and if there was an improvementg tries again.
        var improved = true;

        //if (doMinorImprovements) printObject(order);

        var iter = 0;
        while( improved )
        {
            iter++;
            if (!doMinorImprovements && iter > 4) break;

            improved = false;

            for (var r = 1; r <= this.maxRank; r++)
            {
                var numEdgeCrossings = this.edge_crossing(order, r);
                var edgeLengthScore  = doMinorImprovements ? this.edge_length_score(order,r) : 0;

                var maxIndex = order.order[r].length - 1;
                for (var i = 0; i < maxIndex; i++) {

                    var v1 = order.order[r][i];
                    var v2 = order.order[r][i+1];

                    order.exchange(r, i, i+1);

                    var newEdgeCrossings = this.edge_crossing(order, r);
                    var newLengthScore   = doMinorImprovements ? this.edge_length_score(order,r) : 0;

                    //if (doMinorImprovements)
                    //if ( v1 == 8 || v1 == 9 )  {
                    //    console.log("v = " + v1 + ", u = " + v2 + ", newScore= " + newEdgeCrossings +
                    //                ", lenScore= " + newLengthScore + ", oldScore= " + numEdgeCrossings +
                    //                ", oldLenScore= " + edgeLengthScore);
                    //}

                    // TODO: also transpose if more males/females end up on the preferred
                    //var maleFemaleScore  = ...

                    if (newEdgeCrossings < numEdgeCrossings ||
                        (newEdgeCrossings == numEdgeCrossings && newLengthScore < edgeLengthScore) ) {
                        // this was a good exchange, apply it to the current real ordering
                        improved = true;
                        numEdgeCrossings = newEdgeCrossings;
                        edgeLengthScore  = newLengthScore;
                        //if (doMinorImprovements)
                        //console.log("exchanged "+ v1 + " <-> " + v2);
                        if (!doMinorImprovements && numEdgeCrossings == 0) return 0; // still want to optimize for edge lengths
                    }
                    else {
                        // exchange back
                        order.exchange(r, i, i+1);
                    }
                }
            }
        }

        //if (doMinorImprovements) printObject(order);
    },

    transposeLongEdges: function(order, numCrossings, postReRanking)
    {
        if (numCrossings == 0)
            return numCrossings;

        var maxRealId = this.GG.getMaxRealVertexId();
        var numVert   = this.GG.getNumVertices();

        var checked = [];
        for (var v = maxRealId+1; v < numVert; v++)
            checked[v] = false;

        for (var v = maxRealId+1; v < numVert; v++) {

            if (checked[v] || this.ranks[v] == 0) continue;

            // find a long edge - an edge connecting real nodes of non-neighbouring ranks,
            // consisting of virtual vertices on intermediate ranks (plus source/target)

            // start from head node - the first virtual node
            var head = v;
            while (this.GG.isVirtual(this.GG.getInEdges(head)[0]))
                head = this.GG.getInEdges(head)[0];

            var chain = [];
            var next  = head;

            // go towards the tail through out-edges
            do {
                checked[next] = true;
                chain.push(next);
                next = this.GG.getOutEdges(next)[0];
            }
            while (this.GG.isVirtual(next));
            chain.push(next);

            var bestScore = numCrossings;
            var bestOrder = undefined;

            console.log("Optimizing long edge placement: chain " + stringifyObject(chain));

            // try to find best placement: brute force, try to reposition up to 3 pieces at a time simultaneously
            // checking all possible positions for the pieces in question up to 4 positions to the left or right
            if (chain.length <= 10) {
                var beforeChainEnd = 2;
                if (postReRanking)
                    beforeChainEnd = 4;
                for (var i = 0; i < chain.length-beforeChainEnd; i++) {

                    var piece1 = chain[i];
                    var piece2 = chain[i+1];
                    var piece3 = chain[i+2];

                    var rank1 = this.ranks[piece1];
                    var rank2 = this.ranks[piece2];
                    var rank3 = this.ranks[piece3];

                    var ord1  = order.vOrder[piece1];
                    var ord2  = order.vOrder[piece2];
                    var ord3  = order.vOrder[piece3];

                    //console.log("chain piece " + piece1 + ", " + piece2 + ", " + piece3);

                    for (var move1 = -4; move1 <= 4; move1++ ) {
                        for (var move2 = -4; move2 <= 4; move2++ ) {
                            for (var move3 = -4; move3 <= 4; move3++ ) {
                                if (move1 == 0 && move2 == 0 && move3 == 0) continue;

                                var newOrder = order.copy();
                                if (!newOrder.move(rank1, ord1, move1)) continue;
                                if (!newOrder.move(rank2, ord2, move2)) continue;
                                if (!newOrder.move(rank3, ord3, move3)) continue;

                                var newCross = this.edge_crossing(newOrder, false, postReRanking);
                                if (newCross < bestScore) {
                                    console.log("+");
                                    bestScore = newCross;
                                    bestOrder = [rank1, ord1, move1, rank2, ord2, move2, rank3, ord3, move3];
                                }
                            }
                        }
                    }
                }
            }

            if (bestScore < numCrossings) {
                if (!order.move(bestOrder[0], bestOrder[1], bestOrder[2])) throw "assert";
                if (!order.move(bestOrder[3], bestOrder[4], bestOrder[5])) throw "assert";
                if (!order.move(bestOrder[6], bestOrder[7], bestOrder[8])) throw "assert";
                numCrossings = bestScore;
            }

            if (numCrossings == 0) break;
        }

        return numCrossings;
    },
    //========================================================================[ordering]=

    //=====================================================================[re-ordering]=
    reRankRelationships: function() {
        // re-rank all relationship nodes to be on the same level as the lower ranked
        // parent. Attempt to place the re-ranked node next to one of the parents;
        // having ordering info helps to pick the parent & the location.
        // Note1: we may not be able to place a relationship node right next to a
        //        parent (because both parents already have a relationship node on the
        //        requested side), but we can always place it next to another
        //        relationship by the same parent.
        // Note2: also need to shorten incoming multi-rank edges by one node
        //        (see removeRelationshipRanks())

        var handled = {};

        // pass1: simple cases: parents are next to each other.
        //        looks better when all such cases are processed before more complicated cases
        //        (otherwise in case of say 3 relationship nodes may end up with two
        //         ugly placements (#2 and #3) instead of one (#2) when #2 becomes ugly)
        for (var i = 0; i < this.GG.getNumVertices(); i++) {
            if (this.GG.isRelationship(i)) {
    		    var parents = this.GG.getInEdges(i);

                // note: each "relationship" node is guaranteed to have exactly two "parent" nodes (validate() checks that)

		        if (this.ranks[parent[0]] != this.ranks[parent[1]])
		            throw "Assertion failed: edges betwen neighbouring ranks only";

                var order1 = this.order.vOrder[parents[0]];
                var order2 = this.order.vOrder[parents[1]];

                var minOrder = Math.min(order1, order2);
                var maxOrder = Math.max(order1, order2);

                // if parents are next to each other in the ordering
                if ( maxOrder == minOrder + 1 ) {
                    //console.log("=== is relationship: " + i + ", minOrder: " + minOrder + ", maxOrder: " + maxOrder );
                    this.moveVertexToRankAndOrder( i, this.ranks[parents[0]], maxOrder );
                    handled[i] = true;
                }
            }
        }

        // pass2: parents are not next to each other on the same rank
        for (var i = 0; i < this.GG.getNumVertices(); i++) {
            if (this.GG.isRelationship(i)) {
    		    var parents = this.GG.getInEdges(i);

                if ( handled.hasOwnProperty(i) )
                    continue; // this node has already been handled

                // rearrange so that parent0 is on the left - for simplicity in further logic
                if (this.order.vOrder[parents[0]] > this.order.vOrder[parents[1]])
                    parents.reverse();

                var rank = this.ranks[parents[0]];

                // 1. for each parent pick which side of the parent to use
                // 2. pick which parent is a better target:
                //    - prefer real over virtual nodes
                //      - in case of a virtual node move it to right next to new location of relationship node
                //    - prefer parent with no relationship node on the corect side
                //    - somewhere in the middle if both parents have other nodes on the preferred side:
                //      - try not to get inbetween well-placed relationships
                //      - count edge crossings (TODO)

                var insertOrder = undefined;

                if (this.GG.isVirtual(parents[0])) {
                    // parent 0 is virtual - use parent1
                    var parent0order = this.order.vOrder[parents[0]];
                    var intervalRight = this.order.vOrder[parents[1]];
                    var intervalLeft  = parent0order+1;
                    insertOrder = intervalRight;
                    for (var o = intervalRight; o >= intervalLeft; o--) {
                        var v = this.order.order[rank][o];
                        if (!this.GG.hasEdge(parents[1],v)) {
                            insertOrder = o+1;
                            break;
                        }
                    }
                    this.order.moveVertexToOrder(rank, parent0order, insertOrder);
                }
                else if (this.GG.isVirtual(parents[1])) {
                    // parent 1 is virtual - use parent0
                    var parent1order = this.order.vOrder[parents[1]];
                    var intervalRight = parent1order;
                    var intervalLeft  = this.order.vOrder[parents[0]] + 1;
                    insertOrder = intervalRight;
                    for (var o = intervalLeft; o <= intervalRight; o++) {
                        var v = this.order.order[rank][o];
                        if (!this.GG.hasEdge(parents[0],v)) {
                            //console.log("---> order: " + o);
                            insertOrder = o;
                            break;
                        }
                    }
                    this.order.moveVertexToOrder(rank, parent1order, insertOrder);
                }
                else {
                    // both parents are real
                    var order1 = this.order.vOrder[parents[0]];
                    var order2 = this.order.vOrder[parents[1]];

                    if (order2 == order1 + 1)
                        throw "Assertion failed: all relationship with parents next to each other are already handled";

                    var rightOfParent0 = this.order.order[rank][order1+1];
                    var leftOfParent1  = this.order.order[rank][order2-1];
                    //console.log("o1: " + order1 + ", o2: " + order2 + ", rp0: " + rightOfParent0 + ", lp1: " + leftOfParent1 );
                    var p0busy = false;
                    var p1busy = false;
                    if (this.GG.hasEdge(parents[0],rightOfParent0))
                        p0busy = true;
                    if (this.GG.hasEdge(parents[1],leftOfParent1))
                        p1busy = true;
                    if (p1busy && p0busy) {
                        // TODO: test this case
                        // both busy: find position which does not disturb "nice" relationship nodes
                        for (var o = order1+2; o <= order2-1; o++ ) {
                            var next = this.order.order[rank][o];
                            if (!this.GG.hasEdge(parents[0],next)) {
                                insertOrder = o;
                                break;
                            }
                        }
                    }
                    else if (p1busy) {
                        // p0 is free, p1 already has a relationship node next to it
                        insertOrder = order1+1;
                    }
                    else if (p0busy) {
                        // p1 is free, p0 already has a relationship node next to it
                        insertOrder = order2;
                    }
                    else {
                        // both p0 and p1 can have the relationship node right next to them
                        // for now arbitrarily pick p1
                        // TODO: try both pick the one with less crossed edges. Need a testcase
                        insertOrder = order2;
                    }
                }
                //console.log("=== is relationship: " + i + ", insertOrder: " + insertOrder );

                this.moveVertexToRankAndOrder( i, rank, insertOrder );
            }
        }

        this.removeRelationshipRanks();

        // after re-ranking there may be some orderings which are equivalent in terms
        // of the number of edge crossings, but more or less visually pleasing
        // depending on what kinds of edges are crossing.
        // Until re-ordering is done it is computationally harder to make these tests,
        // but once reordering is complete it is easy
        // (e.g: testcase 3A, relationship with both a parent and paren'ts child)
        this.improveOrdering();

        // after re-ordering long edges are shorter, try to improve long edge placement again
        var edgeCrossings = this.edge_crossing(this.order, false, true);
        this.transposeLongEdges( this.order, edgeCrossings, true );

        console.log("Final re-ordering: " + _printObjectInternal(this.order.order, 0));
        console.log("Final ranks: "  + stringifyObject(this.ranks));
    },

    moveVertexToRankAndOrder: function( v, newRank, newOrder ) {
        var oldRank  = this.ranks[v];
        var oldOrder = this.order.vOrder[v];

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

    improveOrdering: function()
    {
        //...
    },


    //=====================================================================[re-ordering]=

    //=[ancestors]=======================================================================
    findAllAncestors: function()
    {
        var ancestors = {};
        var consangr  = {};

        // got from low ranks to high ranks. For each node merge ancestors of its parents
        for (var r = 1; r <= this.maxRank; r++) {
            var nextRank = this.order.order[r];

            for (var i = 0; i < nextRank.length; i++) {
                var v = this.order.order[r][i];
                if (!this.GG.isPerson(v)) continue;
                ancestors[v] = {};
                ancestors[v][v] = 0;
                var parents = this.G.getParents(v);
                for (var j = 0; j < parents.length; j++) {
                    var familyBranch = ancestors[parents[j]];

                    for (var u in familyBranch) {
                        if (familyBranch.hasOwnProperty(u)) {
                            if (ancestors[v].hasOwnProperty(u)) {   // relatives found!
                                //console.log("relatives: " + v + " and " + u);
                                var rel = this.G.getProducingRelationship(v);
                                consangr[rel] = true;
                                ancestors[v][u] = Math.min( familyBranch[u] + 1, ancestors[v][u] );
                            }
                            else
                                ancestors[v][u] = familyBranch[u] + 1;
                        }
                    }
                }
            }
        }

        //printObject(ancestors);

        return {ancestors: ancestors, consangr: consangr};
    },
    //=======================================================================[ancestors]=

    //=[vertical separation for horizontal edges]========================================
    positionVertically: function()
    {
        var verticalLevels = new VerticalLevels();

        // for each rank:
        // 1) if rank has childhub nodes:
        //    a) for each vertex on the rank, in the ordering order
        //    b) if only one child - skip (it will be  avertical not horizontal edge)
        //    c) check if any edges cross any edges of the vertices earlier in the order
        //    d) if yes, add that level to the set of forbidden levels
        //    e) pick minimum level which is not forbidden
        //
        // 2) if rank has "person" and "relationship" nodes
        //    a) for each "person" vertex on the rank, in the ordering order
        //    b) for each edge which is not going to a neighbouring node
        //    c) ... ?

        // note: using very inefficient O(childnodes^2 * childnode_outedges^2) algorithm, which runs very fast though

        /// TODO: hack for debugging when reRankRelationships() may be omitted
        var _startRank = 2;
        var _rankStep = 2;
        for (var i = 0; i<this.order.order[_startRank].length; i++)
            if ( !this.GG.isVirtual(this.order.order[_startRank][i]) && !this.GG.isChildhub( this.order.order[_startRank][i] ) )
            {
                _startRank = 3;
                _rankStep  = 3;
                break;
            }

        for (var r = 1; r <= this.maxRank; r+=1)
            verticalLevels.rankVerticalLevels[r] = 1;    // number of levels between rank r and r+1. Start with 1

        var shiftBelowNodes = {};

        // 1) go over childnode ranks.
        for (var r = _startRank; r <= this.maxRank; r+=_rankStep) {

            var len = this.order.order[r].length;
            for (var i = 0; i < len; i++) {
                var v   = this.order.order[r][i];
                var v_x = this.positions[v];

                var parent   = this.GG.getInEdges(v)[0];
                var parent_x = this.positions[parent];

                var forbiddenLevels = {};                // levels which can't be used by v. Initially none

                var doShift = false;
                shiftBelowNodes[v] = {};                // nodes to the left shift below to avoid crossings between their right and our parent-to-childhub

                if (this.GG.isVirtual(v)) continue;
                if (!this.GG.isChildhub(v)) throw "Assertion failed: childhub nodes at every other rank ("+v+")";

                var outEdges = this.GG.getOutEdges(v);
                for (var j = 0; j < outEdges.length; j++) {
                    var target      = outEdges[j];
                    var targetOrder = this.order.vOrder[target];
                    var targetX     = this.positions[target];

                    var minX = Math.min( v_x, targetX, parent_x );
                    var maxX = Math.max( v_x, targetX, parent_x );

                    // check if this edge {v,targetV} crosses any edges of the vertices earlier in the order

                    for (var ord = 0; ord < i; ord++) {
                        var u     = this.order.order[r][ord];
                        var edges = this.GG.getOutEdges(u);
                        var u_x   = this.positions[u];

                        var parent_u   = this.GG.getInEdges(u)[0];
                        var parent_u_x = this.positions[parent_u];

                        for (var k = 0; k < edges.length; k++) {
                            var otherTarget = edges[k];
                            var otherOrder  = this.order.vOrder[otherTarget];

                            if (otherOrder > targetOrder) {
                                // crossing detected
                                forbiddenLevels[verticalLevels.childEdgeLevel[u]] = true;
                            }

                            // also a crossing occurs when other children are under the node, in which
                            // case the horizontal childline crosses the other horizontal child line (even though
                            // the direct edges do not cross) - as in testcase "ms_004"
                            var otherX = this.positions[otherTarget];
                            var minOtherX = Math.min( u_x, otherX, parent_u_x );
                            var maxOtherX = Math.max( u_x, otherX, parent_u_x );

                            if ( (minOtherX >= minX && minOtherX <= maxX) ||
                                 (maxOtherX >= minX && maxOtherX <= maxX) ) {
                                for (var l = 1; l <= verticalLevels.childEdgeLevel[u]; l++)
                                    forbiddenLevels[l] = true;
                            }

                            if ( parent_x <= maxOtherX ) {
                                shiftBelowNodes[v][u] = true;
                                doShift = true;
                                delete forbiddenLevels[verticalLevels.childEdgeLevel[u]];
                            }
                        }
                    }
                }

                //find the minimum level not in forbiddenLevels
                var useLevel = 1;
                while ( forbiddenLevels.hasOwnProperty(useLevel) )
                    useLevel++;

                verticalLevels.childEdgeLevel[v] = useLevel;

                if (useLevel > verticalLevels.rankVerticalLevels[r])
                    verticalLevels.rankVerticalLevels[r] = useLevel;

                if (doShift) {
                    var maxShiftRank = Infinity;
                    for (var adjNode in shiftBelowNodes[v])
                        if (shiftBelowNodes[v].hasOwnProperty(adjNode))
                            maxShiftRank = Math.min(verticalLevels.childEdgeLevel[adjNode], maxShiftRank);

                    // shift all affected nodes AND all nodes that they affect etc
                    var shiftAmount = (useLevel+1) - maxShiftRank;

                    //console.log("------- Processing: " + v);
                    //printObject(shiftBelowNodes);
                    //console.log("Shift amount: " + shiftAmount);

                    var doneProcessing = {};

                    var shiftNodes = new Queue();
                    shiftNodes.push(v)

                    while ( shiftNodes.size() > 0 ) {
                        var nextToShift = shiftNodes.pop();

                        if (doneProcessing.hasOwnProperty(nextToShift)) continue;  // to avoid infinite mutual dependency loop
                        doneProcessing[nextToShift] = true;

                        for (var adjNode in shiftBelowNodes[nextToShift]) {
                            if (shiftBelowNodes[nextToShift].hasOwnProperty(adjNode)) {
                                verticalLevels.childEdgeLevel[adjNode] += shiftAmount;

                                if ( verticalLevels.childEdgeLevel[adjNode] > verticalLevels.rankVerticalLevels[r] )
                                    verticalLevels.rankVerticalLevels[r] = verticalLevels.childEdgeLevel[adjNode];

                                shiftNodes.push(adjNode);
                            }
                        }
                        //console.log(stringifyObject(verticalLevels.childEdgeLevel));
                    }
                }
            }
        }


        // 2) go over person ranks.
        // TODO

        return verticalLevels;
    },
    //========================================[vertical separation for horizontal edges]=

    //=[position]========================================================================

    displayGraph: function(xcoord, message)
    {
        var renderPackage = { convertedG: this.GG,
                              ranks:      this.ranks,
                              ordering:   this.order,
                              positions:  xcoord,
                              consangr:   this.consangr };

        debug_display_processed_graph(renderPackage, 'output', true, message);
    },

    position: function(horizontalPersonSeparationDist, horizontalRelSeparationDist)
    {
        var xcoord = this.init_xcoord(horizontalPersonSeparationDist, horizontalRelSeparationDist);
        //printObject(xcoord.xcoord);

        //this.displayGraph(xcoord.xcoord, 'init');

        this.try_shift_right(xcoord, true, false);
        this.try_shift_left (xcoord);
        this.try_shift_right(xcoord, false, true);
        this.try_shift_left (xcoord);
        xcoord.normalize();

        //this.displayGraph(xcoord.xcoord, 'firstAdj');
        printObject(xcoord.xcoord);

        var xbest     = xcoord.copy();
        var bestScore = this.xcoord_score(xbest);

        for ( var i = 0; i <= this.maxXcoordIterations; i++ )
        {
            this.try_shift_right(xcoord, true, true);
            this.try_shift_left (xcoord);
            this.try_straighten_long_edges(xcoord);

            //this.displayGraph(xcoord.xcoord, 'Adj' + i);

            xcoord.normalize();

            var score = this.xcoord_score(xcoord);

            if (score.isBettertThan(bestScore)) {
                xbest = xcoord.copy();
                bestScore = score;
            }
            else
                break;
        }

        this.displayGraph(xbest.xcoord, 'final');
        printObject(xbest.xcoord);

        return xbest.xcoord;
    },

    xcoord_score: function( xcoord,
                            considerOnlyRank, considerEdgesFromAbove, considerEdgesToBelow,
                            fromOrderOnRank )
    {
        // Returns xcoord score, the less the better.
        //
        //  Score equal to the     Σ     (  Ω(e) * ω(e) * X[w] − X[v]  )
        //                      e = (v,w)
        //
        //   where  Ω(e) is an internal value distinct from the input edge weight ω(e),
        //   defined to favor straightening long edges and edges from relationships to child nodes:
        //   - for long edges, it is more important to reduce the horizontal distance between virtual
        //   nodes, so chains may be aligned vertically and thus straightened. The failure to
        //   straighten long edges can result in a ‘‘spaghetti effect’’. Thus Ω(e) is higher for
        //   edges between virtual edges
        //   - for relationship-to-child nodes, it just produces a visually more pleasing arrangement
        //   - Ω(e) is computed by the edge_importance_to_straighten() function

        var score = new XCoordScore(this.GG.getMaxRealVertexId());

        var rankFrom = 1;
        var rankTo   = this.maxRank;
        if (typeof(considerOnlyRank) != "undefined") {
            // we have edges:
            //   1) r-1 -> r
            //   2) r   -> r
            //   3) r   -> r+1
            // If not consider above, need to exclude edges of type 1
            // If not consider below, need to exclude edges of type 3
            // Always care about edges of type 2

            rankFrom = considerOnlyRank-1;
            rankTo   = considerOnlyRank;
            if (rankFrom == 0) rankFrom = 1;
            if (!considerEdgesFromAbove) rankFrom = considerOnlyRank;  // exclude edges of type 1
        }

        for (var r = rankFrom; r <= rankTo; r++) {
            var len = this.order.order[r].length;

            var fromOrder = 0;
            if (typeof(considerOnlyRank) != "undefined" && r == considerOnlyRank)
                fromOrder = fromOrderOnRank;

            for (var i = fromOrder; i < len; i++) {
                var v = this.order.order[r][i];

                var outEdges = this.GG.getOutEdges(v);
                var lenO     = outEdges.length;

                for (var j = 0; j < lenO; j++) {
                    var u = outEdges[j];

                    if (typeof(considerOnlyRank) != "undefined") {
                        if (!considerEdgesToBelow && this.ranks[u] != considerOnlyRank)  // exclude edges of type 3
                            continue;
                        if (this.ranks[u] == considerOnlyRank && this.order.vOrder[u] < fromOrderOnRank)
                            continue;
                        //if (considerEdgesFromAbove && considerEdgesToBelow && this.ranks[u] == considerOnlyRank && this.GG.isRelationship(v))
                        //    continue;
                    }

                    // have an edge from 'v' to 'u' with weight this.GG.weights[v][u]

                    // determine edge type: from real vertex to real, real to/from virtual or v. to v.
                    var coeff = this.edge_importance_to_straighten(v, u);

                    var w = this.xCoordEdgeWeightValue ? this.GG.weights[v][u] : 1.0;

                    var dist = Math.abs(xcoord.xcoord[v] - xcoord.xcoord[u]);

                    var thisScore = coeff * w * dist;

                    //if (this.GG.isChildhub(v)) thisScore *= Math.min( 15.0, dist );
                    //if (mostCompact) thisScore *= dist;  // place higher value on shorter edges

                    score.add(thisScore);
                    score.addEdge(v, u, dist);
                }
            }
        }

        //console.log("XcoordScore: " + stringifyObject(score));
        return score;
    },

    edge_importance_to_straighten: function(fromV, toV) {
        var coeff = 2.0;

        if (!this.GG.isVirtual(fromV) && this.GG.isRelationship(toV)) coeff = 1.0;

        if (this.GG.isRelationship(fromV)) coeff = 8.0;

        if (this.GG.isVirtual(fromV) && this.GG.isVirtual(toV)) coeff = 16.0;
        else
        if (this.GG.isVirtual(fromV) || this.GG.isVirtual(toV)) coeff = 4.0;

        return coeff;
    },

    init_xcoord: function(horizontalPersonSeparationDist, horizontalRelSeparationDist)
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

                var horizSeparation = horizontalPersonSeparationDist;
                if ( this.GG.isRelationship(v) )
                    horizSeparation = horizontalRelSeparationDist;
                if ( i < this.order.order[r].length-1 && this.GG.isRelationship(this.order.order[r][i+1]) )
                    horizSeparation = horizontalRelSeparationDist;

                xThisRank += vWidth*2 + horizSeparation;
            }
        }

        var xcoord = new XCoord();
        xcoord.init(xinit, horizontalPersonSeparationDist, horizontalRelSeparationDist,
                    this.GG.vWidth, this.order, this.ranks, this.GG.type);

        return xcoord;
    },

    try_shift_right: function(xcoord, scoreQualityOfNodesBelow, scoreQualityOfNodesAbove)
    {
        // somewhat similar to transpose: goes over all ranks (top to bottom or bottom to top,
        // depending on iteration) and tries to shift vertices right one at a time. If a shift
        // is good leaves it, if not keeps going further.
        //
        // more precisely, tries to shift the vertex to the desired position up to and including
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

            var considerEdgesToBelow   = (scoreQualityOfNodesBelow || (r == 1)) && (r != this.maxRank);
            var considerEdgesFromAbove = (scoreQualityOfNodesAbove || r == this.maxRank) && (r != 1);

            var toO   = 0;
            var fromO = this.order.order[r].length - 1;

            for (var i = fromO; i >= toO; i--) {

                var v = this.order.order[r][i];

                // we care about the quality of resulting graph only for some ranks: sometimes
                // only above the change, sometimes only below the change; in any case we know
                // the change of position of vertices on this rank is not going to affect ranks
                // far away, so we can only compute the score for the ranks we care about.

                var median = this.compute_median(v, xcoord, considerEdgesFromAbove, considerEdgesToBelow);
                if (median != median)
                    median = xcoord.xcoord[v];

                var maxShift = median - xcoord.xcoord[v];

                // speed optimization: shift which we can do without disturbing other vertices and
                //                     thus requiring no backup/restore process
                var noDisturbMax = xcoord.getRightMostNoDisturbPosition(v);
                var maxSafeShift = (noDisturbMax < median) ? noDisturbMax - xcoord.xcoord[v] : maxShift;

                //if (v==9 || v == 10)
                //    console.log("shiftright-rank-" + r + "-v-" + v + "  -->  DesiredShift: " + maxShift + ", maxSafe: " + maxSafeShift);

                if (maxShift <= 0) continue;

                var bestShift = 0;
                var bestScore = this.xcoord_score(xcoord, r, considerEdgesFromAbove, considerEdgesToBelow, i);
                var shiftAmount = maxShift;

                //if ( r == 7 ) this.displayGraph( xcoord.xcoord, "shiftright-rank-" + r + "-v-" + v + "(before)");

                do
                {
                    var newScore;

                    if (shiftAmount <= maxSafeShift)
                    {
                        xcoord.xcoord[v] += shiftAmount;
                        newScore = this.xcoord_score(xcoord, r, considerEdgesFromAbove, considerEdgesToBelow, i);
                        xcoord.xcoord[v] -= shiftAmount;
                    }
                    else
                    {
                        var newCoord = xcoord.copy();
                        newCoord.shiftRightAndShiftOtherIfNecessary(v, shiftAmount);
                        newScore = this.xcoord_score(newCoord, r, considerEdgesFromAbove, considerEdgesToBelow, i);
                    }

                    //if (v==9 || v == 10)
                    //    console.log("Shift: " + shiftAmount + ", score: " + newScore.score + " / " + stringifyObject(newScore.inEdgeMaxLen));

                    if (newScore.isBettertThan(bestScore)) {
                        bestShift = shiftAmount
                        bestScore = newScore;
                    }

                    shiftAmount -= 1;
                }
                while (shiftAmount >= Math.max(0, maxSafeShift-2));

                if (bestShift > 0) {
                    xcoord.shiftRightAndShiftOtherIfNecessary(v, bestShift);
                }
                //if ( r == 7 ) this.displayGraph( xcoord.xcoord, "shiftright-rank-" + r + "-v-" + v );
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
                var weight = allEdgesWithWeights[u]["weight"];

                var coeff = allEdgesWithWeights[u]["out"] ?
                            this.edge_importance_to_straighten(v, u) :
                            this.edge_importance_to_straighten(u, v);

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

    try_shift_left: function (xcoord)
    {
        // similar to try_shift_right, but attempts to shift left: searches positions from
        // current to leftmost possible (withotu moving other vertices), looking for the locally
        // best position.
        // (note the diff. with try_shift_right which may produce new not-yet-seen arrangements is
        //  that this shifts at most one vertex, while shift_right may shift many)

        //this.displayGraph( xcoord.xcoord, "shiftleft-start" );

        for (var r = 1; r <= this.maxRank; r++) {

            var fromO = 0;
            var toO   = this.order.order[r].length;

            for (var i = fromO; i < toO; i++) {
                //printObject(xcoord.xcoord);

                var v = this.order.order[r][i];

                var initScore = this.xcoord_score(xcoord, r, true, true, i);

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

                    var newScore = this.xcoord_score(xcoord, r, true, true, i);

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
    var horizontalPersonSeparationDist = 8;  // same relative units as in intenalG.width fields. Distance between persons
    var horizontalRelSeparationDist    = 6;  // same relative units as in intenalG.width fields. Distance between persons

    var orderingInitBuckets = 5;             // default: 5. It may take up to ~factorial_of_this_number iterations. See ordering()

    var orderingIterations  = 24;            // paper used: 24. Up to so many iterations are spent optimizing initial ordering

    var xcoordIterations    = 4;             // default: 8

    var timer = new Timer();

    var drawGraph = new DrawGraph( internalG,
                                   horizontalPersonSeparationDist,
                                   horizontalRelSeparationDist,
                                   orderingInitBuckets,
                                   orderingIterations,
                                   xcoordIterations );

    console.log( "=== Running time: " + timer.report() + "ms ==========" );

    return new PositionedGraph(drawGraph);
}

